// Package config handles Telescope configuration loading and defaults.
package config

import (
	"time"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

// Config represents the Telescope configuration.
type Config struct {
	Extends              string                       `yaml:"extends,omitempty"`
	Rules                map[string]string            `yaml:"rules,omitempty"`
	Plugins              []string                     `yaml:"plugins,omitempty"`
	Include              []string                     `yaml:"include,omitempty"`
	Exclude              []string                     `yaml:"exclude,omitempty"`
	OpenAPI              OpenAPIConfig                `yaml:"openapi,omitempty"`
	AdditionalValidation map[string]ValidationGroup   `yaml:"additionalValidation,omitempty"`
	Output               OutputConfig                 `yaml:"output,omitempty"`
	LSP                  LSPConfig                    `yaml:"lsp,omitempty"`
}

// OpenAPIConfig holds OpenAPI-specific configuration.
type OpenAPIConfig struct {
	Extensions ExtensionsConfig `yaml:"extensions,omitempty"`
}

// ExtensionsConfig configures x-* extension validation.
type ExtensionsConfig struct {
	Schemas  []string `yaml:"schemas,omitempty"`  // .telescope/extensions/*.json filenames
	Required []string `yaml:"required,omitempty"` // extension names that must be present
}

// ValidationGroup defines file patterns and schemas for additional validation.
type ValidationGroup struct {
	Patterns []string               `yaml:"patterns" json:"patterns"`
	Schemas  []SchemaPatternMapping `yaml:"schemas,omitempty" json:"schemas,omitempty"`
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
	Debounce    time.Duration `yaml:"debounce,omitempty"`
	MaxFileSize int64         `yaml:"maxFileSize,omitempty"`
}

// DefaultConfig returns a configuration with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		Extends: rulesets.Recommended,
		Include: []string{"**/*.yaml", "**/*.yml", "**/*.json"},
		Exclude: []string{"node_modules/**", "vendor/**", ".git/**"},
		Output: OutputConfig{
			Format: "text",
			Color:  "auto",
		},
		LSP: LSPConfig{
			Debounce:    300 * time.Millisecond,
			MaxFileSize: 5 * 1024 * 1024, // 5MB
		},
	}
}

// BuildEnabledRules resolves rule enables/disables from config + ruleset.
func (c *Config) BuildEnabledRules() map[string]bool {
	rs := rulesets.GetBuiltin(c.Extends)
	if rs == nil {
		rs = &rulesets.RuleSet{Rules: make(map[string]rulesets.RuleDefinition)}
	}

	// Apply config-level overrides
	for id, sev := range c.Rules {
		rs.Rules[id] = rulesets.RuleDefinition{Severity: sev}
	}

	return rulesets.BuildEnabledMap(rs)
}
