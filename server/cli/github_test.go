package cli

import (
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestCommentMarkerN(t *testing.T) {
	if got := commentMarkerN(1); got != "<!-- telescope-lint-1 -->" {
		t.Errorf("commentMarkerN(1) = %q, want <!-- telescope-lint-1 -->", got)
	}
	if got := commentMarkerN(2); got != "<!-- telescope-lint-2 -->" {
		t.Errorf("commentMarkerN(2) = %q", got)
	}
}

func TestParseMarkerIndex(t *testing.T) {
	for _, tc := range []struct {
		body   string
		wantN  int
		wantOk bool
	}{
		{"<!-- telescope-lint-1 -->", 1, true},
		{"<!-- telescope-lint-2 -->\n## Foo", 2, true},
		{"<!-- telescope-lint-42 -->", 42, true},
		{"no marker", 0, false},
		{"<!-- telescope-lint- -->", 0, false},
		{"<!-- telescope-lint-0 -->", 0, false},
	} {
		n, ok := parseMarkerIndex(tc.body)
		if ok != tc.wantOk || n != tc.wantN {
			t.Errorf("parseMarkerIndex(%q) = (%d, %v), want (%d, %v)", tc.body, n, ok, tc.wantN, tc.wantOk)
		}
	}
}

func TestIsTelescopeComment(t *testing.T) {
	if !isTelescopeComment("<!-- telescope-lint-1 -->") {
		t.Error("expected true for chunk 1 marker")
	}
	if !isTelescopeComment("<!-- telescope-lint-2 -->") {
		t.Error("expected true for chunk 2 marker")
	}
	if isTelescopeComment("<!-- other -->") {
		t.Error("expected false for other comment")
	}
}

func TestGeneratePRComment_SingleChunk_NoIssues(t *testing.T) {
	report := &LintReport{
		Workspace:       "/repo",
		RepoRoot:        "/repo",
		DiagnosticCount: 0,
		Counts:          SeverityCounts{},
		Files:           nil,
	}
	chunks := GeneratePRComment(report, "owner/repo", "main")
	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if !strings.Contains(chunks[0], commentMarkerN(1)) {
		t.Errorf("chunk 1 missing marker: %s", chunks[0][:min(80, len(chunks[0]))])
	}
	if !strings.Contains(chunks[0], "No issues found") {
		t.Error("chunk should contain no-issues message")
	}
	if len(chunks[0]) > githubMaxIssueCommentBytes {
		t.Errorf("chunk size %d exceeds githubMaxIssueCommentBytes %d", len(chunks[0]), githubMaxIssueCommentBytes)
	}
}

func TestGeneratePRComment_SingleChunk_WithIssues(t *testing.T) {
	report := &LintReport{
		Workspace:       "/repo",
		RepoRoot:        "/repo",
		DiagnosticCount: 2,
		Counts:          SeverityCounts{Error: 1, Warning: 1},
		Files: []fileDiagnostics{
			{
				Path: filepath.Join("/repo", "openapi.yaml"),
				Diagnostics: []protocol.Diagnostic{
					{
						Range:    protocol.NewRange(0, 0, 0, 0),
						Severity: protocol.SeverityError,
						Code:     "oas3-schema",
						Message:  "expected string",
					},
					{
						Range:    protocol.NewRange(1, 0, 1, 0),
						Severity: protocol.SeverityWarning,
						Code:     "operation-id",
						Message:  "missing operationId",
					},
				},
			},
		},
	}
	chunks := GeneratePRComment(report, "owner/repo", "abc123")
	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if !strings.Contains(chunks[0], commentMarkerN(1)) {
		t.Error("chunk 1 missing marker")
	}
	if !strings.Contains(chunks[0], "oas3-schema") || !strings.Contains(chunks[0], "operation-id") {
		t.Error("chunk should contain both rule groups")
	}
	if len(chunks[0]) > githubMaxIssueCommentBytes {
		t.Errorf("chunk size %d exceeds githubMaxIssueCommentBytes %d", len(chunks[0]), githubMaxIssueCommentBytes)
	}
}

func TestGeneratePRComment_MultipleChunks_SizeLimit(t *testing.T) {
	// Build a report with many rule groups so total content exceeds packing limits.
	// Each group is one <details> block; we need enough to force chunking (60k / ~500 ≈ 120+ groups).
	const numGroups = 200
	// Use a long message so each <details> block is ~600+ bytes.
	longMsg := strings.Repeat("x", 200)
	var files []fileDiagnostics
	for i := 0; i < numGroups; i++ {
		code := fmt.Sprintf("rule-%03d", i)
		files = append(files, fileDiagnostics{
			Path: filepath.Join("/repo", "spec", "file-"+code+".yaml"),
			Diagnostics: []protocol.Diagnostic{
				{
					Range:    protocol.NewRange(uint32(i), 0, uint32(i), 10),
					Severity: protocol.SeverityWarning,
					Code:     code,
					Message:  "message for " + code + " " + longMsg,
				},
			},
		})
	}
	report := &LintReport{
		Workspace:       "/repo",
		RepoRoot:        "/repo",
		DiagnosticCount: numGroups,
		Counts:          SeverityCounts{Warning: numGroups},
		Files:           files,
	}
	chunks := GeneratePRComment(report, "", "")
	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks for large report, got %d", len(chunks))
	}
	for i, ch := range chunks {
		wantMarker := commentMarkerN(i + 1)
		if !strings.Contains(ch, wantMarker) {
			t.Errorf("chunk %d missing marker %s", i+1, wantMarker)
		}
		if len(ch) > githubMaxIssueCommentBytes {
			t.Errorf("chunk %d size %d exceeds githubMaxIssueCommentBytes %d", i+1, len(ch), githubMaxIssueCommentBytes)
		}
	}
}

func TestGeneratePRComment_SingleRuleSplitsDetailsUnderGitHubLimit(t *testing.T) {
	// One rule with many rows so a single <details> would exceed maxRuleDetailsPieceBytes.
	const numRows = 400
	longMsg := strings.Repeat("y", 180)
	var diags []protocol.Diagnostic
	for i := 0; i < numRows; i++ {
		diags = append(diags, protocol.Diagnostic{
			Range:    protocol.NewRange(uint32(i), 0, uint32(i), 5),
			Severity: protocol.SeverityWarning,
			Code:     "bulk-rule",
			Message:  fmt.Sprintf("issue %d %s", i, longMsg),
		})
	}
	report := &LintReport{
		Workspace:       "/repo",
		RepoRoot:        "/repo",
		DiagnosticCount: numRows,
		Counts:          SeverityCounts{Warning: numRows},
		Files: []fileDiagnostics{
			{Path: filepath.Join("/repo", "spec.yaml"), Diagnostics: diags},
		},
	}
	chunks := GeneratePRComment(report, "", "")
	if len(chunks) < 1 {
		t.Fatalf("expected at least 1 chunk, got %d", len(chunks))
	}
	for i, ch := range chunks {
		if len(ch) > githubMaxIssueCommentBytes {
			t.Fatalf("chunk %d size %d exceeds GitHub limit %d", i+1, len(ch), githubMaxIssueCommentBytes)
		}
	}
}
