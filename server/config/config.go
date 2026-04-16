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
	ConfigVersion        int                        `yaml:"configVersion,omitempty"`
	Workspace            WorkspaceSection           `yaml:"workspace,omitempty"`
	Generation           GenerationSection          `yaml:"generation,omitempty"`
	Linting              LintingSection             `yaml:"linting,omitempty"`
	Validation           ValidationSection          `yaml:"validation,omitempty"`
	Formatting           FormattingSection          `yaml:"formatting,omitempty"`
	Testing              TestingSection             `yaml:"testing,omitempty"`
	Documentation        DocumentationSection       `yaml:"documentation,omitempty"`
	Extension            ExtensionSection           `yaml:"extension,omitempty"`
	Automation           AutomationSection          `yaml:"automation,omitempty"`
	Extends              string                     `yaml:"extends,omitempty"`
	Roots                []string                   `yaml:"roots,omitempty"`
	Rules                map[string]string          `yaml:"rules,omitempty"`
	Include              []string                   `yaml:"include,omitempty"`
	Exclude              []string                   `yaml:"exclude,omitempty"`
	Lint                 LintConfig                 `yaml:"lint,omitempty"`
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

// LintConfig controls which lint engines run for CLI/LSP flows.
type LintConfig struct {
	Engines []string     `yaml:"engines,omitempty"` // barrelman, vacuum
	Vacuum  VacuumConfig `yaml:"vacuum,omitempty"`
}

// VacuumConfig configures the optional pb33f/vacuum lint bridge.
type VacuumConfig struct {
	Ruleset  string `yaml:"ruleset,omitempty"`
	Severity string `yaml:"severity,omitempty"` // error, warn, info, hint
	Turbo    bool   `yaml:"turbo,omitempty"`
}

// LSPConfig controls LSP server behavior.
type LSPConfig struct {
	Debounce           time.Duration               `yaml:"debounce,omitempty"`
	MaxFileSize        int64                       `yaml:"maxFileSize,omitempty"`
	SchemaValidation   LSPSchemaValidationSettings `yaml:"schemaValidation,omitempty"`
	DiffOnSave         bool                        `yaml:"diffOnSave,omitempty"`
	BreakingRulesPath  string                      `yaml:"breakingRulesPath,omitempty"`
	DiffCompareBaseRef string                      `yaml:"diffCompareBaseRef,omitempty"` // default: HEAD
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
		Lint: LintConfig{
			Engines: []string{"barrelman"},
		},
		LSP: LSPConfig{
			Debounce:           300 * time.Millisecond,
			MaxFileSize:        5 * 1024 * 1024, // 5MB
			DiffCompareBaseRef: "HEAD",
			SchemaValidation: LSPSchemaValidationSettings{
				Mode: "go",
			},
		},
	}
}

// EffectiveRuleSet returns the merged builtin rulesets and config overrides that
// should drive enablement and severity decisions.
func (c *Config) EffectiveRuleSet() *rulesets.RuleSet {
	if c == nil {
		return rulesets.Merge(rulesets.GetBuiltin(rulesets.Recommended))
	}

	var merged []*rulesets.RuleSet
	for _, preset := range c.EffectivePresetNames() {
		merged = append(merged, rulesets.GetBuiltin(strings.TrimSpace(preset)))
	}
	rs := rulesets.Merge(merged...)
	if rs == nil {
		rs = &rulesets.RuleSet{Rules: make(map[string]rulesets.RuleDefinition)}
	}
	if rs.Rules == nil {
		rs.Rules = make(map[string]rulesets.RuleDefinition)
	}
	for id, sev := range c.Rules {
		rs.Rules[rulesets.NormalizeRuleID(id)] = rulesets.RuleDefinition{Severity: sev}
	}
	return rs
}

// EffectivePresetNames returns the builtin preset list that should be applied.
func (c *Config) EffectivePresetNames() []string {
	if c == nil {
		return []string{rulesets.Recommended}
	}
	if c.UsesV2Layout() && len(c.Linting.Presets) > 0 {
		return dedupeTrimmed(c.Linting.Presets)
	}
	if strings.TrimSpace(c.Extends) != "" {
		return []string{strings.TrimSpace(c.Extends)}
	}
	return []string{rulesets.Recommended}
}

