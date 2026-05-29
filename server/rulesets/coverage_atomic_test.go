package rulesets_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func TestResolve_BuiltinTelescope(t *testing.T) {
	rs := &rulesets.RuleSet{
		Extends: "telescope:recommended",
		Rules: map[string]rulesets.RuleDefinition{
			"info-contact": {Severity: "error"},
		},
	}
	resolved, err := rulesets.Resolve(rs, ".")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if len(resolved.Rules) == 0 {
		t.Error("expected non-empty resolved rules")
	}
	if resolved.Rules["info-contact"].Severity != "error" {
		t.Error("local override should take precedence")
	}
}

func TestResolve_UnknownBuiltin(t *testing.T) {
	rs := &rulesets.RuleSet{Extends: "telescope:nonexistent"}
	_, err := rulesets.Resolve(rs, ".")
	if err == nil {
		t.Error("expected error for unknown built-in")
	}
}

func TestResolve_UnknownSpectralBuiltin(t *testing.T) {
	rs := &rulesets.RuleSet{Extends: "spectral:nonexistent"}
	_, err := rulesets.Resolve(rs, ".")
	if err == nil {
		t.Error("expected error for unknown Spectral built-in")
	}
}

func TestResolve_CircularExtends(t *testing.T) {
	rs := &rulesets.RuleSet{Extends: "telescope:recommended"}
	_, err := rulesets.Resolve(rs, ".")
	if err != nil {
		t.Fatalf("first resolve should succeed: %v", err)
	}
}

func TestResolve_ArrayExtends(t *testing.T) {
	rs := &rulesets.RuleSet{
		Extends: []interface{}{"spectral:oas"},
		Rules: map[string]rulesets.RuleDefinition{
			"custom-rule": {Severity: "warn"},
		},
	}
	resolved, err := rulesets.Resolve(rs, ".")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if _, ok := resolved.Rules["custom-rule"]; !ok {
		t.Error("local custom-rule should be present")
	}
	if len(resolved.Rules) < 2 {
		t.Error("should have spectral:oas rules plus custom-rule")
	}
}

func TestResolve_NestedArrayExtends(t *testing.T) {
	rs := &rulesets.RuleSet{
		Extends: []interface{}{
			[]interface{}{"spectral:oas"},
		},
	}
	resolved, err := rulesets.Resolve(rs, ".")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if len(resolved.Rules) == 0 {
		t.Error("expected non-empty resolved rules from nested array extends")
	}
}

func TestResolve_NoExtends(t *testing.T) {
	rs := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"solo": {Severity: "info"},
		},
	}
	resolved, err := rulesets.Resolve(rs, ".")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if len(resolved.Rules) != 1 {
		t.Errorf("expected 1 rule, got %d", len(resolved.Rules))
	}
}

func TestMerge_NilInputs(t *testing.T) {
	merged := rulesets.Merge(nil, nil)
	if merged == nil {
		t.Fatal("Merge should never return nil")
	}
	if len(merged.Rules) != 0 {
		t.Error("merging nils should yield empty rules")
	}
}

func TestMerge_OneNil(t *testing.T) {
	rs := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"rule-a": {Severity: "warn"},
		},
	}
	merged := rulesets.Merge(nil, rs, nil)
	if len(merged.Rules) != 1 {
		t.Errorf("expected 1 rule, got %d", len(merged.Rules))
	}
}

func TestMerge_LaterWins(t *testing.T) {
	a := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"r": {Severity: "warn"},
		},
	}
	b := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"r": {Severity: "error"},
		},
	}
	merged := rulesets.Merge(a, b)
	if merged.Rules["r"].Severity != "error" {
		t.Errorf("later ruleset should win, got %q", merged.Rules["r"].Severity)
	}
}

func TestBuildEnabledMap_NilRuleset(t *testing.T) {
	m := rulesets.BuildEnabledMap(nil)
	if m != nil {
		t.Errorf("expected nil, got %v", m)
	}
}

func TestBuildEnabledMap_FalseDisablesRule(t *testing.T) {
	rs := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"disabled-via-false": {Severity: "false"},
			"disabled-via-off":   {Severity: "off"},
			"enabled":            {Severity: "error"},
		},
	}
	m := rulesets.BuildEnabledMap(rs)
	if m["disabled-via-false"] {
		t.Error("false severity should disable rule")
	}
	if m["disabled-via-off"] {
		t.Error("off severity should disable rule")
	}
	if !m["enabled"] {
		t.Error("error severity should enable rule")
	}
}

func TestBuildSeverityOverrides_NilRuleset(t *testing.T) {
	overrides := rulesets.BuildSeverityOverrides(nil)
	if overrides != nil {
		t.Error("expected nil for nil ruleset")
	}
}

