package plugin

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	goplugin "github.com/hashicorp/go-plugin"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/rules"
)

const pluginAnalyzeTimeout = 10 * time.Second

// RunningPlugin tracks a single launched plugin subprocess.
type RunningPlugin struct {
	name   string
	client *goplugin.Client
	rule   RulePlugin
	metas  []PluginRuleMeta
}

// Host discovers, launches, and communicates with external plugin binaries.
// Each plugin runs as a subprocess and communicates via go-plugin RPC.
type Host struct {
	mu      sync.Mutex
	plugins map[string]*RunningPlugin
	logger  *slog.Logger
}

// NewHost creates a plugin host.
func NewHost(logger *slog.Logger) *Host {
	return &Host{
		plugins: make(map[string]*RunningPlugin),
		logger:  logger,
	}
}

// Discover finds and launches plugin executables from the given directory.
// Each executable in the directory is treated as a separate plugin.
func (h *Host) Discover(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read plugin dir %s: %w", dir, err)
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.Mode()&0111 == 0 {
			continue
		}
		if err := h.LoadPlugin(path); err != nil {
			h.logger.Warn("failed to load plugin", "path", path, "error", err)
		}
	}
	return nil
}

// LoadPlugin launches a single plugin binary and registers it.
func (h *Host) LoadPlugin(path string) error {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return fmt.Errorf("resolve plugin path: %w", err)
	}

	client := goplugin.NewClient(&goplugin.ClientConfig{
		HandshakeConfig: Handshake,
		Plugins:         PluginMap,
		Cmd:             exec.Command(absPath),
		Logger:          newHCLogger(h.logger),
	})

	rpcClient, err := client.Client()
	if err != nil {
		client.Kill()
		return fmt.Errorf("connect to plugin %s: %w", path, err)
	}

	raw, err := rpcClient.Dispense("rules")
	if err != nil {
		client.Kill()
		return fmt.Errorf("dispense rules from %s: %w", path, err)
	}

	rulePlugin, ok := raw.(RulePlugin)
	if !ok {
		client.Kill()
		return fmt.Errorf("plugin %s does not implement RulePlugin", path)
	}

	metaResp, err := rulePlugin.GetMeta()
	if err != nil {
		client.Kill()
		return fmt.Errorf("get meta from %s: %w", path, err)
	}

	name := filepath.Base(path)

	for _, m := range metaResp.Rules {
		rules.DefaultRegistry.Register(rules.RuleMeta{
			ID:          m.ID,
			Description: m.Description,
			Severity:    stringToSeverity(m.Severity),
			Category:    rules.Category(m.Category),
			Recommended: m.Recommended,
			HowToFix:    m.HowToFix,
			DocURL:      m.DocURL,
		})
	}

	h.mu.Lock()
	h.plugins[name] = &RunningPlugin{
		name:   name,
		client: client,
		rule:   rulePlugin,
		metas:  metaResp.Rules,
	}
	h.mu.Unlock()

	h.logger.Info("loaded plugin", "name", name, "rules", len(metaResp.Rules))
	return nil
}

// Analyzer returns a treesitter.Analyzer that dispatches to all loaded plugins.
// Each document change triggers a single RPC call to each plugin.
func (h *Host) Analyzer() treesitter.Analyzer {
	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if ctx.Document == nil {
				return nil
			}
			content := []byte(ctx.Document.Text())
			uri := string(ctx.Document.URI())

			h.mu.Lock()
			plugins := make([]*RunningPlugin, 0, len(h.plugins))
			for _, p := range h.plugins {
				plugins = append(plugins, p)
			}
			h.mu.Unlock()

			var allDiags []protocol.Diagnostic
			for _, p := range plugins {
				resp, err := h.analyzeWithTimeout(p, &AnalyzeRequest{
					URI:     uri,
					Content: content,
				})
				if err != nil {
					h.logger.Warn("plugin analyze failed",
						"plugin", p.name, "error", err)
					continue
				}
				for _, d := range resp.Diagnostics {
					allDiags = append(allDiags, protocol.Diagnostic{
						Range: protocol.Range{
							Start: protocol.Position{Line: d.StartLine, Character: d.StartChar},
							End:   protocol.Position{Line: d.EndLine, Character: d.EndChar},
						},
						Severity: adapt.SeverityToProtocol(stringToSeverity(d.Severity)),
						Source:   sourceOrDefault(d.Source, p.name),
						Code:     d.Code,
						Message:  d.Message,
					})
				}
			}
			return allDiags
		},
	}
}

// AnalyzeDirect runs all plugins against content and returns diagnostics.
// Used by the CLI where there is no DiagnosticEngine.
func (h *Host) AnalyzeDirect(uri string, content []byte) []protocol.Diagnostic {
	h.mu.Lock()
	plugins := make([]*RunningPlugin, 0, len(h.plugins))
	for _, p := range h.plugins {
		plugins = append(plugins, p)
	}
	h.mu.Unlock()

	var allDiags []protocol.Diagnostic
	for _, p := range plugins {
		resp, err := h.analyzeWithTimeout(p, &AnalyzeRequest{
			URI:     uri,
			Content: content,
		})
		if err != nil {
			h.logger.Warn("plugin analyze failed", "plugin", p.name, "error", err)
			continue
		}
		for _, d := range resp.Diagnostics {
			allDiags = append(allDiags, protocol.Diagnostic{
				Range: protocol.Range{
					Start: protocol.Position{Line: d.StartLine, Character: d.StartChar},
					End:   protocol.Position{Line: d.EndLine, Character: d.EndChar},
				},
				Severity: adapt.SeverityToProtocol(stringToSeverity(d.Severity)),
				Source:   sourceOrDefault(d.Source, p.name),
				Code:     d.Code,
				Message:  d.Message,
			})
		}
	}
	return allDiags
}

// Shutdown kills all running plugin subprocesses.
func (h *Host) Shutdown() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for name, p := range h.plugins {
		p.client.Kill()
		h.logger.Info("stopped plugin", "name", name)
	}
	h.plugins = make(map[string]*RunningPlugin)
}

// PluginCount returns the number of loaded plugins.
func (h *Host) PluginCount() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.plugins)
}

func (h *Host) analyzeWithTimeout(p *RunningPlugin, req *AnalyzeRequest) (*AnalyzeResponse, error) {
	type result struct {
		resp *AnalyzeResponse
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		resp, err := p.rule.Analyze(req)
		ch <- result{resp, err}
	}()
	select {
	case r := <-ch:
		return r.resp, r.err
	case <-time.After(pluginAnalyzeTimeout):
		return nil, fmt.Errorf("plugin %s analyze timed out after %s", p.name, pluginAnalyzeTimeout)
	}
}

func stringToSeverity(s string) ctypes.Severity {
	switch s {
	case "error":
		return ctypes.SeverityError
	case "warn", "warning":
		return ctypes.SeverityWarning
	case "info", "information":
		return ctypes.SeverityInfo
	case "hint":
		return ctypes.SeverityHint
	default:
		return ctypes.SeverityWarning
	}
}

func sourceOrDefault(source, fallback string) string {
	if source != "" {
		return source
	}
	return fallback
}
