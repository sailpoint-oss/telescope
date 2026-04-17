package lintengine

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// TestFilterAnalyzers_AllowlistSemantics captures the fix for the ruleset
// gating bug described in docs/pr-review-tooling.md gap #9: when a user
// extends a named preset (e.g. telescope:recommended), rules NOT present in
// the preset must not run, even if they are not explicitly disabled.
func TestFilterAnalyzers_AllowlistSemantics(t *testing.T) {
	all := []rules.NamedAnalyzer{
		{ID: "in-preset"},
		{ID: "disabled-in-preset"},
		{ID: "absent-from-preset"},
	}
	enabled := map[string]bool{
		"in-preset":          true,
		"disabled-in-preset": false,
		// "absent-from-preset" intentionally missing
	}
	got := filterAnalyzers(all, enabled)
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1 (only in-preset); got %+v", len(got), got)
	}
	if got[0].ID != "in-preset" {
		t.Fatalf("got[0].ID = %q, want in-preset", got[0].ID)
	}
}

func TestFilterChecks_AllowlistSemantics(t *testing.T) {
	all := []rules.NamedCheck{
		{Name: "in-preset"},
		{Name: "disabled-in-preset"},
		{Name: "absent-from-preset"},
	}
	enabled := map[string]bool{
		"in-preset":          true,
		"disabled-in-preset": false,
	}
	got := filterChecks(all, enabled)
	if len(got) != 1 {
		t.Fatalf("len(got) = %d, want 1; got %+v", len(got), got)
	}
	if got[0].Name != "in-preset" {
		t.Fatalf("got[0].Name = %q, want in-preset", got[0].Name)
	}
}

func TestFilterAnalyzers_EmptyMapRunsAll(t *testing.T) {
	// Empty map means no preset was resolved — fall back to running every rule.
	// Matters for tests and for the legacy path where cfg is nil.
	all := []rules.NamedAnalyzer{{ID: "a"}, {ID: "b"}, {ID: "c"}}
	got := filterAnalyzers(all, nil)
	if len(got) != 3 {
		t.Fatalf("empty map should pass all; got %+v", got)
	}
}

func TestFilterDisabledDiagnostics_AllowlistWithCodelessPassthrough(t *testing.T) {
	enabled := map[string]bool{
		"in-preset": true,
		// "owasp-xyz" absent, should be dropped
		// "disabled" explicitly false
		"disabled": false,
	}
	diags := []protocol.Diagnostic{
		{Code: "in-preset", Message: "kept"},
		{Code: "owasp-xyz", Message: "absent-from-preset: dropped"},
		{Code: "disabled", Message: "explicitly-off: dropped"},
		{Code: "", Message: "codeless: kept"},
	}
	got := filterDisabledDiagnostics(diags, enabled)
	if len(got) != 2 {
		t.Fatalf("len(got) = %d, want 2 (in-preset + codeless); got %+v", len(got), got)
	}
	if got[0].Message != "kept" || got[1].Message != "codeless: kept" {
		t.Fatalf("unexpected kept set: %+v", got)
	}
}
