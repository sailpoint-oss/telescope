package bun

import (
	"log/slog"
	"testing"
)

func TestFormatRuleLoadErrors_SingleError(t *testing.T) {
	errs := []RuleRunError{
		{RuleID: "my-rule", Phase: "load", Error: "syntax error in rule"},
	}
	got := formatRuleLoadErrors(errs)
	if got != "my-rule (load): syntax error in rule" {
		t.Errorf("unexpected output: %q", got)
	}
}

func TestFormatRuleLoadErrors_MultipleErrors(t *testing.T) {
	errs := []RuleRunError{
		{RuleID: "rule-a", Phase: "load", Error: "bad import"},
		{RuleID: "rule-b", Phase: "run", Error: "timeout"},
	}
	got := formatRuleLoadErrors(errs)
	if got != "rule-a (load): bad import; rule-b (run): timeout" {
		t.Errorf("unexpected output: %q", got)
	}
}

func TestFormatRuleLoadErrors_Empty(t *testing.T) {
	got := formatRuleLoadErrors(nil)
	if got != "" {
		t.Errorf("expected empty string, got %q", got)
	}
}

func TestDetectFormat_Extensions(t *testing.T) {
	tests := []struct {
		uri  string
		want string
	}{
		{"file:///spec.json", "json"},
		{"file:///spec.yaml", "yaml"},
		{"file:///spec.yml", "yaml"},
		{"file:///spec.txt", "yaml"},
		{"file:///no-extension", "yaml"},
		{"openapi.json", "json"},
	}
	for _, tt := range tests {
		got := detectFormat(tt.uri)
		if got != tt.want {
			t.Errorf("detectFormat(%q) = %q, want %q", tt.uri, got, tt.want)
		}
	}
}

func TestSetRulesExpected_True(t *testing.T) {
	m := NewManager(slog.Default())

	m.SetRulesExpected(true)

	if !m.rulesExpected.Load() {
		t.Error("rulesExpected should be true")
	}
	if m.rulesReady.Load() {
		t.Error("rulesReady should be false when expecting rules")
	}
	if m.Available() {
		t.Error("Available should be false when rules expected but not ready")
	}
}

func TestSetRulesExpected_False(t *testing.T) {
	m := NewManager(slog.Default())

	m.SetRulesExpected(false)

	if m.rulesExpected.Load() {
		t.Error("rulesExpected should be false")
	}
	if !m.rulesReady.Load() {
		t.Error("rulesReady should be true when no rules expected")
	}
}

func TestSetRulesExpected_ClearsLastLoadReq(t *testing.T) {
	m := NewManager(slog.Default())
	m.lastLoadReq = &LoadRulesRequest{Rules: []RuleConfig{{ID: "old"}}}

	m.SetRulesExpected(false)

	if m.lastLoadReq != nil {
		t.Error("lastLoadReq should be nil after SetRulesExpected(false)")
	}
}

func TestCloneLoadRulesRequest_Nil(t *testing.T) {
	if cloneLoadRulesRequest(nil) != nil {
		t.Error("cloning nil should return nil")
	}
}

func TestCloneLoadRulesRequest_DeepCopy(t *testing.T) {
	original := &LoadRulesRequest{
		WorkDir: "/workspace",
		Rules: []RuleConfig{
			{
				ID:       "rule-1",
				Path:     "/rules/rule-1.ts",
				Kind:     "openapi",
				Patterns: []string{"**/*.yaml"},
				Options:  map[string]any{"maxItems": 10},
			},
		},
	}

	cloned := cloneLoadRulesRequest(original)

	if cloned.WorkDir != original.WorkDir {
		t.Errorf("WorkDir mismatch: got %q, want %q", cloned.WorkDir, original.WorkDir)
	}
	if len(cloned.Rules) != 1 {
		t.Fatalf("expected 1 rule, got %d", len(cloned.Rules))
	}
	if cloned.Rules[0].ID != "rule-1" {
		t.Errorf("rule ID mismatch: got %q", cloned.Rules[0].ID)
	}

	// Verify deep copy: mutating clone doesn't affect original.
	cloned.Rules[0].Patterns[0] = "mutated"
	if original.Rules[0].Patterns[0] == "mutated" {
		t.Error("cloned Patterns slice should be independent from original")
	}
	cloned.Rules[0].Options["maxItems"] = 999
	if original.Rules[0].Options["maxItems"] == 999 {
		t.Error("cloned Options map should be independent from original")
	}
}