// EffectiveGuidelinesBaseURL returns the configured docs base URL, falling back
// to barrelman's env/default resolution.
func (c *Config) EffectiveGuidelinesBaseURL() string {
	if c == nil {
		return barrelman.GuidelinesBaseURL()
	}
	if c.UsesV2Layout() {
		base := strings.TrimSpace(c.Linting.GuidelinesBaseURL)
		if base != "" {
			return strings.TrimRight(base, "/") + "/"
		}
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
	if c != nil && c.UsesV2Layout() {
		mode := strings.ToLower(strings.TrimSpace(c.Validation.OpenAPI.SchemaValidationMode))
		switch mode {
		case "", "go", "bun", "compare":
			return "go"
		default:
			return "go"
		}
	}
	mode := strings.ToLower(strings.TrimSpace(c.LSP.SchemaValidation.Mode))
	switch mode {
	case "go", "bun", "compare":
		return "go"
	default:
		return "go"
	}
}

// EffectiveDiffCompareBaseRef returns the git ref used for diff-on-save / breaking previews.
func (c *Config) EffectiveDiffCompareBaseRef() string {
	if c != nil && c.UsesV2Layout() {
		s := strings.TrimSpace(c.Validation.OpenAPI.BreakingChanges.CompareTo)
		if s != "" {
			return s
		}
	}
	if c == nil {
		return "HEAD"
	}
	s := strings.TrimSpace(c.LSP.DiffCompareBaseRef)
	if s == "" {
		return "HEAD"
	}
	return s
}

// EffectiveLintEngines returns the normalized list of configured lint engines.
// Supported values are "barrelman" and "vacuum"; "both" expands to both.
func (c *Config) EffectiveLintEngines() []string {
	if c == nil {
		return []string{"barrelman"}
	}
	if c.UsesV2Layout() {
		var raw []string
		if c.Linting.Engines.Barrelman.Enabled || c.Linting.Engines.Vacuum.Enabled || (!c.Linting.Engines.Barrelman.Enabled && !c.Linting.Engines.Vacuum.Enabled) {
			raw = append(raw, "barrelman")
		}
		if c.Linting.Engines.Vacuum.Enabled {
			raw = append(raw, "vacuum")
		}
		if engines := normalizeLintEngines(raw); len(engines) > 0 {
			return engines
		}
	}
	engines := normalizeLintEngines(c.Lint.Engines)
	if len(engines) == 0 {
		return []string{"barrelman"}
	}
	return engines
}

// UsesVacuum reports whether the configured lint engine set includes vacuum.
func (c *Config) UsesVacuum() bool {
	for _, engine := range c.EffectiveLintEngines() {
		if engine == "vacuum" {
			return true
		}
	}
	return false
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

func normalizeLintEngines(raw []string) []string {
	if len(raw) == 0 {
		return nil
	}
	var out []string
	add := func(engine string) {
		for _, existing := range out {
			if existing == engine {
				return
			}
		}
		out = append(out, engine)
	}
	for _, item := range raw {
		for _, part := range strings.Split(item, ",") {
			switch strings.ToLower(strings.TrimSpace(part)) {
			case "", "barrelman":
				add("barrelman")
			case "vacuum":
				add("vacuum")
			case "both":
				add("barrelman")
				add("vacuum")
			}
		}
	}
	return out
}

// HasSpectralRulesets reports whether the config declares any Spectral rulesets.
func (c *Config) HasSpectralRulesets() bool {
	if c != nil && c.UsesV2Layout() && len(c.Linting.Rulesets.Spectral) > 0 {
		return true
	}
	return len(c.SpectralRulesets) > 0
}

// NeedsBunSidecar reports whether the config requires the Bun sidecar to be started
// (custom rules, Spectral rulesets, or additional validation schemas).
func (c *Config) NeedsBunSidecar() bool {
	return c.HasCustomRules() || c.HasSpectralRulesets() || c.HasValidationSchemas()
}

// HasValidationSchemas reports whether any additionalValidation group references
// schema files that need the sidecar (AJV or Zod validation).
func (c *Config) HasValidationSchemas() bool {
	for _, g := range c.AdditionalValidation {
		if len(g.Schemas) > 0 {
			return true
		}
	}
	return false
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
	return rulesets.BuildEnabledMap(c.EffectiveRuleSet())
}