func TestBuildSeverityOverrides_ValidSeverities(t *testing.T) {
	rs := &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"rule-err":  {Severity: "error"},
			"rule-warn": {Severity: "warn"},
			"rule-off":  {Severity: "off"},
			"rule-bad":  {Severity: "nonsense"},
		},
	}
	overrides := rulesets.BuildSeverityOverrides(rs)
	foundIDs := make(map[string]bool)
	for _, ov := range overrides {
		foundIDs[ov.RuleID] = true
		if ov.RuleID == "rule-off" && !ov.Disabled {
			t.Error("rule-off should be marked disabled")
		}
	}
	if foundIDs["rule-bad"] {
		t.Error("invalid severity should not produce an override")
	}
	if !foundIDs["rule-err"] || !foundIDs["rule-warn"] {
		t.Error("valid rules should produce overrides")
	}
}

func TestNormalizeRuleID_KnownAliases(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"no-trailing-slash", "path-keys-no-trailing-slash"},
		{"operation-operationId", "operation-operationId"},
		{"missing-pagination", "missing-pagination"},
		{"unknown-rule", "unknown-rule"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := rulesets.NormalizeRuleID(tt.input)
			if got != tt.want {
				t.Errorf("NormalizeRuleID(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestTelescopeToSpectralID(t *testing.T) {
	tests := []struct {
		telescopeID string
		want        string
	}{
		{"description-markdown", "no-eval-in-markdown"},
		{"description-html", "no-script-tags-in-markdown"},
		{"unknown", "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.telescopeID, func(t *testing.T) {
			got := rulesets.TelescopeToSpectralID(tt.telescopeID)
			if got != tt.want {
				t.Errorf("TelescopeToSpectralID(%q) = %q, want %q", tt.telescopeID, got, tt.want)
			}
		})
	}
}

func TestGetBuiltin_AllNames(t *testing.T) {
	names := []string{
		"telescope:recommended",
		"telescope:all",
		"telescope:owasp",
		"telescope:strict",
	}
	for _, name := range names {
		t.Run(name, func(t *testing.T) {
			rs := rulesets.GetBuiltin(name)
			if rs == nil {
				t.Fatalf("GetBuiltin(%q) returned nil", name)
			}
			if len(rs.Rules) == 0 {
				t.Error("expected non-empty rules")
			}
			if rs.Name == "" {
				t.Error("expected non-empty name")
			}
		})
	}
}

func TestGetBuiltin_Unknown(t *testing.T) {
	if rulesets.GetBuiltin("telescope:fake") != nil {
		t.Error("expected nil for unknown builtin")
	}
}

func TestLoadBytes_Valid(t *testing.T) {
	yaml := `
rules:
  info-contact: warn
  operation-tags: error
`
	rs, err := rulesets.LoadBytes([]byte(yaml))
	if err != nil {
		t.Fatalf("LoadBytes: %v", err)
	}
	if len(rs.Rules) != 2 {
		t.Errorf("expected 2 rules, got %d", len(rs.Rules))
	}
	if rs.Rules["info-contact"].Severity != "warn" {
		t.Errorf("info-contact severity = %q", rs.Rules["info-contact"].Severity)
	}
}

func TestLoadBytes_InvalidYAML(t *testing.T) {
	_, err := rulesets.LoadBytes([]byte("}{not yaml"))
	if err == nil {
		t.Error("expected error for invalid YAML")
	}
}

func TestLoadBytes_DeprecatedAliasNormalization(t *testing.T) {
	yaml := `
rules:
  no-trailing-slash: error
`
	rs, err := rulesets.LoadBytes([]byte(yaml))
	if err != nil {
		t.Fatalf("LoadBytes: %v", err)
	}
	canonical := rulesets.NormalizeRuleID("no-trailing-slash")
	if _, ok := rs.Rules[canonical]; !ok {
		t.Errorf("expected normalized key %q in rules", canonical)
	}
}

func TestLoadBytes_ShorthandSeverities(t *testing.T) {
	yaml := `
rules:
  rule-bool: false
  rule-int: 1
  rule-array:
    - error
`
	rs, err := rulesets.LoadBytes([]byte(yaml))
	if err != nil {
		t.Fatalf("LoadBytes: %v", err)
	}
	if rs.Rules["rule-bool"].Severity != "off" {
		t.Errorf("false should parse as off, got %q", rs.Rules["rule-bool"].Severity)
	}
	if rs.Rules["rule-int"].Severity != "error" {
		t.Errorf("1 should parse as error, got %q", rs.Rules["rule-int"].Severity)
	}
	if rs.Rules["rule-array"].Severity != "error" {
		t.Errorf("array [error] should parse severity as error, got %q", rs.Rules["rule-array"].Severity)
	}
}

func TestParseSeverity_AllValues(t *testing.T) {
	tests := []struct {
		input string
		valid bool
	}{
		{"error", true},
		{"warn", true},
		{"warning", true},
		{"info", true},
		{"information", true},
		{"hint", true},
		{"off", true},
		{"false", true},
		{"invalid", false},
		{"", false},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			_, ok := rulesets.ParseSeverity(tt.input)
			if ok != tt.valid {
				t.Errorf("ParseSeverity(%q) valid = %v, want %v", tt.input, ok, tt.valid)
			}
		})
	}
}
