package cli

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lintengine"
)

func TestIsOpenAPIExtension(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"spec.yaml", true},
		{"spec.yml", true},
		{"spec.json", true},
		{"spec.YAML", true},
		{"spec.YML", true},
		{"spec.JSON", true},
		{"spec.Yaml", true},
		{"dir/nested/openapi.yaml", true},
		{"spec.txt", false},
		{"spec.xml", false},
		{"spec.toml", false},
		{"spec", false},
		{"", false},
		{"no-extension", false},
		{".yaml", true},
		{"spec.yaml.bak", false},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := isOpenAPIExtension(tt.path); got != tt.want {
				t.Errorf("isOpenAPIExtension(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestMatchesAnyPattern(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		patterns []string
		want     bool
	}{
		{"exact match", "vendor", []string{"vendor"}, true},
		{"glob star", "spec.yaml", []string{"*.yaml"}, true},
		{"base name match", "dir/spec.yaml", []string{"*.yaml"}, true},
		{"no match", "spec.txt", []string{"*.yaml"}, false},
		{"empty patterns", "spec.yaml", nil, false},
		{"multiple patterns first matches", "spec.json", []string{"*.json", "*.yaml"}, true},
		{"multiple patterns second matches", "spec.yaml", []string{"*.json", "*.yaml"}, true},
		{"multiple patterns none match", "spec.txt", []string{"*.json", "*.yaml"}, false},
		{"question mark glob", "spec.yml", []string{"spec.y?l"}, true},
		{"full path match", "build/output", []string{"build/output"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchesAnyPattern(tt.path, tt.patterns); got != tt.want {
				t.Errorf("matchesAnyPattern(%q, %v) = %v, want %v", tt.path, tt.patterns, got, tt.want)
			}
		})
	}
}

func TestFilterRunResult(t *testing.T) {
	errDiag := protocol.Diagnostic{Message: "err", Source: "oas3-schema", Severity: protocol.SeverityError}
	warnDiag := protocol.Diagnostic{Message: "warn", Source: "custom-rule", Severity: protocol.SeverityWarning}

	run := &lintengine.RunResult{
		Workspace: "/ws",
		Files:     []string{"a.yaml", "b.yaml"},
		Results: []lintengine.FileDiagnostics{
			{Path: "a.yaml", Diagnostics: []protocol.Diagnostic{errDiag, warnDiag}},
			{Path: "b.yaml", Diagnostics: []protocol.Diagnostic{warnDiag}},
		},
	}

	t.Run("nil run returns nil", func(t *testing.T) {
		got := filterRunResult(nil, func(protocol.Diagnostic) bool { return true })
		if got != nil {
			t.Error("expected nil for nil run")
		}
	})

	t.Run("nil filter returns original", func(t *testing.T) {
		got := filterRunResult(run, nil)
		if got != run {
			t.Error("expected original run when filter is nil")
		}
	})

	t.Run("keep only oas3-schema", func(t *testing.T) {
		got := filterRunResult(run, func(d protocol.Diagnostic) bool {
			return d.Source == "oas3-schema"
		})
		if len(got.Results) != 1 {
			t.Fatalf("expected 1 file result, got %d", len(got.Results))
		}
		if got.Results[0].Path != "a.yaml" {
			t.Errorf("expected a.yaml, got %s", got.Results[0].Path)
		}
		if len(got.Results[0].Diagnostics) != 1 {
			t.Errorf("expected 1 diagnostic, got %d", len(got.Results[0].Diagnostics))
		}
	})

	t.Run("keep nothing yields empty results", func(t *testing.T) {
		got := filterRunResult(run, func(protocol.Diagnostic) bool { return false })
		if len(got.Results) != 0 {
			t.Errorf("expected 0 results, got %d", len(got.Results))
		}
	})

	t.Run("keep all preserves everything", func(t *testing.T) {
		got := filterRunResult(run, func(protocol.Diagnostic) bool { return true })
		if len(got.Results) != 2 {
			t.Fatalf("expected 2 file results, got %d", len(got.Results))
		}
		if got.Workspace != "/ws" {
			t.Errorf("workspace not preserved: got %s", got.Workspace)
		}
	})
}

