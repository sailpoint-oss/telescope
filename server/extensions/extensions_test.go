package extensions_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/extensions"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

func TestRegistryRegisterAndGet(t *testing.T) {
	r := extensions.NewRegistry()
	err := r.Register(extensions.ExtensionMeta{
		Name:        "x-test",
		Scopes:      []extensions.Scope{extensions.ScopeOperation},
		Description: "A test extension",
		Schema:      json.RawMessage(`{"type": "string"}`),
	})
	if err != nil {
		t.Fatal(err)
	}

	ext, ok := r.Get("x-test")
	if !ok {
		t.Fatal("extension not found")
	}
	if ext.Meta.Name != "x-test" {
		t.Errorf("name = %q, want %q", ext.Meta.Name, "x-test")
	}
	if ext.Meta.Description != "A test extension" {
		t.Errorf("description mismatch")
	}
}

func TestRegistryScopeValidation(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-operation-only",
		Scopes: []extensions.Scope{extensions.ScopeOperation},
	})

	if !r.ValidAtScope("x-operation-only", extensions.ScopeOperation) {
		t.Error("expected valid at operation scope")
	}
	if r.ValidAtScope("x-operation-only", extensions.ScopeSchema) {
		t.Error("expected invalid at schema scope")
	}
	if !r.ValidAtScope("x-unknown", extensions.ScopeOperation) {
		t.Error("unknown extensions should be valid anywhere")
	}
}

func TestRegistryScopeAny(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-everywhere",
		Scopes: []extensions.Scope{extensions.ScopeAny},
	})

	for _, scope := range extensions.AllScopes {
		if !r.ValidAtScope("x-everywhere", scope) {
			t.Errorf("expected valid at scope %s", scope)
		}
	}
}

func TestRegistryRequired(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-required",
		Scopes: []extensions.Scope{extensions.ScopeOperation},
	})
	r.SetRequired([]string{"x-required"})

	if !r.IsRequired("x-required") {
		t.Error("expected x-required to be required")
	}
	if r.IsRequired("x-optional") {
		t.Error("expected x-optional to not be required")
	}

	req := r.RequiredForScope(extensions.ScopeOperation)
	if len(req) != 1 || req[0].Meta.Name != "x-required" {
		t.Errorf("RequiredForScope returned unexpected results: %v", req)
	}
}

func TestLoadBuiltins(t *testing.T) {
	r := extensions.NewRegistry()
	if err := extensions.LoadBuiltins(r); err != nil {
		t.Fatal(err)
	}

	// Verify some well-known extensions loaded
	wellKnown := []string{"x-logo", "x-tagGroups", "x-internal", "x-codeSamples", "x-speakeasy-entity"}
	for _, name := range wellKnown {
		if !r.IsRegistered(name) {
			t.Errorf("expected builtin extension %q to be registered", name)
		}
	}

	if r.Count() < 20 {
		t.Errorf("expected at least 20 builtin extensions, got %d", r.Count())
	}
}

func TestAnalyzer_AcceptsAnalysisData(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-test",
		Scopes: []extensions.Scope{extensions.ScopeOperation},
		Schema: json.RawMessage(`{"type": "string"}`),
	})

	doc := &openapi.Document{
		DocType: openapi.DocTypeRoot,
		Paths: map[string]*openapi.PathItem{
			"/users": {
				Loc: openapi.Loc{},
			},
		},
	}
	idx := &openapi.Index{Document: doc}

	analyzer := extensions.Analyzer(r)

	// UserData as *rules.AnalysisData (the path used by the LSP wiring)
	ctx := &treesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: &rules.AnalysisData{Index: idx},
	}
	diags := analyzer.Run(ctx)
	// Should not panic and should run successfully (no extension diags expected)
	_ = diags

	// UserData as nil should return nil without panic
	ctx2 := &treesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: nil,
	}
	diags2 := analyzer.Run(ctx2)
	if diags2 != nil {
		t.Errorf("expected nil diagnostics for nil UserData, got %v", diags2)
	}
}

func TestAnalyzer_EnumValidation(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-env",
		Scopes: []extensions.Scope{extensions.ScopeRoot},
		Schema: json.RawMessage(`{"type": "string", "enum": ["prod", "staging", "dev"]}`),
	})

	doc := &openapi.Document{
		DocType: openapi.DocTypeRoot,
		Extensions: map[string]*openapi.Node{
			"x-env": {Value: "invalid-env", Loc: openapi.Loc{}},
		},
	}
	idx := &openapi.Index{Document: doc}

	analyzer := extensions.Analyzer(r)
	ctx := &treesitter.AnalysisContext{
		Context:  context.Background(),
		UserData: &rules.AnalysisData{Index: idx},
	}
	diags := analyzer.Run(ctx)

	found := false
	for _, d := range diags {
		if d.Code == "extension-enum" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected extension-enum diagnostic for invalid enum value")
	}
}
