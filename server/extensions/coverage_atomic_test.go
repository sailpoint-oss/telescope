package extensions_test

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/extensions"
)

// --- GetForScope ---

func TestGetForScope(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-op",
		Scopes: []extensions.Scope{extensions.ScopeOperation},
	})
	r.Register(extensions.ExtensionMeta{
		Name:   "x-schema",
		Scopes: []extensions.Scope{extensions.ScopeSchema},
	})
	r.Register(extensions.ExtensionMeta{
		Name:   "x-both",
		Scopes: []extensions.Scope{extensions.ScopeOperation, extensions.ScopeSchema},
	})

	tests := []struct {
		name      string
		scope     extensions.Scope
		wantNames []string
	}{
		{
			name:      "operation scope",
			scope:     extensions.ScopeOperation,
			wantNames: []string{"x-op", "x-both"},
		},
		{
			name:      "schema scope",
			scope:     extensions.ScopeSchema,
			wantNames: []string{"x-schema", "x-both"},
		},
		{
			name:      "unrelated scope returns nil",
			scope:     extensions.ScopeTag,
			wantNames: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := r.GetForScope(tt.scope)
			if len(got) != len(tt.wantNames) {
				t.Fatalf("len = %d, want %d", len(got), len(tt.wantNames))
			}
			names := make(map[string]bool, len(got))
			for _, ext := range got {
				names[ext.Meta.Name] = true
			}
			for _, want := range tt.wantNames {
				if !names[want] {
					t.Errorf("missing expected extension %q in scope %s", want, tt.scope)
				}
			}
		})
	}
}

// --- GetForScope with ScopeAny ---

func TestGetForScope_ScopeAny(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-global",
		Scopes: []extensions.Scope{extensions.ScopeAny},
	})

	for _, scope := range extensions.AllScopes {
		got := r.GetForScope(scope)
		found := false
		for _, ext := range got {
			if ext.Meta.Name == "x-global" {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("ScopeAny extension not found at scope %s", scope)
		}
	}
}

// --- IsRegistered ---

func TestIsRegistered(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-known",
		Scopes: []extensions.Scope{extensions.ScopeRoot},
	})

	tests := []struct {
		name string
		ext  string
		want bool
	}{
		{name: "registered", ext: "x-known", want: true},
		{name: "not registered", ext: "x-missing", want: false},
		{name: "empty name", ext: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := r.IsRegistered(tt.ext); got != tt.want {
				t.Errorf("IsRegistered(%q) = %v, want %v", tt.ext, got, tt.want)
			}
		})
	}
}

// --- ValidAtScope ---

func TestValidAtScope(t *testing.T) {
	r := extensions.NewRegistry()
	r.Register(extensions.ExtensionMeta{
		Name:   "x-info-only",
		Scopes: []extensions.Scope{extensions.ScopeInfo},
	})
	r.Register(extensions.ExtensionMeta{
		Name:   "x-multi",
		Scopes: []extensions.Scope{extensions.ScopeInfo, extensions.ScopeOperation},
	})

	tests := []struct {
		name  string
		ext   string
		scope extensions.Scope
		want  bool
	}{
		{name: "exact scope match", ext: "x-info-only", scope: extensions.ScopeInfo, want: true},
		{name: "wrong scope", ext: "x-info-only", scope: extensions.ScopeSchema, want: false},
		{name: "multi-scope first", ext: "x-multi", scope: extensions.ScopeInfo, want: true},
		{name: "multi-scope second", ext: "x-multi", scope: extensions.ScopeOperation, want: true},
		{name: "multi-scope wrong", ext: "x-multi", scope: extensions.ScopeTag, want: false},
		{name: "unknown ext valid everywhere", ext: "x-unknown", scope: extensions.ScopeRoot, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := r.ValidAtScope(tt.ext, tt.scope); got != tt.want {
				t.Errorf("ValidAtScope(%q, %q) = %v, want %v", tt.ext, tt.scope, got, tt.want)
			}
		})
	}
}

// --- LoadDir ---

func TestLoadDir(t *testing.T) {
	dir := t.TempDir()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	valid := map[string]interface{}{
		"name":        "x-loaded",
		"scope":       []string{"operation"},
		"description": "loaded from dir",
		"schema":      map[string]string{"type": "string"},
	}
	data, _ := json.Marshal(valid)
	os.WriteFile(filepath.Join(dir, "x-loaded.json"), data, 0644)

	os.WriteFile(filepath.Join(dir, "readme.md"), []byte("# not json"), 0644)

	r := extensions.NewRegistry()
	if err := extensions.LoadDir(dir, r, logger); err != nil {
		t.Fatal(err)
	}

	if !r.IsRegistered("x-loaded") {
		t.Error("expected x-loaded to be registered after LoadDir")
	}
	if r.Count() != 1 {
		t.Errorf("Count() = %d, want 1 (non-json should be skipped)", r.Count())
	}
}

func TestLoadDir_NonexistentDir(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	r := extensions.NewRegistry()
	if err := extensions.LoadDir("/tmp/nonexistent-telescope-test-dir", r, logger); err != nil {
		t.Errorf("nonexistent dir should not error, got: %v", err)
	}
	if r.Count() != 0 {
		t.Errorf("Count() = %d after loading nonexistent dir", r.Count())
	}
}

func TestLoadDir_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))

	os.WriteFile(filepath.Join(dir, "bad.json"), []byte("{invalid"), 0644)

	r := extensions.NewRegistry()
	if err := extensions.LoadDir(dir, r, logger); err != nil {
		t.Fatalf("invalid JSON should warn, not error: %v", err)
	}
	if r.Count() != 0 {
		t.Errorf("Count() = %d, want 0 for invalid JSON", r.Count())
	}
}

// --- Registry.Count and SetRequired ---

func TestRegistryCountAndRequired(t *testing.T) {
	r := extensions.NewRegistry()
	if r.Count() != 0 {
		t.Fatalf("new registry Count() = %d", r.Count())
	}

	r.Register(extensions.ExtensionMeta{Name: "x-a", Scopes: []extensions.Scope{extensions.ScopeRoot}})
	r.Register(extensions.ExtensionMeta{Name: "x-b", Scopes: []extensions.Scope{extensions.ScopeRoot}})

	if r.Count() != 2 {
		t.Errorf("Count() = %d, want 2", r.Count())
	}

	r.SetRequired([]string{"x-a"})
	if !r.IsRequired("x-a") {
		t.Error("x-a should be required")
	}
	if r.IsRequired("x-b") {
		t.Error("x-b should not be required")
	}

	r.SetRequired([]string{"x-b"})
	if r.IsRequired("x-a") {
		t.Error("x-a should no longer be required after SetRequired replaces the set")
	}
	if !r.IsRequired("x-b") {
		t.Error("x-b should be required")
	}
}

// --- Register with invalid schema ---

func TestRegister_InvalidSchema(t *testing.T) {
	r := extensions.NewRegistry()
	err := r.Register(extensions.ExtensionMeta{
		Name:   "x-bad-schema",
		Scopes: []extensions.Scope{extensions.ScopeRoot},
		Schema: json.RawMessage(`{not valid json`),
	})
	if err == nil {
		t.Error("expected error for invalid schema JSON")
	}
}
