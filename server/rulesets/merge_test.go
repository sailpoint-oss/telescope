package rulesets_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func TestMerge(t *testing.T) {
	a := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"rule-a": {Severity: "warn"},
			"rule-b": {Severity: "error"},
		},
	}
	b := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"rule-b": {Severity: "warn"},
			"rule-c": {Severity: "info"},
		},
	}

	merged := rulesets.Merge(a, b)

	if len(merged.Rules) != 3 {
		t.Fatalf("len(Rules) = %d, want 3", len(merged.Rules))
	}
	if merged.Rules["rule-b"].Severity != "warn" {
		t.Error("rule-b should be overridden to warn")
	}
}

func TestBuildEnabledMap(t *testing.T) {
	rs := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"rule-a": {Severity: "warn"},
			"rule-b": {Severity: "off"},
			"rule-c": {Severity: "error"},
		},
	}

	enabled := rulesets.BuildEnabledMap(rs)

	if !enabled["rule-a"] {
		t.Error("rule-a should be enabled")
	}
	if enabled["rule-b"] {
		t.Error("rule-b should be disabled")
	}
	if !enabled["rule-c"] {
		t.Error("rule-c should be enabled")
	}
}

func TestParseSeverity(t *testing.T) {
	tests := []struct {
		input string
		valid bool
	}{
		{"error", true},
		{"warn", true},
		{"warning", true},
		{"info", true},
		{"hint", true},
		{"off", true},
		{"invalid", false},
	}

	for _, tt := range tests {
		_, ok := rulesets.ParseSeverity(tt.input)
		if ok != tt.valid {
			t.Errorf("ParseSeverity(%q) valid = %v, want %v", tt.input, ok, tt.valid)
		}
	}
}
