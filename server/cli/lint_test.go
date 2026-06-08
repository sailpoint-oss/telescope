package cli

import (
	"encoding/json"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestFileDiagnosticsJSON(t *testing.T) {
	results := []fileDiagnostics{{
		Path: "api.yaml",
		Diagnostics: []protocol.Diagnostic{{
			Range:    protocol.Range{Start: protocol.Position{Line: 1, Character: 2}},
			Severity: protocol.SeverityError,
			Code:     "test-rule",
			Message:  "something failed",
		}},
	}}

	output := captureStdout(t, func() { outputJSON(results) })

	var decoded []map[string]json.RawMessage
	if err := json.Unmarshal([]byte(output), &decoded); err != nil {
		t.Fatalf("output is not valid JSON array: %v\noutput: %s", err, output)
	}
	if len(decoded) != 1 {
		t.Fatalf("expected 1 file entry, got %d", len(decoded))
	}
	entry := decoded[0]
	if _, ok := entry["path"]; !ok {
		t.Fatalf("expected lowercase path key, got keys: %v", keys(entry))
	}
	if _, ok := entry["Path"]; ok {
		t.Fatal("unexpected PascalCase Path key in JSON output")
	}
	if _, ok := entry["diagnostics"]; !ok {
		t.Fatalf("expected lowercase diagnostics key, got keys: %v", keys(entry))
	}
	if _, ok := entry["Diagnostics"]; ok {
		t.Fatal("unexpected PascalCase Diagnostics key in JSON output")
	}
}

func keys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
