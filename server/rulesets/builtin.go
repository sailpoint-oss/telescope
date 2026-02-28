package rulesets

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// Built-in ruleset names.
const (
	Recommended = "telescope:recommended"
	All         = "telescope:all"
	OWASP       = "telescope:owasp"
	Strict      = "telescope:strict"
)

// GetBuiltin returns a resolved ruleset by its built-in name.
func GetBuiltin(name string) *RuleSet {
	switch name {
	case Recommended:
		return recommendedRuleSet()
	case All:
		return allRuleSet()
	case OWASP:
		return owaspRuleSet()
	case Strict:
		return strictRuleSet()
	default:
		return nil
	}
}

func recommendedRuleSet() *RuleSet {
	rs := &RuleSet{
		Name:        "Telescope Recommended",
		Description: "Curated set of the most important OpenAPI rules.",
		Rules:       make(map[string]RuleDefinition),
	}
	for _, meta := range rules.DefaultRegistry.All() {
		if meta.Recommended {
			rs.Rules[meta.ID] = RuleDefinition{Severity: severityString(meta.Severity)}
		}
	}
	return rs
}

func allRuleSet() *RuleSet {
	rs := &RuleSet{
		Name:        "Telescope All",
		Description: "All available OpenAPI rules.",
		Rules:       make(map[string]RuleDefinition),
	}
	for _, meta := range rules.DefaultRegistry.All() {
		if meta.Category != rules.CategoryOWASP {
			rs.Rules[meta.ID] = RuleDefinition{Severity: severityString(meta.Severity)}
		}
	}
	return rs
}

func owaspRuleSet() *RuleSet {
	rs := &RuleSet{
		Name:        "Telescope OWASP",
		Description: "OWASP API security rules.",
		Rules:       make(map[string]RuleDefinition),
	}
	for _, meta := range rules.DefaultRegistry.ByCategory(rules.CategoryOWASP) {
		rs.Rules[meta.ID] = RuleDefinition{Severity: severityString(meta.Severity)}
	}
	return rs
}

func strictRuleSet() *RuleSet {
	rs := &RuleSet{
		Name:        "Telescope Strict",
		Description: "Recommended rules plus OWASP with stricter severities.",
		Extends:     []interface{}{Recommended, OWASP},
		Rules:       make(map[string]RuleDefinition),
	}
	return rs
}

func severityString(s protocol.DiagnosticSeverity) string {
	switch s {
	case protocol.SeverityError:
		return "error"
	case protocol.SeverityWarning:
		return "warn"
	case protocol.SeverityInformation:
		return "info"
	case protocol.SeverityHint:
		return "hint"
	default:
		return "warn"
	}
}
