package sdk

import (
	"os"
	"sync"

	"github.com/hashicorp/go-plugin"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	goplugin "github.com/sailpoint-oss/telescope/server/plugin"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// PluginInstance accumulates rules defined via the SDK and serves them
// as a telescope plugin binary over the go-plugin RPC protocol.
type PluginInstance struct {
	name    string
	version string

	mu        sync.Mutex
	analyzers map[string]treesitter.Analyzer
	metas     []rules.RuleMeta
}

// NewPlugin creates a new plugin instance with the given name and version.
func NewPlugin(name, version string) *PluginInstance {
	return &PluginInstance{
		name:      name,
		version:   version,
		analyzers: make(map[string]treesitter.Analyzer),
	}
}

func (p *PluginInstance) addRule(id string, analyzer treesitter.Analyzer) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.analyzers[id] = analyzer
	meta, ok := rules.DefaultRegistry.Get(id)
	if ok {
		p.metas = append(p.metas, meta)
	}
}

// Serve starts the plugin RPC server. This blocks until the host disconnects.
// Call this as the last line in main().
func (p *PluginInstance) Serve() {
	plugin.Serve(&plugin.ServeConfig{
		HandshakeConfig: goplugin.Handshake,
		Plugins: map[string]plugin.Plugin{
			"rules": &goplugin.RulePluginRPC{
				Impl: &pluginServer{instance: p},
			},
		},
	})
}

// pluginServer implements goplugin.RulePlugin by running registered
// analyzers against incoming documents.
type pluginServer struct {
	instance *PluginInstance
}

func (s *pluginServer) GetMeta() (*goplugin.GetMetaResponse, error) {
	s.instance.mu.Lock()
	metas := make([]goplugin.PluginRuleMeta, len(s.instance.metas))
	for i, m := range s.instance.metas {
		metas[i] = goplugin.PluginRuleMeta{
			ID:          m.ID,
			Description: m.Description,
			Severity:    severityFromInt(int(m.Severity)),
			Category:    string(m.Category),
			Recommended: m.Recommended,
			HowToFix:    m.HowToFix,
			DocURL:      m.DocURL,
		}
	}
	s.instance.mu.Unlock()
	return &goplugin.GetMetaResponse{Rules: metas}, nil
}

func (s *pluginServer) Analyze(req *goplugin.AnalyzeRequest) (*goplugin.AnalyzeResponse, error) {
	idx := openapi.ParseAndIndex(req.Content)

	s.instance.mu.Lock()
	analyzers := make(map[string]treesitter.Analyzer, len(s.instance.analyzers))
	for k, v := range s.instance.analyzers {
		analyzers[k] = v
	}
	s.instance.mu.Unlock()

	var allDiags []goplugin.PluginDiagnostic
	for id, analyzer := range analyzers {
		ctx := &treesitter.AnalysisContext{
			UserData: idx,
		}
		diags := analyzer.Run(ctx)
		for _, d := range diags {
			allDiags = append(allDiags, goplugin.PluginDiagnostic{
				StartLine: d.Range.Start.Line,
				StartChar: d.Range.Start.Character,
				EndLine:   d.Range.End.Line,
				EndChar:   d.Range.End.Character,
				Severity:  severityFromInt(int(d.Severity)),
				Code:      diagnosticCode(d),
				Message:   d.Message,
				Source:    pluginSource(d.Source, s.instance.name, id),
			})
		}
	}

	return &goplugin.AnalyzeResponse{Diagnostics: allDiags}, nil
}

func diagnosticCode(d protocol.Diagnostic) string {
	if s, ok := d.Code.(string); ok {
		return s
	}
	return ""
}

func pluginSource(src, pluginName, ruleID string) string {
	if src != "" {
		return src
	}
	return pluginName
}

// severityFromInt converts a severity code (1=error, 2=warn, 3=info, 4=hint) to string.
// Works with both ctypes.Severity and protocol.DiagnosticSeverity.
func severityFromInt(sev int) string {
	switch sev {
	case 1:
		return "error"
	case 2:
		return "warn"
	case 3:
		return "info"
	case 4:
		return "hint"
	default:
		return "warn"
	}
}

// stringToSeverity converts a severity string to a core severity.
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

// isRunningAsPlugin detects if this binary was launched by go-plugin.
func isRunningAsPlugin() bool {
	return os.Getenv("PLUGIN_MIN_PORT") != ""
}
