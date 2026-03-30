package cli

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestNewCICmd_ReportScopeFlagDefaultsChanged(t *testing.T) {
	cmd := newCICmd()
	got, err := cmd.Flags().GetString("report-scope")
	if err != nil {
		t.Fatalf("GetString(report-scope): %v", err)
	}
	if got != reportScopeChanged {
		t.Fatalf("report-scope default = %q, want %q", got, reportScopeChanged)
	}
}

func TestResolveCIScope_AllIncludesConfiguredUniverse(t *testing.T) {
	dir := t.TempDir()
	allFiles := writeGraphScopeFixture(t, dir)

	scope, err := resolveCIScope(context.Background(), allFiles, []string{"schemas/common.yaml"}, reportScopeAll, dir, dir, nil)
	if err != nil {
		t.Fatalf("resolveCIScope(all): %v", err)
	}

	want := absPaths(t, dir, allFiles...)
	if !reflect.DeepEqual(scope.Files, want) {
		t.Fatalf("scope.Files = %v, want %v", scope.Files, want)
	}
	if scope.Mode != reportScopeAll {
		t.Fatalf("scope.Mode = %q, want %q", scope.Mode, reportScopeAll)
	}
	if scope.ChangedFileCount != 0 {
		t.Fatalf("scope.ChangedFileCount = %d, want 0", scope.ChangedFileCount)
	}
	if scope.ImpactedFileCount != len(want) {
		t.Fatalf("scope.ImpactedFileCount = %d, want %d", scope.ImpactedFileCount, len(want))
	}
}

func TestResolveCIScope_ChangedExpandsDependenciesAndDependents(t *testing.T) {
	dir := t.TempDir()
	allFiles := writeGraphScopeFixture(t, dir)

	scope, err := resolveCIScope(context.Background(), allFiles, []string{"schemas/common.yaml"}, reportScopeChanged, dir, dir, nil)
	if err != nil {
		t.Fatalf("resolveCIScope(changed): %v", err)
	}

	got := relPaths(t, dir, scope.Files)
	want := []string{
		"apis/root.yaml",
		"apis/admin.yaml",
		"schemas/common.yaml",
		"schemas/address.yaml",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("scope.Files = %v, want %v", got, want)
	}
	if scope.Mode != reportScopeChanged {
		t.Fatalf("scope.Mode = %q, want %q", scope.Mode, reportScopeChanged)
	}
	if scope.ChangedFileCount != 1 {
		t.Fatalf("scope.ChangedFileCount = %d, want 1", scope.ChangedFileCount)
	}
	if scope.ImpactedFileCount != len(want) {
		t.Fatalf("scope.ImpactedFileCount = %d, want %d", scope.ImpactedFileCount, len(want))
	}
}

func TestBuildInlineReviewComments_StaysDiffConstrained(t *testing.T) {
	report := &LintReport{
		Workspace: "/repo",
		RepoRoot:  "/repo",
		Files: []fileDiagnostics{
			{
				Path: filepath.Join("/repo", "apis", "root.yaml"),
				Diagnostics: []protocol.Diagnostic{
					{
						Range:    protocol.NewRange(9, 0, 9, 0),
						Severity: protocol.SeverityError,
						Code:     "diff-visible",
						Message:  "included comment",
					},
					{
						Range:    protocol.NewRange(29, 0, 29, 0),
						Severity: protocol.SeverityError,
						Code:     "outside-diff",
						Message:  "should be skipped",
					},
				},
			},
			{
				Path: filepath.Join("/repo", "schemas", "common.yaml"),
				Diagnostics: []protocol.Diagnostic{
					{
						Range:    protocol.NewRange(4, 0, 4, 0),
						Severity: protocol.SeverityError,
						Code:     "impacted-only",
						Message:  "not in PR diff",
					},
				},
			},
		},
	}

	comments := buildInlineReviewComments(report, "/repo", map[string]diffInfo{
		"apis/root.yaml": {ValidLines: map[int]bool{10: true}},
	})

	if len(comments) != 1 {
		t.Fatalf("len(comments) = %d, want 1", len(comments))
	}
	if comments[0].Path != "apis/root.yaml" || comments[0].Line != 10 {
		t.Fatalf("comment location = %s:%d, want apis/root.yaml:10", comments[0].Path, comments[0].Line)
	}
	if !strings.Contains(comments[0].Body, "diff-visible") {
		t.Fatalf("comment body missing included diagnostic: %s", comments[0].Body)
	}
	if strings.Contains(comments[0].Body, "outside-diff") || strings.Contains(comments[0].Body, "impacted-only") {
		t.Fatalf("comment body should stay diff-constrained, got: %s", comments[0].Body)
	}
}

func writeGraphScopeFixture(t *testing.T, dir string) []string {
	t.Helper()

	writeFixtureFile(t, dir, "apis/root.yaml", `openapi: "3.1.0"
info:
  title: Root API
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: getUsers
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: ../schemas/common.yaml#/components/schemas/User
`)
	writeFixtureFile(t, dir, "apis/admin.yaml", `openapi: "3.1.0"
info:
  title: Admin API
  version: "1.0.0"
paths:
  /admins:
    get:
      operationId: getAdmins
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: ../schemas/common.yaml#/components/schemas/User
`)
	writeFixtureFile(t, dir, "schemas/common.yaml", `components:
  schemas:
    User:
      type: object
      properties:
        address:
          $ref: ./address.yaml#/components/schemas/Address
`)
	writeFixtureFile(t, dir, "schemas/address.yaml", `components:
  schemas:
    Address:
      type: object
      properties:
        city:
          type: string
`)

	return []string{
		"apis/root.yaml",
		"apis/admin.yaml",
		"schemas/common.yaml",
		"schemas/address.yaml",
	}
}

func writeFixtureFile(t *testing.T, dir, relPath, content string) {
	t.Helper()
	path := filepath.Join(dir, relPath)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", relPath, err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("WriteFile(%s): %v", relPath, err)
	}
}

func absPaths(t *testing.T, dir string, rels ...string) []string {
	t.Helper()
	out := make([]string, 0, len(rels))
	for _, rel := range rels {
		abs, err := filepath.Abs(filepath.Join(dir, rel))
		if err != nil {
			t.Fatalf("Abs(%s): %v", rel, err)
		}
		out = append(out, abs)
	}
	return out
}

func relPaths(t *testing.T, dir string, paths []string) []string {
	t.Helper()
	out := make([]string, 0, len(paths))
	for _, path := range paths {
		rel, err := filepath.Rel(dir, path)
		if err != nil {
			t.Fatalf("Rel(%s): %v", path, err)
		}
		out = append(out, filepath.ToSlash(rel))
	}
	return out
}
