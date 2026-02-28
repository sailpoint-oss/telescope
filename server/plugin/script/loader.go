package script

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// Loader discovers, validates, and manages JS/TS rule scripts from a directory.
type Loader struct {
	mu      sync.RWMutex
	scripts []*ScriptRule
	logger  *slog.Logger
}

// NewLoader creates a script loader.
func NewLoader(logger *slog.Logger) *Loader {
	return &Loader{logger: logger}
}

// LoadDir discovers and loads all .js and .ts files from the given directory.
// Declaration files (.d.ts) are skipped.
func (l *Loader) LoadDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read script dir %s: %w", dir, err)
	}

	var scripts []*ScriptRule
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(entry.Name(), ".d.ts") {
			continue
		}
		ext := filepath.Ext(entry.Name())
		if ext != ".js" && ext != ".ts" {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		rule, err := l.loadScript(path)
		if err != nil {
			l.logger.Warn("failed to load rule", "path", path, "error", err)
			continue
		}
		scripts = append(scripts, rule)
		l.logger.Info("loaded rule", "id", rule.Meta.ID, "path", path)
	}

	l.mu.Lock()
	l.scripts = scripts
	l.mu.Unlock()

	// Register metadata for loaded scripts
	for _, s := range scripts {
		rules.DefaultRegistry.Register(rules.RuleMeta{
			ID:          s.Meta.ID,
			Description: s.Meta.Description,
			Severity:    parseSeverity(s.Meta.Severity),
			Category:    rules.Category(s.Meta.Category),
		})
	}

	return nil
}

func (l *Loader) loadScript(path string) (*ScriptRule, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	source := string(data)
	if filepath.Ext(path) == ".ts" {
		transpiled, err := TranspileTS(source)
		if err != nil {
			return nil, fmt.Errorf("transpile %s: %w", path, err)
		}
		source = transpiled
	}

	meta, ok := ParseScriptMeta(source)
	if !ok {
		return nil, fmt.Errorf("%s: missing or invalid exports.meta (must have 'id')", path)
	}

	return &ScriptRule{
		Path:   path,
		Meta:   meta,
		Source: source,
	}, nil
}

// Reload re-reads all scripts from their original directory.
func (l *Loader) Reload(dir string) error {
	return l.LoadDir(dir)
}

// Analyzer returns a treesitter.Analyzer that runs all loaded JS/TS scripts.
func (l *Loader) Analyzer() treesitter.Analyzer {
	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			l.mu.RLock()
			scripts := make([]*ScriptRule, len(l.scripts))
			copy(scripts, l.scripts)
			l.mu.RUnlock()

			if len(scripts) == 0 {
				return nil
			}

			// Get the OpenAPI index from context
			idx, ok := ctx.UserData.(*openapi.Index)
			if !ok || idx == nil {
				return nil
			}

			var allDiags []protocol.Diagnostic
			for _, script := range scripts {
				diags := script.Execute(idx)
				allDiags = append(allDiags, diags...)
			}
			return allDiags
		},
	}
}

// AnalyzeDirect runs all scripts against content for CLI use.
func (l *Loader) AnalyzeDirect(content []byte) []protocol.Diagnostic {
	l.mu.RLock()
	scripts := make([]*ScriptRule, len(l.scripts))
	copy(scripts, l.scripts)
	l.mu.RUnlock()

	if len(scripts) == 0 {
		return nil
	}

	idx := openapi.ParseAndIndex(content)
	var allDiags []protocol.Diagnostic
	for _, script := range scripts {
		diags := script.Execute(idx)
		allDiags = append(allDiags, diags...)
	}
	return allDiags
}

// ScriptCount returns the number of loaded scripts.
func (l *Loader) ScriptCount() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.scripts)
}
