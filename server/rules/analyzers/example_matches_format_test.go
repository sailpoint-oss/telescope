package analyzers

import (
	"testing"

	"github.com/sailpoint-oss/barrelman"
	navigator "github.com/sailpoint-oss/navigator"
)

func TestCheckFormat_AcceptsValid(t *testing.T) {
	cases := []struct {
		format, value string
	}{
		{"date-time", "2026-04-16T18:00:00Z"},
		{"date-time", "2026-04-16T18:00:00.123456Z"},
		{"date", "2026-04-16"},
		{"uuid", "550e8400-e29b-41d4-a716-446655440000"},
		{"email", "user@example.com"},
		{"uri", "https://example.com/path"},
		{"ipv4", "203.0.113.1"},
		{"ipv6", "2001:db8::1"},
		{"hostname", "api.example.com"},
		// An unknown format must pass through without failing.
		{"custom-unknown-format", "anything"},
		// Empty format must not fail.
		{"", "literally anything"},
	}
	for _, tc := range cases {
		t.Run(tc.format+"/"+tc.value, func(t *testing.T) {
			if msg, ok := checkFormat(tc.format, tc.value); !ok {
				t.Fatalf("checkFormat(%q, %q) rejected: %s", tc.format, tc.value, msg)
			}
		})
	}
}

func TestCheckFormat_RejectsInvalid(t *testing.T) {
	cases := []struct {
		format, value string
	}{
		{"date-time", "not a date"},
		{"date-time", "2021-01-28T14:18Z"}, // missing seconds
		{"date", "2026/04/16"},
		{"uuid", "not-a-uuid"},
		{"email", "no-at-sign"},
		{"uri", "relative-only"},
		{"ipv4", "999.999.999.999"},
		{"ipv6", "203.0.113.1"}, // IPv4 passed as IPv6
		{"hostname", "not a hostname with spaces"},
	}
	for _, tc := range cases {
		t.Run(tc.format+"/"+tc.value, func(t *testing.T) {
			if _, ok := checkFormat(tc.format, tc.value); ok {
				t.Fatalf("checkFormat(%q, %q) unexpectedly accepted", tc.format, tc.value)
			}
		})
	}
}

// TestCheckFormat_EmptyExampleFlagged reproduces a common class of bug:
// a YAML round-trip silently turned `created: '2021-09-28T02:15:44.644Z'`
// into `created: {}`, which navigator exposes as an Example node with an
// empty Value. The rule must flag this as a non-string example.
func TestCheckFormat_EmptyExampleFlagged(t *testing.T) {
	msg, ok := checkFormat("date-time", "")
	if ok {
		t.Fatal("empty value should not satisfy date-time format")
	}
	if msg == "" {
		t.Fatal("expected an error message explaining the empty example")
	}
}

func TestCheckFormat_QuotedValueUnwraps(t *testing.T) {
	if _, ok := checkFormat("uuid", `"550e8400-e29b-41d4-a716-446655440000"`); !ok {
		t.Fatal("quoted UUID should be accepted after unwrap")
	}
}

func TestExampleMatchesFormatRule_RegistersUnderRecommended(t *testing.T) {
	r := exampleMatchesFormatRule()
	if r.ID != "example-matches-format" {
		t.Fatalf("ID = %q", r.ID)
	}
	if !r.Meta.Recommended {
		t.Fatal("rule must be Recommended so it appears under telescope:recommended")
	}
	if r.Meta.Severity != barrelman.SeverityError {
		t.Fatalf("severity = %d, want error (1)", r.Meta.Severity)
	}
	if r.Run == nil {
		t.Fatal("Run must be set")
	}
}

func TestExampleMatchesFormat_EmitsDiagnosticForBadExample(t *testing.T) {
	schema := &navigator.Schema{
		Type:   "string",
		Format: "date-time",
		Example: &navigator.Node{
			Value: "not-a-date",
			Loc:   navigator.Loc{Range: navigator.Range{Start: navigator.Position{Line: 10, Character: 4}}},
		},
	}
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Schemas: map[string]*navigator.Schema{"Pet": schema},
		},
	}
	diags := runExampleMatchesFormat(ctx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d: %+v", len(diags), diags)
	}
	if diags[0].Code != "example-matches-format" {
		t.Fatalf("code = %q", diags[0].Code)
	}
}

func TestExampleMatchesFormat_WalksNestedSchemas(t *testing.T) {
	inner := &navigator.Schema{
		Type:   "string",
		Format: "uuid",
		Example: &navigator.Node{
			Value: "not-a-uuid",
		},
	}
	top := &navigator.Schema{
		Type:       "object",
		Properties: map[string]*navigator.Schema{"id": inner},
	}
	ctx := &barrelman.AnalysisContext{
		URI: "file:///t.yaml",
		Index: &navigator.Index{
			Schemas: map[string]*navigator.Schema{"Root": top},
		},
	}
	diags := runExampleMatchesFormat(ctx)
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic from nested schema, got %d: %+v", len(diags), diags)
	}
}

func TestExampleMatchesFormat_NilSafe(t *testing.T) {
	if d := runExampleMatchesFormat(nil); d != nil {
		t.Fatalf("nil context should return nil, got %+v", d)
	}
	if d := runExampleMatchesFormat(&barrelman.AnalysisContext{}); d != nil {
		t.Fatalf("empty context should return nil, got %+v", d)
	}
}
