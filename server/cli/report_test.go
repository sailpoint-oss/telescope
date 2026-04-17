package cli

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestBuildLintReport_CapturesRuleDocsAndMarkdownLinks(t *testing.T) {
	const docURL = "https://docs.example.com/guidelines/122/"

	report := buildLintReport("/repo", "/repo", []fileDiagnostics{
		{
			Path: filepath.Join("/repo", "openapi.yaml"),
			Diagnostics: []protocol.Diagnostic{
				{
					Range:           protocol.NewRange(0, 0, 0, 1),
					Severity:        protocol.SeverityError,
					Code:            "sailpoint-operation-id-unique",
					Message:         "duplicate operationId",
					CodeDescription: &protocol.CodeDescription{Href: protocol.URI(docURL)},
				},
			},
		},
	})

	if got := report.RuleDocs["sailpoint-operation-id-unique"]; got != docURL {
		t.Fatalf("RuleDocs[sailpoint-operation-id-unique] = %q, want %q", got, docURL)
	}

	var out bytes.Buffer
	if err := writeMDReportTo(&out, report); err != nil {
		t.Fatalf("writeMDReportTo: %v", err)
	}
	if !strings.Contains(out.String(), "[`sailpoint-operation-id-unique`]("+docURL+")") {
		t.Fatalf("expected markdown report to link sailpoint-operation-id-unique docs, got:\n%s", out.String())
	}
}

func TestWriteMDReportTo_IncludesScopeMetadata(t *testing.T) {
	report := &LintReport{
		Workspace:   "/repo",
		RepoRoot:    "/repo",
		GeneratedAt: "2026-03-30T15:04:05Z",
		Scope: &ScopeMetadata{
			Mode:              reportScopeChanged,
			ChangedFileCount:  1,
			ImpactedFileCount: 4,
			AnalyzedFileCount: 4,
			FallbackReason:    "git diff unavailable; analyzed all configured files",
		},
	}

	var out bytes.Buffer
	if err := writeMDReportTo(&out, report); err != nil {
		t.Fatalf("writeMDReportTo: %v", err)
	}

	body := out.String()
	if !strings.Contains(body, "| Scope | changed (graph-expanded) |") {
		t.Fatalf("markdown report missing scope row:\n%s", body)
	}
	if !strings.Contains(body, "| Changed files | 1 |") {
		t.Fatalf("markdown report missing changed-files row:\n%s", body)
	}
	if !strings.Contains(body, "| Impacted files | 4 |") {
		t.Fatalf("markdown report missing impacted-files row:\n%s", body)
	}
	if !strings.Contains(body, "| Analyzed files | 4 |") {
		t.Fatalf("markdown report missing analyzed-files row:\n%s", body)
	}
	if !strings.Contains(body, "| Scope fallback | git diff unavailable; analyzed all configured files |") {
		t.Fatalf("markdown report missing fallback row:\n%s", body)
	}
}
