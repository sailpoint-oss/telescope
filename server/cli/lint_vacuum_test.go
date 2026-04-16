package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestLintCommand_VacuumEngine(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)

	writeFile(t, filepath.Join(dir, ".telescope.yaml"), `lint:
  vacuum:
    ruleset: .telescope/vacuum-ruleset.yaml
`)
	writeFile(t, filepath.Join(dir, ".telescope", "vacuum-ruleset.yaml"), `extends:
  -
    - vacuum:oas
    - off
rules:
  operation-description: true
`)
	specPath := filepath.Join(dir, "spec.yaml")
	writeFile(t, specPath, `openapi: "3.1.0"
info:
  title: Vacuum CLI
  version: "1.0.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: ok
`)

	reportPath := filepath.Join(dir, "vacuum-report.json")
	resetCLIState()
	err := runCLISubprocess(t, dir, "lint",
		"--engine", "vacuum",
		"--fail-on", "warn",
		"--report-json", reportPath,
		specPath,
	)
	if err == nil {
		t.Fatal("expected vacuum lint subprocess to exit non-zero")
	}

	raw, err := os.ReadFile(reportPath)
	if err != nil {
		t.Fatalf("read report: %v", err)
	}
	var report struct {
		DiagnosticCount int `json:"diagnosticCount"`
		Files           []struct {
			Diagnostics []protocol.Diagnostic `json:"diagnostics"`
		} `json:"files"`
	}
	if err := json.Unmarshal(raw, &report); err != nil {
		t.Fatalf("unmarshal report: %v", err)
	}
	if report.DiagnosticCount == 0 || len(report.Files) == 0 || len(report.Files[0].Diagnostics) == 0 {
		t.Fatalf("expected vacuum diagnostics in report, got %s", raw)
	}
	if report.Files[0].Diagnostics[0].Source != "vacuum" {
		t.Fatalf("expected vacuum diagnostic source, got %+v", report.Files[0].Diagnostics[0])
	}
}
