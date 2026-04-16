package cli

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%q): %v", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile(%q): %v", path, err)
	}
}

func initGitRepo(t *testing.T, dir string, files ...string) {
	t.Helper()
	steps := [][]string{
		{"git", "init"},
		{"git", "config", "user.email", "telescope@test.local"},
		{"git", "config", "user.name", "Telescope Test"},
	}
	for _, argv := range steps {
		cmd := exec.Command(argv[0], argv[1:]...)
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", argv, err, out)
		}
	}
	add := append([]string{"git", "add"}, files...)
	cmd := exec.Command(add[0], add[1:]...)
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git add: %v\n%s", err, out)
	}
	cmd = exec.Command("git", "commit", "-m", "init")
	cmd.Dir = dir
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git commit: %v\n%s", err, out)
	}
}

func withWorkingDir(t *testing.T, dir string) {
	t.Helper()
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("Chdir(%q): %v", dir, err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})
}

func resetCLIState() {
	cfgFile = ""
	rulesetArg = ""
	outputFormat = "text"
	minSeverity = ""
	failOn = "error"
	analysisEngine = ""
	noColor = false
	noExternalLSP = false
	reportMDPath = ""
	reportJSONPath = ""
	saveBaseline = false
	failOnNew = false
	diffBase = "main"
	diffHead = "HEAD"
	reportMD = ""
	reportJSON = ""
	commentPR = false
	ciFailOn = "error"
	ciSeverity = ""
	ciReportScope = reportScopeChanged
	ciNoExtLSP = false
	ciFailOnBreaking = true
	ciBreakingConfig = ""
	diffFormat = "text"
	diffBreakingOnly = false
	diffFailOnBreaking = false
	diffBreakingConfig = ""
	diffOutput = ""
}

func runCLISubprocess(t *testing.T, dir string, subcommand string, args ...string) error {
	t.Helper()
	cmdArgs := append([]string{"-test.run=TestCLIHelperProcess", "--", subcommand}, args...)
	cmd := exec.Command(os.Args[0], cmdArgs...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TELESCOPE_CLI_HELPER=1")
	return cmd.Run()
}

func TestCLIHelperProcess(t *testing.T) {
	if os.Getenv("TELESCOPE_CLI_HELPER") != "1" {
		return
	}

	args := os.Args
	dash := -1
	for i, arg := range args {
		if arg == "--" {
			dash = i
			break
		}
	}
	if dash < 0 || len(args) < dash+2 {
		os.Exit(2)
	}

	resetCLIState()
	subcommand := args[dash+1]
	subArgs := args[dash+2:]

	var err error
	switch subcommand {
	case "lint":
		cmd := newLintCmd()
		cmd.SetArgs(subArgs)
		err = cmd.Execute()
	case "validate":
		cmd := newValidateCmd()
		cmd.SetArgs(subArgs)
		err = cmd.Execute()
	case "ci":
		cmd := newCICmd()
		cmd.SetArgs(subArgs)
		err = cmd.Execute()
	case "diff":
		cmd := newDiffCmd()
		cmd.SetArgs(subArgs)
		err = cmd.Execute()
	default:
		err = nil
	}
	if err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}

func TestLintAndCICommands_HermeticReports(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	specPath := filepath.Join(dir, "spec.yaml")
	writeFile(t, specPath, `openapi: "3.1.0"
info:
  title: CLI API
  version: "1.0.0"
  description: CLI integration test API
  contact:
    name: Telescope
    email: telescope@example.com
  license:
    name: Apache-2.0
servers:
  - url: https://api.example.com
tags:
  - name: Pets
security:
  - oauth2: []
paths:
  /pets:
    get:
      operationId: listPets
      description: List pets
      tags:
        - Pets
      security:
        - oauth2:
            - read:pets
      responses:
        "200":
          description: ok
          headers:
            X-Request-Id:
              $ref: "#/components/headers/X-Request-Id"
        "401":
          description: unauthorized
        "403":
          description: forbidden
        "404":
          description: not found
components:
  schemas:
    ProblemDetails:
      type: object
      properties:
        detail:
          type: string
  headers:
    X-Request-Id:
      description: Request identifier
      schema:
        type: string
        format: uuid
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        clientCredentials:
          tokenUrl: https://example.com/token
          scopes:
            read:pets: Read pets
`)

	initGitRepo(t, dir, "spec.yaml")

	resetCLIState()
	lintJSON := filepath.Join(dir, "lint-report.json")
	lintMD := filepath.Join(dir, "lint-report.md")
	err := runCLISubprocess(t, dir, "lint",
		"--format", "json",
		"--report-json", lintJSON,
		"--report-md", lintMD,
		"--no-external-lsp",
		specPath,
	)
	if err == nil {
		t.Fatal("expected lint subprocess to exit non-zero for fixture diagnostics")
	}
	for _, report := range []string{lintJSON, lintMD} {
		if _, err := os.Stat(report); err != nil {
			t.Fatalf("expected lint report %q: %v", report, err)
		}
	}

	resetCLIState()
	ciJSON := filepath.Join(dir, "ci-report.json")
	ciMD := filepath.Join(dir, "ci-report.md")
	err = runCLISubprocess(t, dir, "ci",
		"--report-json", ciJSON,
		"--report-md", ciMD,
		"--report-scope", reportScopeAll,
		"--diff-base", "HEAD",
		"--diff-head", "HEAD",
		"--no-external-lsp",
		specPath,
	)
	if err == nil {
		t.Fatal("expected ci subprocess to exit non-zero for fixture diagnostics")
	}
	for _, report := range []string{ciJSON, ciMD} {
		if _, err := os.Stat(report); err != nil {
			t.Fatalf("expected ci report %q: %v", report, err)
		}
	}
	var ciRep struct {
		BreakingChanges []BreakingChangeFile `json:"breakingChanges"`
	}
	raw, err := os.ReadFile(ciJSON)
	if err != nil {
		t.Fatalf("read ci json: %v", err)
	}
	if err := json.Unmarshal(raw, &ciRep); err != nil {
		t.Fatalf("parse ci json: %v", err)
	}
	if ciRep.BreakingChanges == nil {
		t.Fatalf("expected breakingChanges field in ci report json")
	}
	if len(ciRep.BreakingChanges) != 1 {
		t.Fatalf("expected 1 breakingChanges row, got %d", len(ciRep.BreakingChanges))
	}
}

func TestValidateCommand_HermeticSchemaFiltering(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	specPath := filepath.Join(dir, "invalid.yaml")
	writeFile(t, specPath, `openapi: "3.1.0"
info:
  title: Hermetic validate fixture
  version: "1.0.0"
paths: {}
`)

	resetCLIState()
	reportJSON := filepath.Join(dir, "validate-report.json")
	reportMD := filepath.Join(dir, "validate-report.md")
	err := runCLISubprocess(t, dir, "validate",
		"--report-json", reportJSON,
		"--report-md", reportMD,
		specPath,
	)
	if err != nil {
		t.Fatalf("validate subprocess failed: %v", err)
	}
	for _, report := range []string{reportJSON, reportMD} {
		if _, err := os.Stat(report); err != nil {
			t.Fatalf("expected validate report %q: %v", report, err)
		}
	}
}

func TestBundleCommand_HermeticMerge(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	rootPath := filepath.Join(dir, "root.yaml")
	outputPath := filepath.Join(dir, "bundled.yaml")

	writeFile(t, rootPath, `openapi: "3.1.0"
info:
  title: Bundle API
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: string
`)

	resetCLIState()
	cmd := newBundleCmd()
	cmd.SetArgs([]string{"--output", outputPath, rootPath})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("bundle command failed: %v", err)
	}
	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("ReadFile(%q): %v", outputPath, err)
	}
	text := string(data)
	for _, want := range []string{`openapi: "3.1.0"`, "schemas:", "Pet:", "type: object", "listPets"} {
		if !strings.Contains(text, want) {
			t.Fatalf("expected bundled output to contain %q, got:\n%s", want, text)
		}
	}
}

