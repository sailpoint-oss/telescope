package bun

import (
	"encoding/json"
	"testing"
)

func TestEnvelopeRoundTrip(t *testing.T) {
	tests := []struct {
		name string
		msg  Envelope
	}{
		{
			name: "ping",
			msg:  Envelope{ID: "1", Type: MsgPing},
		},
		{
			name: "loadRules request",
			msg: Envelope{
				ID:   "42",
				Type: MsgLoadRules,
				Payload: mustMarshal(t, LoadRulesRequest{
					Rules: []RuleConfig{
						{ID: "my-rule", Path: "/rules/custom.ts", Kind: "openapi"},
					},
					WorkDir: "/workspace",
				}),
			},
		},
		{
			name: "runRules request",
			msg: Envelope{
				ID:   "100",
				Type: MsgRunRules,
				Payload: mustMarshal(t, RunRulesRequest{
					DocumentURI: "file:///test.yaml",
					RuleIDs:     []string{"my-rule"},
				}),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.msg)
			if err != nil {
				t.Fatalf("marshal: %v", err)
			}
			var decoded Envelope
			if err := json.Unmarshal(data, &decoded); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if decoded.ID != tt.msg.ID {
				t.Errorf("ID: got %s, want %s", decoded.ID, tt.msg.ID)
			}
			if decoded.Type != tt.msg.Type {
				t.Errorf("Type: got %s, want %s", decoded.Type, tt.msg.Type)
			}
		})
	}
}

func TestSidecarDiagnosticConversion(t *testing.T) {
	sd := SidecarDiagnostic{
		StartLine: 5,
		StartChar: 0,
		EndLine:   5,
		EndChar:   10,
		Severity:  1,
		Code:      "zod-validation",
		Message:   "expected string, got number",
		Source:    "bun/zod",
	}

	diags := convertDiagnostics([]SidecarDiagnostic{sd})
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	d := diags[0]
	if d.Code != "zod-validation" {
		t.Errorf("Code: got %q, want %q", d.Code, "zod-validation")
	}
	if d.Source != "bun/zod" {
		t.Errorf("Source: got %q, want %q", d.Source, "bun/zod")
	}
}

func mustMarshal(t *testing.T, v any) json.RawMessage {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
