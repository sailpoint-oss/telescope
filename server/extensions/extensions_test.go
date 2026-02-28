package extensions_test

import (
	"encoding/json"
	"testing"

	"github.com/sailpoint-oss/telescope/server/extensions"
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
