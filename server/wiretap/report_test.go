package wiretap

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFindingFromStreamedError_RequestVsResponse(t *testing.T) {
	req := findingFromStreamedError(streamedValidationError{
		Message:           "body bad",
		ValidationType:    "request",
		ValidationSubType: "body",
		RequestMethod:     "post",
		RequestPath:       "/users",
	})
	if req.Direction != "request" {
		t.Fatalf("expected request direction, got %q", req.Direction)
	}
	if req.Method != "POST" {
		t.Fatalf("method should be uppercased; got %q", req.Method)
	}
	if req.RuleID != "request.body" {
		t.Fatalf("expected combined ruleID 'request.body', got %q", req.RuleID)
	}

	resp := findingFromStreamedError(streamedValidationError{
		Message:        "status mismatch",
		ValidationType: "RESPONSE_VALIDATION",
		RequestMethod:  "GET",
		RequestPath:    "/accounts",
	})
	if resp.Direction != "response" {
		t.Fatalf("expected response direction from 'RESPONSE_VALIDATION', got %q", resp.Direction)
	}
}

func TestFindingFromStreamedError_UsesSchemaFieldPath(t *testing.T) {
	errIn := streamedValidationError{
		Message:        "invalid",
		ValidationType: "request",
		RequestMethod:  "POST",
		RequestPath:    "/users",
		SchemaValidationErrors: []struct {
			Reason    string `json:"reason"`
			FieldPath string `json:"fieldPath"`
		}{
			{Reason: "too long", FieldPath: "/name"},
		},
	}
	got := findingFromStreamedError(errIn)
	if got.FieldPath != "/name" {
		t.Fatalf("expected FieldPath '/name', got %q", got.FieldPath)
	}
	if !strings.Contains(got.Message, "too long") {
		t.Fatalf("expected message to include schema reason, got %q", got.Message)
	}
}

func TestFindingFromStreamedError_DefaultsRuleIDToDirection(t *testing.T) {
	got := findingFromStreamedError(streamedValidationError{
		Message:       "no validation type",
		RequestMethod: "GET",
		RequestPath:   "/x",
	})
	if got.RuleID != "request" {
		t.Fatalf("expected fallback ruleID = direction, got %q", got.RuleID)
	}
}

func TestCollectReport_NilSidecar(t *testing.T) {
	var s *Sidecar
	findings, err := s.CollectReport()
	if err != nil {
		t.Fatalf("nil sidecar should return nil, nil; got err=%v", err)
	}
	if findings != nil {
		t.Fatalf("nil sidecar should return nil findings; got %+v", findings)
	}
}

func TestCollectReport_EmptyReportFile(t *testing.T) {
	s := &Sidecar{}
	findings, err := s.CollectReport()
	if err != nil {
		t.Fatalf("empty reportFile should not error; got %v", err)
	}
	if findings != nil {
		t.Fatalf("expected nil findings for empty reportFile, got %+v", findings)
	}
}

func TestCollectReport_MissingFileReturnsNilNil(t *testing.T) {
	dir := t.TempDir()
	s := &Sidecar{reportFile: filepath.Join(dir, "does-not-exist.jsonl")}
	findings, err := s.CollectReport()
	if err != nil {
		t.Fatalf("missing file should not error; got %v", err)
	}
	if findings != nil {
		t.Fatalf("expected nil findings, got %+v", findings)
	}
}

func TestCollectReport_ParsesValidJSONL(t *testing.T) {
	dir := t.TempDir()
	report := filepath.Join(dir, "wiretap.jsonl")
	lines := []string{
		`{"message":"bad body","validationType":"request","validationSubType":"body","requestMethod":"POST","requestPath":"/users"}`,
		``,
		`{"message":"bad status","validationType":"response","requestMethod":"GET","requestPath":"/users"}`,
	}
	if err := os.WriteFile(report, []byte(strings.Join(lines, "\n")+"\n"), 0o644); err != nil {
		t.Fatalf("write report: %v", err)
	}
	s := &Sidecar{reportFile: report}
	findings, err := s.CollectReport()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(findings) != 2 {
		t.Fatalf("expected 2 findings, got %d: %+v", len(findings), findings)
	}
	if findings[0].Direction != "request" || findings[1].Direction != "response" {
		t.Fatalf("unexpected direction set: %+v", findings)
	}
}

