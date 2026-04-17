package vacuum

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestDeduplicate_PrefersPrimaryAtSameLocation(t *testing.T) {
	primary := []protocol.Diagnostic{{
		Range: protocol.Range{
			Start: protocol.Position{Line: 3, Character: 2},
			End:   protocol.Position{Line: 3, Character: 8},
		},
		Code:    "info-contact",
		Message: "primary",
		Source:  "telescope",
	}}
	secondary := []protocol.Diagnostic{
		{
			Range: protocol.Range{
				Start: protocol.Position{Line: 3, Character: 2},
				End:   protocol.Position{Line: 3, Character: 8},
			},
			Code:    "info-contact",
			Message: "secondary",
			Source:  Source,
		},
		{
			Range: protocol.Range{
				Start: protocol.Position{Line: 5, Character: 0},
				End:   protocol.Position{Line: 5, Character: 4},
			},
			Code:    "operation-success-response",
			Message: "keep me",
			Source:  Source,
		},
	}

	got := Deduplicate(primary, secondary)
	if len(got) != 2 {
		t.Fatalf("Deduplicate() returned %d diagnostics, want 2", len(got))
	}
	if code, _ := got[1].Code.(string); code != "operation-success-response" {
		t.Fatalf("unexpected secondary diagnostic retained: %+v", got[1])
	}
}

// TestDeduplicate_FoldsAliasPairs confirms the cross-engine dedup drops one
// of each aliased pair when both land at the same source location.
// Documented in docs/pr-review-tooling.md gap #8.
func TestDeduplicate_FoldsAliasPairs(t *testing.T) {
	pos := protocol.Range{
		Start: protocol.Position{Line: 10, Character: 4},
		End:   protocol.Position{Line: 10, Character: 20},
	}
	primary := []protocol.Diagnostic{
		{Range: pos, Code: "sp-115", Message: "missing description", Source: "telescope"},
		{Range: pos, Code: "sp-403", Message: "missing 4xx", Source: "telescope"},
	}
	secondary := []protocol.Diagnostic{
		{Range: pos, Code: "parameter-description", Message: "alias of sp-115", Source: Source},
		{Range: pos, Code: "missing-error-responses", Message: "alias of sp-403", Source: Source},
	}
	got := Deduplicate(primary, secondary)
	if len(got) != 2 {
		t.Fatalf("alias-aliased secondaries should collapse onto primaries; got %d: %+v", len(got), got)
	}
	for _, d := range got {
		if code, _ := d.Code.(string); code == "parameter-description" || code == "missing-error-responses" {
			t.Fatalf("alias %q should have been dropped; got %+v", code, got)
		}
	}
}

// TestDeduplicateWithin_FoldsAliasPairs covers the single-stream dedup path
// used after Barrelman+Vacuum merge.
func TestDeduplicateWithin_FoldsAliasPairs(t *testing.T) {
	pos := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 0},
		End:   protocol.Position{Line: 1, Character: 5},
	}
	diags := []protocol.Diagnostic{
		{Range: pos, Code: "parameter-description", Message: "alias first"},
		{Range: pos, Code: "sp-115", Message: "canonical second"},
	}
	got := DeduplicateWithin(diags)
	if len(got) != 1 {
		t.Fatalf("expected 1 diagnostic after within-dedup, got %d: %+v", len(got), got)
	}
	// Canonical rule should win even when it arrives second.
	if code, _ := got[0].Code.(string); code != "sp-115" {
		t.Fatalf("expected canonical sp-115 to be retained, got %q (msg=%q)", code, got[0].Message)
	}
}

// TestDeduplicateWithin_KeepsDistinctLocations ensures dedup doesn't erase
// real duplicates that happen to share a rule ID at different positions.
func TestDeduplicateWithin_KeepsDistinctLocations(t *testing.T) {
	diags := []protocol.Diagnostic{
		{Range: protocol.Range{Start: protocol.Position{Line: 1, Character: 0}}, Code: "sp-115"},
		{Range: protocol.Range{Start: protocol.Position{Line: 5, Character: 2}}, Code: "sp-115"},
	}
	got := DeduplicateWithin(diags)
	if len(got) != 2 {
		t.Fatalf("distinct locations should not dedup, got %d: %+v", len(got), got)
	}
}

func TestCanonicalRuleID(t *testing.T) {
	cases := map[string]string{
		"parameter-description":   "sp-115",
		"missing-error-responses": "sp-403",
		"missing-pagination":      "sp-602",
		"sp-115":                  "sp-115",
		"some-other-rule":         "some-other-rule",
		"":                        "",
	}
	for in, want := range cases {
		if got := canonicalRuleID(in); got != want {
			t.Errorf("canonicalRuleID(%q) = %q, want %q", in, got, want)
		}
	}
}
