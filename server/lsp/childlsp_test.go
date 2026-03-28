package lsp

import (
	"context"
	"testing"
	"time"

	"github.com/LukasParke/gossip/protocol"
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
	ctx := context.Background()

	if mgr.Available() {
		t.Error("expected Available() = false before Start")
	}

	// Document sync methods should not panic when not started.
	mgr.DidOpen(ctx, nil)
	mgr.DidChange(ctx, nil)
	mgr.DidClose(ctx, nil)
}

func TestChildLSPManager_DidClosePreservesTelescopeDiagnostics(t *testing.T) {
	published := make(chan []protocol.Diagnostic, 4)
	mgr := NewChildLSPManager(func(_ context.Context, params *protocol.PublishDiagnosticsParams) error {
		out := make([]protocol.Diagnostic, len(params.Diagnostics))
		copy(out, params.Diagnostics)
		published <- out
		return nil
	}, nil)

	uri := protocol.DocumentURI("file:///workspace/spec.yaml")
	telescopeDiag := protocol.Diagnostic{
		Source:   "telescope",
		Message:  "main diagnostics remain",
		Severity: protocol.SeverityWarning,
	}
	childDiag := protocol.Diagnostic{
		Source:   "yaml-ls",
		Message:  "child diagnostics are cleared",
		Severity: protocol.SeverityError,
	}

	mgr.Aggregator().Set(uri, "telescope", []protocol.Diagnostic{telescopeDiag})
	mgr.Aggregator().Set(uri, "yaml-ls", []protocol.Diagnostic{childDiag})
	mgr.Aggregator().FlushNow(uri)

	select {
	case <-published:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for initial merged diagnostics")
	}

	mgr.DidClose(context.Background(), &protocol.DidCloseTextDocumentParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
	})

	select {
	case diags := <-published:
		if len(diags) != 1 {
			t.Fatalf("expected only telescope diagnostics after close, got %d", len(diags))
		}
		if diags[0].Source != "telescope" {
			t.Fatalf("expected telescope diagnostics to remain, got source=%q", diags[0].Source)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for post-close diagnostics")
	}
}
