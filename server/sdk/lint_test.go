package sdk

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/lintengine"
)

func TestLintFiles_Valid(t *testing.T) {
	dir := t.TempDir()
	spec := filepath.Join(dir, "openapi.yaml")
	content := []byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      responses:
        "200":
          description: OK
`)
	if err := os.WriteFile(spec, content, 0644); err != nil {
		t.Fatal(err)
	}

	results, err := LintFiles([]string{spec}, LintOptions{})
	if err != nil {
		t.Fatal(err)
	}

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].File != spec {
		t.Errorf("expected file %s, got %s", spec, results[0].File)
	}
}

func TestLintFiles_InvalidPath(t *testing.T) {
	_, err := LintFiles([]string{"/nonexistent/openapi.yaml"}, LintOptions{})
	if err == nil {
		t.Fatal("expected error for non-existent file")
	}
}

func TestLintFiles_Empty(t *testing.T) {
	results, err := LintFiles([]string{}, LintOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}

func TestLintFiles_SeverityFilter(t *testing.T) {
	dir := t.TempDir()
	spec := filepath.Join(dir, "openapi.yaml")
	content := []byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0.0"
`)
	if err := os.WriteFile(spec, content, 0644); err != nil {
		t.Fatal(err)
	}

	all, err := LintFiles([]string{spec}, LintOptions{})
	if err != nil {
		t.Fatal(err)
	}

	errorsOnly, err := LintFiles([]string{spec}, LintOptions{MinSeverity: ctypes.SeverityError})
	if err != nil {
		t.Fatal(err)
	}

	allCount := lintResults(all).count()
	errCount := lintResults(errorsOnly).count()
	if errCount > allCount {
		t.Error("filtering to errors-only should not produce more diagnostics")
	}
}

