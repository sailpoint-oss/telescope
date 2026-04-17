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

// TestDeduplicate_FoldsAliasPairs confirms the cross-engine dedup drops
// one of each aliased pair (vacuum-shaped alongside canonical SailPoint)
// when both land at the same source location. The categoryBucket routes
// the code through the barrelman bridge so
// `parameter-description` and `sailpoint-parameter-description` collide
// on the same key.
func TestDeduplicate_FoldsAliasPairs(t *testing.T) {
	pos := protocol.Range{
		Start: protocol.Position{Line: 10, Character: 4},
		End:   protocol.Position{Line: 10, Character: 20},
	}
	primary := []protocol.Diagnostic{
		{Range: pos, Code: "sailpoint-parameter-description", Message: "missing description", Source: "telescope"},
		{Range: pos, Code: "sailpoint-operation-4xx-response", Message: "missing 4xx", Source: "telescope"},
	}
	secondary := []protocol.Diagnostic{
		{Range: pos, Code: "parameter-description", Message: "alias of sailpoint-parameter-description", Source: Source},
		{Range: pos, Code: "missing-error-responses", Message: "alias of sailpoint-operation-4xx-response", Source: Source},
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

// TestDeduplicateWithin_FoldsAliasPairs covers the single-stream dedup
// path used after Barrelman+Vacuum merge. Both the canonical SailPoint
// slug and its vacuum-shaped alias share a bridge bucket, so the
// second one collapses onto the first.
func TestDeduplicateWithin_FoldsAliasPairs(t *testing.T) {
	pos := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 0},
		End:   protocol.Position{Line: 1, Character: 5},
	}
	diags := []protocol.Diagnostic{
		{Range: pos, Code: "parameter-description", Message: "alias first"},
		{Range: pos, Code: "sailpoint-parameter-description", Message: "canonical second"},
	}
	got := DeduplicateWithin(diags)
	if len(got) != 1 {
		t.Fatalf("expected 1 diagnostic after within-dedup, got %d: %+v", len(got), got)
	}
	// Canonical rule should win even when it arrives second.
	if code, _ := got[0].Code.(string); code != "sailpoint-parameter-description" {
		t.Fatalf("expected canonical sailpoint-parameter-description to be retained, got %q (msg=%q)", code, got[0].Message)
	}
}

// TestDeduplicateWithin_KeepsDistinctLocations ensures dedup does not
// erase real duplicates that happen to share a rule ID at different
// positions.
func TestDeduplicateWithin_KeepsDistinctLocations(t *testing.T) {
	diags := []protocol.Diagnostic{
		{Range: protocol.Range{Start: protocol.Position{Line: 1, Character: 0}}, Code: "sailpoint-parameter-description"},
		{Range: protocol.Range{Start: protocol.Position{Line: 5, Character: 2}}, Code: "sailpoint-parameter-description"},
	}
	got := DeduplicateWithin(diags)
	if len(got) != 2 {
		t.Fatalf("distinct locations should not dedup, got %d: %+v", len(got), got)
	}
}

func TestCanonicalRuleID(t *testing.T) {
	cases := map[string]string{
		"parameter-description":           "sailpoint-parameter-description",
		"missing-error-responses":         "sailpoint-operation-4xx-response",
		"missing-pagination":              "sailpoint-collection-offset-pagination",
		"sailpoint-parameter-description": "sailpoint-parameter-description",
		"some-other-rule":                 "some-other-rule",
		"":                                "",
	}
	for in, want := range cases {
		if got := canonicalRuleID(in); got != want {
			t.Errorf("canonicalRuleID(%q) = %q, want %q", in, got, want)
		}
	}
}
