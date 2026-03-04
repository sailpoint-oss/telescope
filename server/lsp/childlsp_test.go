package lsp

import (
	"testing"
)

func TestLangIDForURI(t *testing.T) {
	tests := []struct {
		uri  string
		want string
	}{
		{"file:///path/to/spec.yaml", "yaml"},
		{"file:///path/to/spec.yml", "yaml"},
		{"file:///path/to/spec.YAML", "yaml"},
		{"file:///path/to/spec.json", "json"},
		{"file:///path/to/spec.JSON", "json"},
		{"file:///path/to/spec.txt", ""},
		{"file:///path/to/spec", ""},
	}

	for _, tt := range tests {
		got := langIDForURI(tt.uri)
		if got != tt.want {
			t.Errorf("langIDForURI(%q) = %q, want %q", tt.uri, got, tt.want)
		}
	}
}

func TestNodeAvailable(t *testing.T) {
	// This test merely confirms the function doesn't panic.
	// Whether it returns true or false depends on the test environment.
	_ = NodeAvailable()
}

func TestChildLSPManager_NotStarted(t *testing.T) {
	mgr := NewChildLSPManager(nil, nil)

	if mgr.Available() {
		t.Error("expected Available() = false before Start")
	}

	// Document sync methods should not panic when not started.
	mgr.DidOpen(nil, nil)
	mgr.DidChange(nil, nil)
	mgr.DidClose(nil, nil)
}