func TestOverlayApplyCommand_Hermetic(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	specPath := filepath.Join(dir, "spec.yaml")
	overlayPath := filepath.Join(dir, "title.overlay.yaml")
	outputPath := filepath.Join(dir, "applied.yaml")

	writeFile(t, specPath, `openapi: 3.0.0
info:
  title: Original Title
  version: 1.0.0
paths: {}
`)
	writeFile(t, overlayPath, `overlay: 1.0.0
info:
  title: Title Overlay
  version: 1.0.0
actions:
  - target: $.info
    update:
      title: Updated Title
`)

	resetCLIState()
	cmd := newOverlayCmd()
	cmd.SetArgs([]string{"apply", specPath, "--overlay", overlayPath, "--output", outputPath})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("overlay apply command failed: %v", err)
	}

	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatalf("ReadFile(%q): %v", outputPath, err)
	}
	if !strings.Contains(string(data), "Updated Title") {
		t.Fatalf("expected overlay-applied output, got:\n%s", data)
	}
}

func TestDocsCommand_GenerateWithFakeBinary(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	specPath := filepath.Join(dir, "spec.yaml")
	outputDir := filepath.Join(dir, "site")
	binaryPath := filepath.Join(dir, "printing-press")

	writeFile(t, specPath, `openapi: 3.0.0
info:
  title: Docs API
  version: 1.0.0
paths: {}
`)
	writeFile(t, binaryPath, "#!/bin/sh\nexit 0\n")
	if err := os.Chmod(binaryPath, 0o755); err != nil {
		t.Fatalf("Chmod(%q): %v", binaryPath, err)
	}

	resetCLIState()
	cmd := newDocsCmd()
	cmd.SetArgs([]string{specPath, "--binary", binaryPath, "--output", outputDir})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("docs command failed: %v", err)
	}
	if _, err := os.Stat(outputDir); err != nil {
		t.Fatalf("expected output directory to be created: %v", err)
	}
}

func TestMockCommand_GenerateSchemaFiles(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	specPath := filepath.Join(dir, "spec.yaml")
	outputDir := filepath.Join(dir, "mocks")

	writeFile(t, specPath, `openapi: 3.1.0
info:
  title: Mock API
  version: 1.0.0
paths:
  /pets:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
    Pet:
      type: object
      properties:
        id:
          type: string
`)

	resetCLIState()
	cmd := newMockCmd()
	cmd.SetArgs([]string{specPath, "--output", outputDir, "--schema", "User", "--format", "json"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("mock command failed: %v", err)
	}
	data, err := os.ReadFile(filepath.Join(outputDir, "User.json"))
	if err != nil {
		t.Fatalf("ReadFile(User.json): %v", err)
	}
	if !json.Valid(data) {
		t.Fatalf("expected valid JSON mock output, got:\n%s", data)
	}
}
