package validation

import (
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestEnrichAdditionalDiagnostics(t *testing.T) {
	input := []protocol.Diagnostic{
		{
			Message: "Required property 'name' is missing",
			Source:  "additional-validation",
		},
	}

	got := enrichAdditionalDiagnostics(input, "test-group", "test-schema.json")
	if len(got) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(got))
	}
	if got[0].Source != "json-schema" {
		t.Fatalf("expected source json-schema, got %q", got[0].Source)
	}
	if got[0].Code != "json-schema" {
		t.Fatalf("expected code json-schema, got %v", got[0].Code)
	}
	if !strings.Contains(got[0].Message, "[schema:test-schema.json group:test-group]") {
		t.Fatalf("expected schema/group context in message, got %q", got[0].Message)
	}
}
