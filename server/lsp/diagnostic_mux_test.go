package lsp

import (
	"context"
	"testing"
	"time"

	"github.com/LukasParke/gossip/protocol"
)

func TestDiagnosticMux_MergesSources(t *testing.T) {
	published := make(chan []protocol.Diagnostic, 4)
	mux := NewDiagnosticMux(func(_ context.Context, params *protocol.PublishDiagnosticsParams) error {
		out := append([]protocol.Diagnostic(nil), params.Diagnostics...)
		published <- out
		return nil
	}, nil)

	uri := protocol.DocumentURI("file:///workspace/spec.yaml")
	mux.Set(uri, "telescope", []protocol.Diagnostic{{
		Source:   "telescope",
		Message:  "main diagnostics remain",
		Severity: protocol.SeverityWarning,
	}})
	mux.Set(uri, contractDiagSource, []protocol.Diagnostic{{
		Source:   contractDiagSource,
		Message:  "contract diagnostics are merged",
		Severity: protocol.SeverityError,
	}})
	mux.FlushNow(uri)

	deadline := time.After(2 * time.Second)
	for {
		select {
		case diags := <-published:
			if len(diags) == 2 {
				return
			}
		case <-deadline:
			t.Fatal("timed out waiting for merged diagnostics")
		}
	}
}

func TestDiagnosticMux_ClearSourcePreservesOthers(t *testing.T) {
	published := make(chan []protocol.Diagnostic, 4)
	mux := NewDiagnosticMux(func(_ context.Context, params *protocol.PublishDiagnosticsParams) error {
		out := append([]protocol.Diagnostic(nil), params.Diagnostics...)
		published <- out
		return nil
	}, nil)

	uri := protocol.DocumentURI("file:///workspace/spec.yaml")
	mux.Set(uri, "telescope", []protocol.Diagnostic{{
		Source:   "telescope",
		Message:  "main diagnostics remain",
		Severity: protocol.SeverityWarning,
	}})
	mux.Set(uri, contractDiagSource, []protocol.Diagnostic{{
		Source:   contractDiagSource,
		Message:  "contract diagnostics are cleared",
		Severity: protocol.SeverityError,
	}})
	mux.FlushNow(uri)
	deadline := time.After(2 * time.Second)
	for {
		select {
		case diags := <-published:
			if len(diags) == 2 {
				goto clearContract
			}
		case <-deadline:
			t.Fatal("timed out waiting for initial diagnostics")
		}
	}

clearContract:
	drainDiagnostics(published)
	mux.ClearSource(uri, contractDiagSource)

	deadline = time.After(2 * time.Second)
	for {
		select {
		case diags := <-published:
			if len(diags) != 1 {
				continue
			}
			if diags[0].Source != "telescope" {
				t.Fatalf("expected telescope diagnostics to remain, got source=%q", diags[0].Source)
			}
			return
		case <-deadline:
			t.Fatal("timed out waiting for post-clear diagnostics")
		}
	}
}

func drainDiagnostics(ch <-chan []protocol.Diagnostic) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}
