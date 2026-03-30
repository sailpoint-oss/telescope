// Package config handles Telescope configuration loading and defaults.
package config

import (
	"path/filepath"
	"strings"
	"time"

	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/telescope/server/rulesets"
)

// Config represents the Telescope configuration.
type Config struct {
	Extends              string                     `yaml:"extends,omitempty"`
	Roots                []string                   `yaml:"roots,omitempty"`
	Rules                map[string]string          `yaml:"rules,omitempty"`
	Plugins              []string                   `yaml:"plugins,omitempty"`
	Include              []string                   `yaml:"include,omitempty"`
	Exclude              []string                   `yaml:"exclude,omitempty"`
	SpectralRulesets     []string                   `yaml:"spectralRulesets,omitempty"`
	GuidelinesBaseURL    string                     `yaml:"guidelinesBaseURL,omitempty"`
	OpenAPI              OpenAPIConfig              `yaml:"openapi,omitempty"`
	AdditionalValidation map[string]ValidationGroup `yaml:"additionalValidation,omitempty"`
	Output               OutputConfig               `yaml:"output,omitempty"`
	LSP                  LSPConfig                  `yaml:"lsp,omitempty"`
	ContractTests        ContractTestsConfig        `yaml:"contractTests,omitempty"`
}

// RuleRef references a custom rule or schema file in .telescope/.
type RuleRef struct {
	Rule     string         `yaml:"rule,omitempty" json:"rule,omitempty"`
	Severity string         `yaml:"severity,omitempty" json:"severity,omitempty"`
	Runner   string         `yaml:"runner,omitempty" json:"runner,omitempty"` // "bun", "auto" (default: auto)
	Options  map[string]any `yaml:"options,omitempty" json:"options,omitempty"`
}

// OpenAPIConfig holds OpenAPI-specific configuration.
type OpenAPIConfig struct {
	TargetVersion string           `yaml:"targetVersion,omitempty"` // "3.0", "3.1", or "3.2"
	Patterns      []string         `yaml:"patterns,omitempty"`
	Rules         []RuleRef        `yaml:"rules,omitempty"`
	Extensions    ExtensionsConfig `yaml:"extensions,omitempty"`
}

// ExtensionsConfig configures x-* extension validation.
type ExtensionsConfig struct {
	Schemas  []string `yaml:"schemas,omitempty"`  // .telescope/extensions/*.json filenames
	Required []string `yaml:"required,omitempty"` // extension names that must be present
}

// ValidationGroup defines file patterns, schemas, and rules for additional validation.
type ValidationGroup struct {
	Patterns []string               `yaml:"patterns" json:"patterns"`
	Schemas  []SchemaPatternMapping `yaml:"schemas,omitempty" json:"schemas,omitempty"`
	Rules    []RuleRef              `yaml:"rules,omitempty" json:"rules,omitempty"`
}

// SchemaPatternMapping maps a JSON Schema to file patterns.
type SchemaPatternMapping struct {
	Schema   string   `yaml:"schema" json:"schema"`
	Patterns []string `yaml:"patterns,omitempty" json:"patterns,omitempty"`
}

// OutputConfig controls CLI output formatting.
type OutputConfig struct {
	Format string `yaml:"format,omitempty"` // text, json, sarif, github
	Color  string `yaml:"color,omitempty"`  // auto, always, never
}

// LSPConfig controls LSP server behavior.
type LSPConfig struct {
	Debounce         time.Duration               `yaml:"debounce,omitempty"`
	MaxFileSize      int64                       `yaml:"maxFileSize,omitempty"`
	SchemaValidation LSPSchemaValidationSettings `yaml:"schemaValidation,omitempty"`
}

// LSPSchemaValidationSettings configures schema validation behavior.
type LSPSchemaValidationSettings struct {
	Mode string `yaml:"mode,omitempty"` // go (legacy bun/compare values are treated as go)
}

// DefaultConfig returns a configuration with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		Extends:           rulesets.Recommended,
		Include:           []string{"**/*.yaml", "**/*.yml", "**/*.json"},
		Exclude:           []string{"node_modules/**", "vendor/**", ".git/**"},
		GuidelinesBaseURL: barrelman.GuidelinesBaseURL(),
		Output: OutputConfig{
			Format: "text",
			Color:  "auto",
		},
		LSP: LSPConfig{
			Debounce:    300 * time.Millisecond,
			MaxFileSize: 5 * 1024 * 1024, // 5MB
			SchemaValidation: LSPSchemaValidationSettings{
				Mode: "go",
			},
		},
	}
}

// EffectiveGuidelinesBaseURL returns the configured docs base URL, falling back
// to barrelman's env/default resolution.
func (c *Config) EffectiveGuidelinesBaseURL() string {
	if c == nil {
		return barrelman.GuidelinesBaseURL()
	}
	base := strings.TrimSpace(c.GuidelinesBaseURL)
	if base == "" {
		return barrelman.GuidelinesBaseURL()
	}
	return strings.TrimRight(base, "/") + "/"
}

// EffectiveSchemaValidationMode returns the configured LSP schema-validation
// mode, defaulting to "go". Legacy "bun" and "compare" values are accepted
// for compatibility but are normalized to "go".
func (c *Config) EffectiveSchemaValidationMode() string {
	mode := strings.ToLower(strings.TrimSpace(c.LSP.SchemaValidation.Mode))
	switch mode {
	case "go", "bun", "compare":
		return "go"
	default:
		return "go"
	}
}

// HasCustomRules reports whether the config declares any custom rules.
func (c *Config) HasCustomRules() bool {
	if len(c.OpenAPI.Rules) > 0 {
		return true
	}
	for _, g := range c.AdditionalValidation {
		if len(g.Rules) > 0 {
			return true
		}
	}
	return false
}

// HasSpectralRulesets reports whether the config declares any Spectral rulesets.
func (c *Config) HasSpectralRulesets() bool {
	return len(c.SpectralRulesets) > 0
}

// NeedsBunSidecar reports whether the config requires the Bun sidecar to be started
// (custom rules or Spectral rulesets).
func (c *Config) NeedsBunSidecar() bool {
	return c.HasCustomRules() || c.HasSpectralRulesets()
}

// ResolveRunner determines the runner for a rule reference.
// "auto" or empty resolves to "bun" for .ts/.js files.
func ResolveRunner(ref RuleRef) string {
	runner := strings.ToLower(ref.Runner)
	if runner == "bun" {
		return "bun"
	}
	if runner != "" && runner != "auto" {
		return runner
	}
	ext := strings.ToLower(filepath.Ext(ref.Rule))
	if ext == ".ts" || ext == ".js" || ext == ".mts" || ext == ".mjs" {
		return "bun"
	}
	return "native"
}

// BuildEnabledRules resolves rule enables/disables from config + ruleset.
func (c *Config) BuildEnabledRules() map[string]bool {
	rs := rulesets.GetBuiltin(c.Extends)
	if rs == nil {
		rs = &rulesets.RuleSet{Rules: make(map[string]rulesets.RuleDefinition)}
	}

	// Apply config-level overrides
	for id, sev := range c.Rules {
		rs.Rules[rulesets.NormalizeRuleID(id)] = rulesets.RuleDefinition{Severity: sev}
	}

	return rulesets.BuildEnabledMap(rs)
}