func TestCountDiags(t *testing.T) {
	tests := []struct {
		name  string
		diags []fileDiagnostics
		want  int
	}{
		{"nil slice", nil, 0},
		{"empty slice", []fileDiagnostics{}, 0},
		{"single file no diags", []fileDiagnostics{{Path: "a.yaml"}}, 0},
		{"single file with diags", []fileDiagnostics{
			{Path: "a.yaml", Diagnostics: []protocol.Diagnostic{{Message: "a"}, {Message: "b"}}},
		}, 2},
		{"multiple files", []fileDiagnostics{
			{Path: "a.yaml", Diagnostics: []protocol.Diagnostic{{Message: "a"}}},
			{Path: "b.yaml", Diagnostics: []protocol.Diagnostic{{Message: "b"}, {Message: "c"}}},
		}, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := countDiags(tt.diags); got != tt.want {
				t.Errorf("countDiags() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestSarifLevel(t *testing.T) {
	tests := []struct {
		sev  protocol.DiagnosticSeverity
		want string
	}{
		{protocol.SeverityError, "error"},
		{protocol.SeverityWarning, "warning"},
		{protocol.SeverityInformation, "note"},
		{protocol.SeverityHint, "note"},
		{protocol.DiagnosticSeverity(0), "note"},
		{protocol.DiagnosticSeverity(99), "note"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if got := sarifLevel(tt.sev); got != tt.want {
				t.Errorf("sarifLevel(%d) = %q, want %q", tt.sev, got, tt.want)
			}
		})
	}
}

func TestSeverityIcon(t *testing.T) {
	tests := []struct {
		sev  protocol.DiagnosticSeverity
		want string
	}{
		{protocol.SeverityError, "error"},
		{protocol.SeverityWarning, "warning"},
		{protocol.SeverityInformation, "info"},
		{protocol.SeverityHint, "hint"},
		{protocol.DiagnosticSeverity(0), "unknown"},
		{protocol.DiagnosticSeverity(99), "unknown"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			if got := severityIcon(tt.sev); got != tt.want {
				t.Errorf("severityIcon(%d) = %q, want %q", tt.sev, got, tt.want)
			}
		})
	}
}

func TestFixSuggestion(t *testing.T) {
	tests := []struct {
		ruleID string
		want   string
	}{
		{"operation-description", "(add 'description' field)"},
		{"deprecated-description", "(add 'description' field)"},
		{"operation-operationId", "(add 'operationId' field)"},
		{"sp-122", "(add 'operationId' field)"},
		{"operation-tags", "(add an operation tag)"},
		{"sp-123", "(add an operation tag)"},
		{"missing-error-responses", "(add standard error responses)"},
		{"sp-403", "(add standard error responses)"},
		{"no-request-body-on-get", "(remove requestBody)"},
		{"unused-component", "(remove unused component)"},
		{"migration-nullable", "(use type array in 3.1)"},
		{"unknown-rule", ""},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.ruleID, func(t *testing.T) {
			if got := fixSuggestion(tt.ruleID); got != tt.want {
				t.Errorf("fixSuggestion(%q) = %q, want %q", tt.ruleID, got, tt.want)
			}
		})
	}
}

func TestBuildSARIFResults(t *testing.T) {
	t.Run("empty input", func(t *testing.T) {
		got := buildSARIFResults(nil)
		if got != nil {
			t.Errorf("expected nil for empty input, got %v", got)
		}
	})

	t.Run("single diagnostic", func(t *testing.T) {
		results := []fileDiagnostics{{
			Path: "api.yaml",
			Diagnostics: []protocol.Diagnostic{{
				Range: protocol.Range{
					Start: protocol.Position{Line: 10, Character: 5},
					End:   protocol.Position{Line: 10, Character: 20},
				},
				Severity: protocol.SeverityWarning,
				Code:     "my-rule",
				Message:  "something is wrong",
			}},
		}}
		got := buildSARIFResults(results)
		if len(got) != 1 {
			t.Fatalf("expected 1 result, got %d", len(got))
		}
		if got[0]["ruleId"] != "my-rule" {
			t.Errorf("ruleId = %v, want my-rule", got[0]["ruleId"])
		}
		if got[0]["level"] != "warning" {
			t.Errorf("level = %v, want warning", got[0]["level"])
		}
		msg := got[0]["message"].(map[string]string)
		if msg["text"] != "something is wrong" {
			t.Errorf("message text = %q", msg["text"])
		}
		locations := got[0]["locations"].([]map[string]interface{})
		region := locations[0]["physicalLocation"].(map[string]interface{})["region"].(map[string]interface{})
		if region["startLine"] != uint32(11) {
			t.Errorf("startLine = %v, want 11", region["startLine"])
		}
	})

	t.Run("multiple files and diagnostics", func(t *testing.T) {
		results := []fileDiagnostics{
			{Path: "a.yaml", Diagnostics: []protocol.Diagnostic{{Message: "d1"}, {Message: "d2"}}},
			{Path: "b.yaml", Diagnostics: []protocol.Diagnostic{{Message: "d3"}}},
		}
		got := buildSARIFResults(results)
		if len(got) != 3 {
			t.Errorf("expected 3 results, got %d", len(got))
		}
	})
}

func TestOutputSARIF(t *testing.T) {
	results := []fileDiagnostics{{
		Path: "spec.yaml",
		Diagnostics: []protocol.Diagnostic{{
			Range:    protocol.Range{Start: protocol.Position{Line: 0, Character: 0}},
			Severity: protocol.SeverityError,
			Code:     "test-rule",
			Message:  "test error",
		}},
	}}

	output := captureStdout(t, func() { outputSARIF(results) })

	var sarif map[string]interface{}
	if err := json.Unmarshal([]byte(output), &sarif); err != nil {
		t.Fatalf("output is not valid JSON: %v\noutput: %s", err, output)
	}
	if sarif["version"] != "2.1.0" {
		t.Errorf("version = %v, want 2.1.0", sarif["version"])
	}
	runs := sarif["runs"].([]interface{})
	if len(runs) != 1 {
		t.Fatalf("expected 1 run, got %d", len(runs))
	}
	run := runs[0].(map[string]interface{})
	sarifResults := run["results"].([]interface{})
	if len(sarifResults) != 1 {
		t.Errorf("expected 1 result, got %d", len(sarifResults))
	}
}

func TestOutputGitHub(t *testing.T) {
	results := []fileDiagnostics{{
		Path: "spec.yaml",
		Diagnostics: []protocol.Diagnostic{
			{
				Range:    protocol.Range{Start: protocol.Position{Line: 4, Character: 2}},
				Severity: protocol.SeverityError,
				Message:  "bad error",
			},
			{
				Range:    protocol.Range{Start: protocol.Position{Line: 9, Character: 0}},
				Severity: protocol.SeverityWarning,
				Message:  "a warning",
			},
			{
				Range:    protocol.Range{Start: protocol.Position{Line: 1, Character: 0}},
				Severity: protocol.SeverityInformation,
				Message:  "info note",
			},
			{
				Range:    protocol.Range{Start: protocol.Position{Line: 2, Character: 0}},
				Severity: protocol.SeverityHint,
				Message:  "just a hint",
			},
		},
	}}

	output := captureStdout(t, func() { outputGitHub(results) })
	lines := strings.Split(strings.TrimSpace(output), "\n")

	if len(lines) != 4 {
		t.Fatalf("expected 4 lines, got %d:\n%s", len(lines), output)
	}
	if !strings.HasPrefix(lines[0], "::error ") {
		t.Errorf("line 0 should start with ::error, got %q", lines[0])
	}
	if !strings.HasPrefix(lines[1], "::warning ") {
		t.Errorf("line 1 should start with ::warning, got %q", lines[1])
	}
	if !strings.HasPrefix(lines[2], "::notice ") {
		t.Errorf("line 2 should start with ::notice, got %q", lines[2])
	}
	if !strings.HasPrefix(lines[3], "::notice ") {
		t.Errorf("line 3 should start with ::notice for hint, got %q", lines[3])
	}
	if !strings.Contains(lines[0], "bad error") {
		t.Errorf("line 0 missing message: %q", lines[0])
	}
}

func captureStdout(t *testing.T, fn func()) string {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("os.Pipe: %v", err)
	}
	os.Stdout = w

	fn()

	w.Close()
	os.Stdout = old

	var buf bytes.Buffer
	io.Copy(&buf, r)
	return buf.String()
}