func TestCollectReport_ErrorsOnMalformedLine(t *testing.T) {
	dir := t.TempDir()
	report := filepath.Join(dir, "wiretap.jsonl")
	// Second line is invalid JSON.
	if err := os.WriteFile(report, []byte(`{"message":"good"}`+"\n"+`{broken`+"\n"), 0o644); err != nil {
		t.Fatalf("write report: %v", err)
	}
	s := &Sidecar{reportFile: report}
	if _, err := s.CollectReport(); err == nil {
		t.Fatal("expected parse error, got nil")
	}
}

func TestToDiagnostics_UsesSpecLineWhenProvided(t *testing.T) {
	findings := []WiretapFinding{{
		Method:    "POST",
		Path:      "/users",
		Direction: "request",
		Message:   "bad body",
		RuleID:    "request.body",
		SpecLine:  42,
		SpecColumn: 8,
	}}
	diags := ToDiagnostics(findings, nil, "file:///spec.yaml")
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(diags))
	}
	if diags[0].Range.Start.Line != 41 || diags[0].Range.Start.Character != 7 {
		t.Fatalf("expected 0-indexed line/col (41,7), got %+v", diags[0].Range)
	}
	if !strings.Contains(diags[0].Message, "POST /users") {
		t.Fatalf("message should include method/path prefix, got %q", diags[0].Message)
	}
	if code, _ := diags[0].Code.(string); code != "wiretap.request.body" {
		t.Fatalf("code = %q", code)
	}
}

func TestToDiagnostics_ZeroOnEmpty(t *testing.T) {
	if d := ToDiagnostics(nil, nil, "file:///x.yaml"); d != nil {
		t.Fatalf("empty findings should produce nil diagnostics, got %+v", d)
	}
}

func TestDiagnosticCodeSuffix_FallsBackToValidation(t *testing.T) {
	code := diagnosticCodeSuffix(WiretapFinding{})
	if code != "validation" {
		t.Fatalf("empty finding should produce 'validation', got %q", code)
	}
	code = diagnosticCodeSuffix(WiretapFinding{Direction: "response"})
	if code != "response" {
		t.Fatalf("expected 'response' fallback, got %q", code)
	}
	code = diagnosticCodeSuffix(WiretapFinding{RuleID: "Schema Error / Body"})
	// Non-alphanumeric chars normalize to dots and trim.
	if strings.ContainsAny(code, " /") {
		t.Fatalf("suffix should strip non-alnum: %q", code)
	}
}

func TestPathMatchesTemplate(t *testing.T) {
	cases := []struct {
		actual, template string
		want             bool
	}{
		{"/users/123", "/users/{id}", true},
		{"/users/123", "/users/123", true},
		{"/users", "/users/{id}", false},
		{"/users/123/sessions", "/users/{id}", false},
		{"", "/users", false},
		{"/users", "", false},
	}
	for _, tc := range cases {
		if got := pathMatchesTemplate(tc.actual, tc.template); got != tc.want {
			t.Errorf("pathMatchesTemplate(%q, %q) = %v, want %v", tc.actual, tc.template, got, tc.want)
		}
	}
}

func TestJoinNonEmpty(t *testing.T) {
	if got := joinNonEmpty("", "b", "", "c"); got != "b: c" {
		t.Fatalf("joinNonEmpty skipped non-empty wrong: %q", got)
	}
	if got := joinNonEmpty("", "", ""); got != "" {
		t.Fatalf("all empty should produce empty string, got %q", got)
	}
}
