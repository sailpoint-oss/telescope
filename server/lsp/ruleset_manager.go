package lsp

import (
	"log/slog"
	"path/filepath"
	"sync"

	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/rulesets"
	"github.com/sailpoint-oss/telescope/server/spectral"
)

// RulesetManager coordinates ruleset loading, merging, and application. It
// owns the DiagnosticTransformer lifecycle and the Spectral custom rule engine.
type RulesetManager struct {
	mu            sync.Mutex
	workspaceRoot string
	telescopeCfg  *config.Config
	spectralRS    *rulesets.RuleSet
	resolved      *rulesets.RuleSet
	engine        *treesitter.DiagnosticEngine
	spectralEng   *spectral.Engine
	logger        *slog.Logger
}

// NewRulesetManager creates a new manager bound to a DiagnosticEngine.
func NewRulesetManager(engine *treesitter.DiagnosticEngine, logger *slog.Logger) *RulesetManager {
	return &RulesetManager{
		engine: engine,
		logger: logger,
	}
}

// SpectralEngine returns the Spectral custom rule engine, creating one if it
// does not yet exist. The engine is registered as an analyzer on first access.
func (m *RulesetManager) SpectralEngine() *spectral.Engine {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.spectralEng == nil {
		m.spectralEng = spectral.NewEngine(nil, m.logger)
	}
	return m.spectralEng
}

// Load discovers and loads both Telescope config and Spectral rulesets from
// the workspace root, resolves extends chains, merges them, and installs the
// DiagnosticTransformer on the engine.
func (m *RulesetManager) Load(workspaceRoot string) error {
	m.mu.Lock()
	m.workspaceRoot = workspaceRoot
	m.mu.Unlock()

	return m.reload()
}

// Reload re-discovers and re-loads all rulesets, updates the transformer, and
// invalidates all cached diagnostics to trigger re-evaluation.
func (m *RulesetManager) Reload() error {
	if err := m.reload(); err != nil {
		return err
	}
	m.engine.InvalidateAll()
	return nil
}

func (m *RulesetManager) reload() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Load Spectral ruleset
	spectralRS, err := config.LoadSpectralRuleset(m.workspaceRoot)
	if err != nil {
		m.logger.Warn("failed to load Spectral ruleset", "error", err)
		spectralRS = nil
	}
	m.spectralRS = spectralRS

	// Resolve Spectral extends chain
	var resolvedSpectral *rulesets.RuleSet
	if spectralRS != nil {
		resolved, err := rulesets.Resolve(spectralRS, m.workspaceRoot)
		if err != nil {
			m.logger.Warn("failed to resolve Spectral ruleset", "error", err)
			resolvedSpectral = spectralRS
		} else {
			resolvedSpectral = resolved
		}
	}

	// Merge: Spectral base, then Telescope config on top (telescope wins)
	var telescopeRS *rulesets.RuleSet
	if m.telescopeCfg != nil {
		enabled := m.telescopeCfg.BuildEnabledRules()
		telescopeRS = &rulesets.RuleSet{
			Rules: make(map[string]rulesets.RuleDefinition, len(enabled)),
		}
		for id, isEnabled := range enabled {
			sev := "warn"
			if !isEnabled {
				sev = "off"
			}
			if cfgSev, ok := m.telescopeCfg.Rules[id]; ok {
				sev = cfgSev
			}
			telescopeRS.Rules[id] = rulesets.RuleDefinition{Severity: sev}
		}
	}

	m.resolved = rulesets.Merge(resolvedSpectral, telescopeRS)

	// Normalize rule IDs through the alias table
	if m.resolved != nil {
		normalized := make(map[string]rulesets.RuleDefinition, len(m.resolved.Rules))
		for id, def := range m.resolved.Rules {
			normalized[rulesets.NormalizeRuleID(id)] = def
		}
		m.resolved.Rules = normalized
	}

	// Split rules: native overrides vs custom Spectral rules
	if m.spectralEng != nil && resolvedSpectral != nil {
		customRules := spectral.ParseRules(resolvedSpectral)
		m.spectralEng.SetRules(customRules)
	}

	// Install transformer
	m.engine.SetDiagnosticTransformer(m.buildTransformer())

	return nil
}

// SetTelescopeConfig sets the Telescope configuration used during merging.
func (m *RulesetManager) SetTelescopeConfig(cfg *config.Config) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.telescopeCfg = cfg
}

func (m *RulesetManager) buildTransformer() treesitter.DiagnosticTransformer {
	if m.resolved == nil || len(m.resolved.Rules) == 0 {
		return nil
	}

	enabledMap := rulesets.BuildEnabledMap(m.resolved)
	overrides := rulesets.BuildSeverityOverrides(m.resolved)

	severityMap := make(map[string]protocol.DiagnosticSeverity, len(overrides))
	disabledSet := make(map[string]bool)
	for _, ov := range overrides {
		if ov.Disabled {
			disabledSet[ov.RuleID] = true
			if alias := rulesets.SpectralToTelescopeID(ov.RuleID); alias != ov.RuleID {
				disabledSet[alias] = true
			}
		} else {
			severityMap[ov.RuleID] = ov.Severity
			if alias := rulesets.SpectralToTelescopeID(ov.RuleID); alias != ov.RuleID {
				severityMap[alias] = ov.Severity
			}
		}
	}

	for id, enabled := range enabledMap {
		if !enabled {
			disabledSet[id] = true
			if alias := rulesets.SpectralToTelescopeID(id); alias != id {
				disabledSet[alias] = true
			}
		}
	}

	return func(uri protocol.DocumentURI, diags []protocol.Diagnostic) []protocol.Diagnostic {
		filtered := make([]protocol.Diagnostic, 0, len(diags))
		for _, d := range diags {
			ruleID := diagnosticRuleID(d)
			normalizedID := rulesets.NormalizeRuleID(ruleID)

			if disabledSet[ruleID] || disabledSet[normalizedID] {
				continue
			}

			if sev, ok := severityMap[ruleID]; ok {
				d.Severity = sev
			} else if sev, ok := severityMap[normalizedID]; ok {
				d.Severity = sev
			}

			filtered = append(filtered, d)
		}
		return filtered
	}
}

// diagnosticRuleID extracts the rule ID from a diagnostic. It checks the Code
// field first (used by Spectral engine diagnostics), then falls back to Source.
func diagnosticRuleID(d protocol.Diagnostic) string {
	if s, ok := d.Code.(string); ok && s != "" {
		return s
	}
	return d.Source
}

// WatchPatterns returns the file glob patterns that should be watched for
// changes to trigger a ruleset reload.
func WatchPatterns() []string {
	return []string{
		"**/.spectral.yaml",
		"**/.spectral.yml",
		"**/.spectral.json",
		"**/.telescope.yaml",
		"**/.telescope.yml",
		"**/.telescope/spectral.yaml",
		"**/.telescope/spectral.yml",
		"**/.telescope/spectral.json",
		"**/.telescope/config.yaml",
		"**/.telescope/config.yml",
	}
}

// IsWatchedFile reports whether the given file path is a ruleset config file
// that should trigger a reload.
func IsWatchedFile(filePath string) bool {
	base := filepath.Base(filePath)
	switch base {
	case ".spectral.yaml", ".spectral.yml", ".spectral.json",
		".telescope.yaml", ".telescope.yml",
		"spectral.yaml", "spectral.yml", "spectral.json",
		"config.yaml", "config.yml":
		return true
	}
	return false
}
