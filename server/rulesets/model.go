// Package rulesets provides Spectral/vacuum-compatible ruleset loading,
// resolution, and merging. Rulesets define which rules are enabled and their
// severity overrides.
package rulesets

import (
	"fmt"

	"github.com/LukasParke/gossip/protocol"
	"gopkg.in/yaml.v3"
)

// RuleSet is a loaded ruleset that controls which rules are enabled and their
// severity settings.
type RuleSet struct {
	Name        string                    `yaml:"name,omitempty"`
	Description string                    `yaml:"description,omitempty"`
	Extends     interface{}               `yaml:"extends,omitempty"`
	Rules       map[string]RuleDefinition `yaml:"rules,omitempty"`
}

// RuleDefinition defines a rule override within a ruleset. It supports both
// the full object form and Spectral's shorthand where the value is just a
// severity string (e.g., `rule-id: error`).
type RuleDefinition struct {
	Severity    string                 `yaml:"severity,omitempty"`
	Description string                 `yaml:"description,omitempty"`
	Message     string                 `yaml:"message,omitempty"`
	Given       interface{}            `yaml:"given,omitempty"`
	Then        interface{}            `yaml:"then,omitempty"`
	Formats     []string               `yaml:"formats,omitempty"`
	Recommended *bool                  `yaml:"recommended,omitempty"`
	Options     map[string]interface{} `yaml:"options,omitempty"`
}

// UnmarshalYAML handles Spectral shorthand syntax where a rule value can be:
//   - a string: "error", "warn", "info", "hint", "off"
//   - a boolean: false (same as "off")
//   - an integer: severity code (0=off, 1=error, 2=warn, 3=info, 4=hint)
//   - an array: [severity, {options}] (e.g., ["error", {"functionOptions": {...}}])
//   - a map: full rule definition object
func (rd *RuleDefinition) UnmarshalYAML(node *yaml.Node) error {
	switch node.Kind {
	case yaml.ScalarNode:
		return rd.unmarshalScalar(node)
	case yaml.SequenceNode:
		return rd.unmarshalSequence(node)
	case yaml.MappingNode:
		type plain RuleDefinition
		return node.Decode((*plain)(rd))
	default:
		return fmt.Errorf("unexpected YAML node kind %d for rule definition", node.Kind)
	}
}

func (rd *RuleDefinition) unmarshalScalar(node *yaml.Node) error {
	if node.Tag == "!!bool" && node.Value == "false" {
		rd.Severity = "off"
		return nil
	}
	if node.Tag == "!!int" {
		rd.Severity = intToSeverity(node.Value)
		return nil
	}
	rd.Severity = node.Value
	return nil
}

func (rd *RuleDefinition) unmarshalSequence(node *yaml.Node) error {
	if len(node.Content) == 0 {
		return nil
	}
	// First element is the severity
	if node.Content[0].Kind == yaml.ScalarNode {
		rd.Severity = node.Content[0].Value
	}
	// Second element (if present) is a map of options merged into the definition
	if len(node.Content) > 1 && node.Content[1].Kind == yaml.MappingNode {
		type plain RuleDefinition
		if err := node.Content[1].Decode((*plain)(rd)); err != nil {
			return err
		}
		// Restore severity from first element (Decode may have overwritten it)
		if node.Content[0].Kind == yaml.ScalarNode {
			rd.Severity = node.Content[0].Value
		}
	}
	return nil
}

func intToSeverity(s string) string {
	switch s {
	case "0":
		return "off"
	case "1":
		return "error"
	case "2":
		return "warn"
	case "3":
		return "info"
	case "4":
		return "hint"
	default:
		return s
	}
}

// SeverityOverride maps rule IDs to their overridden severity.
type SeverityOverride struct {
	RuleID   string
	Severity protocol.DiagnosticSeverity
	Disabled bool
}

// ParseSeverity converts a severity string to an LSP DiagnosticSeverity.
func ParseSeverity(s string) (protocol.DiagnosticSeverity, bool) {
	switch s {
	case "error":
		return protocol.SeverityError, true
	case "warn", "warning":
		return protocol.SeverityWarning, true
	case "info", "information":
		return protocol.SeverityInformation, true
	case "hint":
		return protocol.SeverityHint, true
	case "off", "false":
		return 0, true
	default:
		return 0, false
	}
}
