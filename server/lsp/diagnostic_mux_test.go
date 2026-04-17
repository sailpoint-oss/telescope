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

// TestDiagnosticMux_CoalescesBursts verifies that a tight burst of Set calls
// on the same URI yields a single publish containing the merged final state,
// not three separate publishes. Matches the production debounce used for
// Barrelman + Vacuum + diff-on-save updates landing during a keystroke.
func TestDiagnosticMux_CoalescesBursts(t *testing.T) {
	var publishCount int
	var lastDiags []protocol.Diagnostic
	done := make(chan struct{})
	mux := NewDiagnosticMux(func(_ context.Context, params *protocol.PublishDiagnosticsParams) error {
		publishCount++
		lastDiags = append([]protocol.Diagnostic(nil), params.Diagnostics...)
		close(done)
		return nil
	}, nil)
	mux.SetCoalesceWindow(25 * time.Millisecond)

	uri := protocol.DocumentURI("file:///burst.yaml")
	mux.Set(uri, "barrelman", []protocol.Diagnostic{{Message: "b"}})
	mux.Set(uri, "vacuum", []protocol.Diagnostic{{Message: "v"}})
	mux.Set(uri, "diff", []protocol.Diagnostic{{Message: "d"}})

	select {
	case <-done:
	case <-time.After(500 * time.Millisecond):
		t.Fatal("coalesced publish never fired")
	}

	if publishCount != 1 {
		t.Fatalf("expected exactly 1 coalesced publish, got %d", publishCount)
	}
	if len(lastDiags) != 3 {
		t.Fatalf("expected 3 merged diagnostics, got %d: %+v", len(lastDiags), lastDiags)
	}
}

// TestDiagnosticMux_CoalesceResetsOnBursts verifies that a later Set before
// the timer fires resets the window (i.e. the mux does not publish an older
// partial snapshot while subsequent Sets are still arriving).
func TestDiagnosticMux_CoalesceResetsOnBursts(t *testing.T) {
	var publishCount int
	mux := NewDiagnosticMux(func(_ context.Context, _ *protocol.PublishDiagnosticsParams) error {
		publishCount++
		return nil
	}, nil)
	mux.SetCoalesceWindow(30 * time.Millisecond)

	uri := protocol.DocumentURI("file:///reset.yaml")
	mux.Set(uri, "a", []protocol.Diagnostic{{Message: "a"}})
	time.Sleep(15 * time.Millisecond)
	mux.Set(uri, "b", []protocol.Diagnostic{{Message: "b"}})
	time.Sleep(15 * time.Millisecond)
	mux.Set(uri, "c", []protocol.Diagnostic{{Message: "c"}})
	// Wait well past the window for the final publish.
	time.Sleep(60 * time.Millisecond)

	if publishCount != 1 {
		t.Fatalf("expected a single coalesced publish after a running burst, got %d", publishCount)
	}
}
