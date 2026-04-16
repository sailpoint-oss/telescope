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
