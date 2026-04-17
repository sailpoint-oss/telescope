package cli

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/lintengine"
)

func TestShouldFail_ErrorOnError(t *testing.T) {
	old := failOn
	defer func() { failOn = old }()
	failOn = "error"

	if !shouldFail(protocol.SeverityError) {
		t.Error("expected error severity to fail with failOn=error")
	}
	if shouldFail(protocol.SeverityWarning) {
		t.Error("expected warning severity NOT to fail with failOn=error")
	}
	if shouldFail(protocol.SeverityInformation) {
		t.Error("expected info severity NOT to fail with failOn=error")
	}
}

func TestShouldFail_WarnIncludesErrorAndWarning(t *testing.T) {
	old := failOn
	defer func() { failOn = old }()
	failOn = "warn"

	if !shouldFail(protocol.SeverityError) {
		t.Error("expected error to fail with failOn=warn")
	}
	if !shouldFail(protocol.SeverityWarning) {
		t.Error("expected warning to fail with failOn=warn")
	}
	if shouldFail(protocol.SeverityHint) {
		t.Error("expected hint NOT to fail with failOn=warn")
	}
}

func TestShouldFail_DefaultBehavior(t *testing.T) {
	old := failOn
	defer func() { failOn = old }()
	failOn = "bogus"

	if !shouldFail(protocol.SeverityError) {
		t.Error("expected error to fail with unknown failOn (falls back to error)")
	}
	if shouldFail(protocol.SeverityWarning) {
		t.Error("expected warning NOT to fail with unknown failOn")
	}
}

func TestSeverityIcon_DeepCoverage(t *testing.T) {
	tests := []struct {
		sev  protocol.DiagnosticSeverity
		want string
	}{
		{protocol.SeverityError, "error"},
		{protocol.SeverityWarning, "warning"},
		{protocol.SeverityInformation, "info"},
		{protocol.SeverityHint, "hint"},
		{0, "unknown"},
	}
	for _, tt := range tests {
		got := severityIcon(tt.sev)
		if got != tt.want {
			t.Errorf("severityIcon(%d) = %q, want %q", tt.sev, got, tt.want)
		}
	}
}

func TestSarifLevel_DeepCoverage(t *testing.T) {
	tests := []struct {
		sev  protocol.DiagnosticSeverity
		want string
	}{
		{protocol.SeverityError, "error"},
		{protocol.SeverityWarning, "warning"},
		{protocol.SeverityInformation, "note"},
		{protocol.SeverityHint, "note"},
	}
	for _, tt := range tests {
		got := sarifLevel(tt.sev)
		if got != tt.want {
			t.Errorf("sarifLevel(%d) = %q, want %q", tt.sev, got, tt.want)
		}
	}
}

func TestSeverityName(t *testing.T) {
	tests := []struct {
		sev  protocol.DiagnosticSeverity
		want string
	}{
		{protocol.SeverityError, "error"},
		{protocol.SeverityWarning, "warning"},
		{protocol.SeverityInformation, "info"},
		{protocol.SeverityHint, "hint"},
		{99, "unknown"},
	}
	for _, tt := range tests {
		got := severityName(tt.sev)
		if got != tt.want {
			t.Errorf("severityName(%d) = %q, want %q", tt.sev, got, tt.want)
		}
	}
}

func TestMarkdownRuleRef(t *testing.T) {
	tests := []struct {
		code, href, want string
	}{
		{"", "", "`(no rule)`"},
		{"my-rule", "", "`my-rule`"},
		{"my-rule", "https://example.com/docs", "[`my-rule`](https://example.com/docs)"},
	}
	for _, tt := range tests {
		got := markdownRuleRef(tt.code, tt.href)
		if got != tt.want {
			t.Errorf("markdownRuleRef(%q, %q) = %q, want %q", tt.code, tt.href, got, tt.want)
		}
	}
}

func TestHTMLRuleRef(t *testing.T) {
	tests := []struct {
		code, href, want string
	}{
		{"", "", "<code>(no rule)</code>"},
		{"my-rule", "", "<code>my-rule</code>"},
		{"my-rule", "https://example.com/docs", `<a href="https://example.com/docs"><code>my-rule</code></a>`},
	}
	for _, tt := range tests {
		got := htmlRuleRef(tt.code, tt.href)
		if got != tt.want {
			t.Errorf("htmlRuleRef(%q, %q) = %q, want %q", tt.code, tt.href, got, tt.want)
		}
	}
}

