package vacuum

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestEngine_LintBytes_CustomRuleset(t *testing.T) {
	dir := t.TempDir()
	rulesetPath := filepath.Join(dir, "ruleset.yaml")
	if err := os.WriteFile(rulesetPath, []byte(`extends:
  -
    - vacuum:oas
    - off
rules:
  operation-description: true
`), 0o644); err != nil {
		t.Fatalf("write ruleset: %v", err)
	}

	engine, err := NewEngineWithBaseDir(config.VacuumConfig{Ruleset: "ruleset.yaml"}, dir, nil)
	if err != nil {
		t.Fatalf("NewEngineWithBaseDir: %v", err)
	}

	diags, err := engine.LintBytes([]byte(`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        "200":
          description: ok
`), "file:///tmp/spec.yaml")
	if err != nil {
		t.Fatalf("LintBytes: %v", err)
	}
	if len(diags) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d (%+v)", len(diags), diags)
	}
	if diags[0].Code != "operation-description" {
		t.Fatalf("unexpected code: %q", diags[0].Code)
	}
	if diags[0].Source != Source {
		t.Fatalf("unexpected source: %q", diags[0].Source)
	}
}

func TestEngine_LintBytes_SeverityFilter(t *testing.T) {
	dir := t.TempDir()
	rulesetPath := filepath.Join(dir, "ruleset.yaml")
	if err := os.WriteFile(rulesetPath, []byte(`extends:
  -
    - vacuum:oas
    - off
rules:
  operation-description: true
`), 0o644); err != nil {
		t.Fatalf("write ruleset: %v", err)
	}

	engine, err := NewEngineWithBaseDir(config.VacuumConfig{
		Ruleset:  "ruleset.yaml",
		Severity: "error",
	}, dir, nil)
	if err != nil {
		t.Fatalf("NewEngineWithBaseDir: %v", err)
	}

	diags, err := engine.LintBytes([]byte(`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        "200":
          description: ok
`), "file:///tmp/spec.yaml")
	if err != nil {
		t.Fatalf("LintBytes: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("expected severity filter to suppress diagnostics, got %+v", diags)
	}
}

func TestEngine_LintAndFix_CustomAutoFix(t *testing.T) {
	dir := t.TempDir()
	rulesetPath := filepath.Join(dir, "ruleset.yaml")
	if err := os.WriteFile(rulesetPath, []byte(`extends:
  -
    - vacuum:oas
    - off
rules:
  empty-description-autofix:
    description: Empty description found
    message: Empty description found
    given: $.info.description
    severity: warn
    type: style
    then:
      function: truthy
    autoFixFunction: fixEmptyDescription
`), 0o644); err != nil {
		t.Fatalf("write ruleset: %v", err)
	}

	engine, err := NewEngineWithBaseDir(config.VacuumConfig{Ruleset: "ruleset.yaml"}, dir, nil)
	if err != nil {
		t.Fatalf("NewEngineWithBaseDir: %v", err)
	}

	diags, modified, err := engine.LintAndFix([]byte(`openapi: 3.1.0
info:
  title: Test API
  version: 1.0.0
  description: ""
paths: {}
`), "file:///tmp/spec.yaml")
	if err != nil {
		t.Fatalf("LintAndFix: %v", err)
	}
	if len(diags) != 0 {
		t.Fatalf("expected no diagnostics after auto-fix rerun, got %+v", diags)
	}
	if !strings.Contains(string(modified), `description: "TODO: Add description"`) {
		t.Fatalf("expected modified spec to contain replacement, got:\n%s", modified)
	}
}