func TestSerializeRawContent_YAML(t *testing.T) {
	content := []byte("openapi: '3.0.0'\ninfo:\n  title: Test\n")
	ast, err := SerializeRawContent(content, "yaml")
	if err != nil {
		t.Fatalf("SerializeRawContent YAML: %v", err)
	}
	if ast["openapi"] != "3.0.0" {
		t.Errorf("expected openapi=3.0.0, got %v", ast["openapi"])
	}
}

func TestSerializeRawContent_JSON(t *testing.T) {
	content := []byte(`{"openapi":"3.1.0","info":{"title":"Test"}}`)
	ast, err := SerializeRawContent(content, "json")
	if err != nil {
		t.Fatalf("SerializeRawContent JSON: %v", err)
	}
	if ast["openapi"] != "3.1.0" {
		t.Errorf("expected openapi=3.1.0, got %v", ast["openapi"])
	}
}

func TestSerializeRawContent_InvalidJSON(t *testing.T) {
	_, err := SerializeRawContent([]byte(`{bad json`), "json")
	if err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestSerializeRawContent_InvalidYAML(t *testing.T) {
	_, err := SerializeRawContent([]byte(":\n  :\n  - :\n    -"), "yaml")
	// YAML is lenient — just verify no panic
	_ = err
}

func TestExtractCrossFileData_OperationIDs(t *testing.T) {
	ast := map[string]any{
		"paths": map[string]any{
			"/users": map[string]any{
				"get": map[string]any{
					"operationId": "listUsers",
				},
			},
		},
	}
	idx := &SerializedProjectIndex{
		OperationIDs:  make(map[string][]string),
		ComponentRefs: make(map[string][]string),
		Tags:          make(map[string][]string),
	}
	extractCrossFileData("file:///test.yaml", ast, idx)

	if uris, ok := idx.OperationIDs["listUsers"]; !ok || len(uris) != 1 {
		t.Errorf("expected listUsers operation, got %v", idx.OperationIDs)
	}
}

func TestExtractCrossFileData_Tags(t *testing.T) {
	ast := map[string]any{
		"tags": []any{
			map[string]any{"name": "Users"},
			map[string]any{"name": "Pets"},
		},
	}
	idx := &SerializedProjectIndex{
		OperationIDs:  make(map[string][]string),
		ComponentRefs: make(map[string][]string),
		Tags:          make(map[string][]string),
	}
	extractCrossFileData("file:///test.yaml", ast, idx)

	if _, ok := idx.Tags["Users"]; !ok {
		t.Error("expected Users tag")
	}
	if _, ok := idx.Tags["Pets"]; !ok {
		t.Error("expected Pets tag")
	}
}

func TestExtractCrossFileData_Components(t *testing.T) {
	ast := map[string]any{
		"components": map[string]any{
			"schemas": map[string]any{
				"Pet":  map[string]any{"type": "object"},
				"User": map[string]any{"type": "object"},
			},
		},
	}
	idx := &SerializedProjectIndex{
		OperationIDs:  make(map[string][]string),
		ComponentRefs: make(map[string][]string),
		Tags:          make(map[string][]string),
	}
	extractCrossFileData("file:///test.yaml", ast, idx)

	if _, ok := idx.ComponentRefs["#/components/schemas/Pet"]; !ok {
		t.Error("expected Pet component ref")
	}
	if _, ok := idx.ComponentRefs["#/components/schemas/User"]; !ok {
		t.Error("expected User component ref")
	}
}

func TestSerializeIndex_NilSnapshot(t *testing.T) {
	idx := SerializeIndex(nil)
	if idx.OperationIDs == nil || idx.ComponentRefs == nil || idx.Tags == nil {
		t.Error("SerializeIndex(nil) should return initialized maps")
	}
}