func TestParseServeLogLevel_AllLevels(t *testing.T) {
	tests := []struct {
		flag, env string
		want      slog.Level
	}{
		{"debug", "", slog.LevelDebug},
		{"info", "", slog.LevelInfo},
		{"warn", "", slog.LevelWarn},
		{"warning", "", slog.LevelWarn},
		{"error", "", slog.LevelError},
		{"", "debug", slog.LevelDebug},
		{"", "error", slog.LevelError},
		{"", "", slog.LevelInfo},
		{"garbage", "", slog.LevelInfo},
		{" Debug ", "", slog.LevelDebug},
	}
	for _, tt := range tests {
		got := parseServeLogLevel(tt.flag, tt.env)
		if got != tt.want {
			t.Errorf("parseServeLogLevel(%q, %q) = %v, want %v", tt.flag, tt.env, got, tt.want)
		}
	}
}

func TestCollectFiles_SingleFile(t *testing.T) {
	tmp := t.TempDir()
	yamlFile := filepath.Join(tmp, "spec.yaml")
	if err := os.WriteFile(yamlFile, []byte("openapi: 3.0.0"), 0644); err != nil {
		t.Fatal(err)
	}
	jsonFile := filepath.Join(tmp, "spec.json")
	if err := os.WriteFile(jsonFile, []byte(`{"openapi":"3.0.0"}`), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := config.DefaultConfig()
	files, err := collectFiles([]string{yamlFile, jsonFile}, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d", len(files))
	}
}

func TestCollectFiles_Directory(t *testing.T) {
	tmp := t.TempDir()
	if err := os.WriteFile(filepath.Join(tmp, "a.yaml"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "b.yml"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "c.txt"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := config.DefaultConfig()
	files, err := collectFiles([]string{tmp}, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Errorf("expected 2 yaml/yml files, got %d: %v", len(files), files)
	}
}

func TestCollectFiles_SkipsNodeModules(t *testing.T) {
	tmp := t.TempDir()
	nm := filepath.Join(tmp, "node_modules")
	if err := os.MkdirAll(nm, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(nm, "hidden.yaml"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmp, "visible.yaml"), []byte("x"), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := config.DefaultConfig()
	files, err := collectFiles([]string{tmp}, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 {
		t.Errorf("expected 1 file (node_modules skipped), got %d: %v", len(files), files)
	}
}

func TestCollectFiles_NonexistentArg(t *testing.T) {
	cfg := config.DefaultConfig()
	_, err := collectFiles([]string{"/nonexistent/path/xyz"}, cfg)
	if err == nil {
		t.Error("expected error for nonexistent path")
	}
}

func TestBuildLintReport(t *testing.T) {
	diags := []fileDiagnostics{
		{
			Path: "/workspace/api.yaml",
			Diagnostics: []protocol.Diagnostic{
				{
					Severity: protocol.SeverityError,
					Message:  "missing info",
					Code:     "info-required",
					Range:    protocol.Range{Start: protocol.Position{Line: 1, Character: 0}},
				},
				{
					Severity: protocol.SeverityWarning,
					Message:  "no description",
					Code:     "operation-description",
					Range:    protocol.Range{Start: protocol.Position{Line: 5, Character: 0}},
					CodeDescription: &protocol.CodeDescription{
						Href: "https://docs.example.com/rules/operation-description",
					},
				},
			},
		},
	}

	report := buildLintReport("/workspace", "", diags)
	if report.Workspace != "/workspace" {
		t.Errorf("workspace = %q, want /workspace", report.Workspace)
	}
	if report.DiagnosticCount != 2 {
		t.Errorf("diagnostic count = %d, want 2", report.DiagnosticCount)
	}
	if report.Counts.Error != 1 {
		t.Errorf("error count = %d, want 1", report.Counts.Error)
	}
	if report.Counts.Warning != 1 {
		t.Errorf("warning count = %d, want 1", report.Counts.Warning)
	}
	if report.ByRule["info-required"] != 1 {
		t.Errorf("expected info-required count 1, got %d", report.ByRule["info-required"])
	}
	if report.RuleDocs["operation-description"] != "https://docs.example.com/rules/operation-description" {
		t.Errorf("expected operation-description doc URL, got %q", report.RuleDocs["operation-description"])
	}
	if len(report.FileDetails) != 1 {
		t.Errorf("expected 1 file detail, got %d", len(report.FileDetails))
	}
	if report.GeneratedAt == "" {
		t.Error("expected non-empty GeneratedAt")
	}
}

func TestBuildLintReport_WithRepoRoot(t *testing.T) {
	diags := []fileDiagnostics{
		{
			Path: "/repo/sub/api.yaml",
			Diagnostics: []protocol.Diagnostic{
				{Severity: protocol.SeverityHint, Message: "hint diag"},
			},
		},
	}

	report := buildLintReport("/repo/sub", "/repo", diags)
	if report.RepoRoot != "/repo" {
		t.Errorf("expected repoRoot /repo, got %q", report.RepoRoot)
	}
	if _, ok := report.ByFile["sub/api.yaml"]; !ok {
		t.Errorf("expected file path relative to repo root, got keys %v", report.ByFile)
	}
	if report.Counts.Hint != 1 {
		t.Errorf("expected 1 hint, got %d", report.Counts.Hint)
	}
}

func TestCountDiags_Deep(t *testing.T) {
	diags := []fileDiagnostics{
		{Diagnostics: []protocol.Diagnostic{{}, {}}},
		{Diagnostics: []protocol.Diagnostic{{}}},
	}
	if got := countDiags(diags); got != 3 {
		t.Errorf("countDiags = %d, want 3", got)
	}
}

func TestCountDiags_Empty(t *testing.T) {
	if got := countDiags(nil); got != 0 {
		t.Errorf("countDiags(nil) = %d, want 0", got)
	}
}

func TestFixSuggestion_DeepCoverage(t *testing.T) {
	tests := []struct {
		rule string
		want string
	}{
		{"deprecated-description", "(add 'description' field)"},
		{"sailpoint-operation-id-camel-case", "(add 'operationId' field)"},
		{"sailpoint-operation-single-tag", "(add an operation tag)"},
		{"sailpoint-operation-4xx-response", "(add standard error responses)"},
		{"no-request-body-on-get", "(remove requestBody)"},
		{"migration-nullable", "(use type array in 3.1)"},
		{"unknown-rule", ""},
	}
	for _, tt := range tests {
		got := fixSuggestion(tt.rule)
		if got != tt.want {
			t.Errorf("fixSuggestion(%q) = %q, want %q", tt.rule, got, tt.want)
		}
	}
}

func TestIsOpenAPIExtension_Deep(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"dir/spec.yaml", true},
		{"dir/spec.yml", true},
		{"dir/spec.json", true},
		{"spec.txt", false},
		{"spec.YAML", true},
		{"spec.JSON", true},
		{"spec.go", false},
		{"", false},
	}
	for _, tt := range tests {
		got := isOpenAPIExtension(tt.path)
		if got != tt.want {
			t.Errorf("isOpenAPIExtension(%q) = %v, want %v", tt.path, got, tt.want)
		}
	}
}

func TestMatchGlob(t *testing.T) {
	tests := []struct {
		pattern, path string
		want          bool
	}{
		{"*.yaml", "spec.yaml", true},
		{"*.yaml", "dir/spec.yaml", true},
		{"**/*.yaml", "dir/spec.yaml", true},
		{"*.txt", "spec.yaml", false},
	}
	for _, tt := range tests {
		got := matchGlob(tt.pattern, tt.path)
		if got != tt.want {
			t.Errorf("matchGlob(%q, %q) = %v, want %v", tt.pattern, tt.path, got, tt.want)
		}
	}
}

func TestFilterRunResult_NilKeepFunc(t *testing.T) {
	run := &lintengine.RunResult{Workspace: "/test"}
	got := filterRunResult(run, nil)
	if got != run {
		t.Error("expected original run returned when keep is nil")
	}
}

func TestFilterRunResult_NilRun(t *testing.T) {
	if got := filterRunResult(nil, nil); got != nil {
		t.Error("expected nil for nil run")
	}
}

func TestParsePRNumber_FromGITHUBREF(t *testing.T) {
	t.Setenv("GITHUB_PR_NUMBER", "")
	t.Setenv("GITHUB_REF", "refs/pull/42/merge")

	num, err := parsePRNumber()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if num != 42 {
		t.Errorf("expected PR number 42, got %d", num)
	}
}

func TestParsePRNumber_FromEnvVar(t *testing.T) {
	t.Setenv("GITHUB_PR_NUMBER", "99")
	t.Setenv("GITHUB_REF", "")

	num, err := parsePRNumber()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if num != 99 {
		t.Errorf("expected PR number 99, got %d", num)
	}
}

func TestParsePRNumber_NeitherSet(t *testing.T) {
	t.Setenv("GITHUB_PR_NUMBER", "")
	t.Setenv("GITHUB_REF", "")

	_, err := parsePRNumber()
	if err == nil {
		t.Error("expected error when neither env var is set")
	}
}

func TestCiShouldFail(t *testing.T) {
	old := ciFailOn
	defer func() { ciFailOn = old }()

	ciFailOn = "warn"
	if !ciShouldFail(protocol.SeverityWarning) {
		t.Error("expected warning to fail with ciFailOn=warn")
	}
	if ciShouldFail(protocol.SeverityHint) {
		t.Error("expected hint NOT to fail with ciFailOn=warn")
	}

	ciFailOn = "error"
	if !ciShouldFail(protocol.SeverityError) {
		t.Error("expected error to fail with ciFailOn=error")
	}
	if ciShouldFail(protocol.SeverityWarning) {
		t.Error("expected warning NOT to fail with ciFailOn=error")
	}
}