func TestLintFiles_ConfigDisablesRule(t *testing.T) {
	dir := t.TempDir()
	spec := filepath.Join(dir, "openapi.yaml")
	content := []byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: OK
`)
	if err := os.WriteFile(spec, content, 0644); err != nil {
		t.Fatal(err)
	}

	withDefault, err := LintFiles([]string{spec}, LintOptions{WorkspaceRoot: dir, NoExternalLSP: true})
	if err != nil {
		t.Fatal(err)
	}
	code := firstCode(withDefault[0].Diagnostics)
	if code == "" {
		t.Fatal("expected at least one coded diagnostic without config override")
	}

	cfg := filepath.Join(dir, ".telescope.yaml")
	if err := os.WriteFile(cfg, []byte("rules:\n  "+code+": off\n"), 0644); err != nil {
		t.Fatal(err)
	}

	withConfig, err := LintFiles([]string{spec}, LintOptions{
		WorkspaceRoot: dir,
		ConfigPath:    cfg,
		NoExternalLSP: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if hasCode(withConfig[0].Diagnostics, code) {
		t.Fatalf("did not expect %s when disabled in config", code)
	}
}

func TestLintFiles_RulesetOverride(t *testing.T) {
	dir := t.TempDir()
	spec := filepath.Join(dir, "openapi.yaml")
	content := []byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: OK
`)
	if err := os.WriteFile(spec, content, 0644); err != nil {
		t.Fatal(err)
	}
	base, err := LintFiles([]string{spec}, LintOptions{WorkspaceRoot: dir, NoExternalLSP: true})
	if err != nil {
		t.Fatal(err)
	}
	code := firstCode(base[0].Diagnostics)
	if code == "" {
		t.Fatal("expected at least one coded diagnostic for ruleset test")
	}
	ruleset := filepath.Join(dir, "ruleset.yaml")
	if err := os.WriteFile(ruleset, []byte("rules:\n  "+code+":\n    severity: off\n"), 0644); err != nil {
		t.Fatal(err)
	}

	results, err := LintFiles([]string{spec}, LintOptions{
		WorkspaceRoot: dir,
		RulesetPath:   ruleset,
		NoExternalLSP: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if hasCode(results[0].Diagnostics, code) {
		t.Fatalf("did not expect %s when disabled in ruleset", code)
	}
}

func TestLintFiles_CrossFileProjectResolution(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "openapi.yaml")
	schemas := filepath.Join(dir, "schemas.yaml")
	rootContent := []byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: "./schemas.yaml#/components/schemas/User"
`)
	schemasContent := []byte(`openapi: "3.1.0"
info:
  title: Shared
  version: "1.0.0"
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
`)
	if err := os.WriteFile(root, rootContent, 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(schemas, schemasContent, 0644); err != nil {
		t.Fatal(err)
	}

	results, err := LintFiles([]string{root, schemas}, LintOptions{
		WorkspaceRoot: dir,
		NoExternalLSP: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if hasCode(results[0].Diagnostics, "unresolved-ref") {
		t.Fatal("cross-file ref should resolve when files are linted in one workspace")
	}
}

func TestLintFiles_ParityWithSharedEngine(t *testing.T) {
	dir := t.TempDir()
	spec := filepath.Join(dir, "openapi.yaml")
	content := []byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: OK
`)
	if err := os.WriteFile(spec, content, 0644); err != nil {
		t.Fatal(err)
	}

	sdkResults, err := LintFiles([]string{spec}, LintOptions{
		WorkspaceRoot: dir,
		NoExternalLSP: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	engineResults, err := lintengine.Run(context.Background(), lintengine.Options{
		Paths:         []string{spec},
		WorkingDir:    dir,
		NoExternalLSP: true,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}

	if len(sdkResults) != 1 || len(engineResults.Results) != 1 {
		t.Fatalf("unexpected result lengths sdk=%d engine=%d", len(sdkResults), len(engineResults.Results))
	}
	sdkCount := len(sdkResults[0].Diagnostics)
	engineCount := len(engineResults.Results[0].Diagnostics)
	if sdkCount != engineCount {
		t.Fatalf("diagnostic count mismatch sdk=%d engine=%d", sdkCount, engineCount)
	}
}

func TestLintFiles_NoExternalLSPSmoke(t *testing.T) {
	dir := t.TempDir()
	spec := filepath.Join(dir, "openapi.yaml")
	if err := os.WriteFile(spec, []byte("openapi: \"3.1.0\"\ninfo:\n  title: Test\n  version: \"1\"\npaths: {}\n"), 0644); err != nil {
		t.Fatal(err)
	}
	if _, err := LintFiles([]string{spec}, LintOptions{WorkspaceRoot: dir, NoExternalLSP: true}); err != nil {
		t.Fatalf("NoExternalLSP=true should not error: %v", err)
	}
	if _, err := LintFiles([]string{spec}, LintOptions{WorkspaceRoot: dir, NoExternalLSP: false}); err != nil {
		t.Fatalf("NoExternalLSP=false should not error: %v", err)
	}
}

func TestLintContent(t *testing.T) {
	content := []byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      responses:
        "200":
          description: OK
`)
	diags, err := LintContent("file:///test.yaml", content)
	if err != nil {
		t.Fatal(err)
	}
	_ = diags
}

func hasCode(diags []ctypes.Diagnostic, code string) bool {
	for _, d := range diags {
		if d.Code == code {
			return true
		}
	}
	return false
}

func firstCode(diags []ctypes.Diagnostic) string {
	for _, d := range diags {
		if d.Code != "" {
			return d.Code
		}
	}
	return ""
}

// helper for result slices
type lintResults []LintResult

func (rs lintResults) Diagnostics() []ctypes.Diagnostic {
	var all []ctypes.Diagnostic
	for _, r := range rs {
		all = append(all, r.Diagnostics...)
	}
	return all
}

func (all lintResults) count() int {
	n := 0
	for _, r := range all {
		n += len(r.Diagnostics)
	}
	return n
}
