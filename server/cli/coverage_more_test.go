package cli

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/config"
	telescopedocs "github.com/sailpoint-oss/telescope/server/docs"
	telescopemock "github.com/sailpoint-oss/telescope/server/mock"
)

func TestBaselineSaveLoadCompare(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd: %v", err)
	}
	dir := t.TempDir()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("Chdir: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	current := []fileDiagnostics{{
		Path: "spec.yaml",
		Diagnostics: []protocol.Diagnostic{{
			Code:    "sp-123",
			Message: "missing tags",
			Range: protocol.Range{
				Start: protocol.Position{Line: 4},
				End:   protocol.Position{Line: 4, Character: 10},
			},
		}},
	}}

	if err := SaveBaseline(current); err != nil {
		t.Fatalf("SaveBaseline: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, baselinePath)); err != nil {
		t.Fatalf("expected baseline file: %v", err)
	}

	baseline, err := LoadBaseline()
	if err != nil {
		t.Fatalf("LoadBaseline: %v", err)
	}
	comp := CompareBaseline(baseline, []fileDiagnostics{{
		Path: "spec.yaml",
		Diagnostics: []protocol.Diagnostic{{
			Code:    "sp-123",
			Message: "missing tags",
			Range: protocol.Range{
				Start: protocol.Position{Line: 4},
				End:   protocol.Position{Line: 4, Character: 10},
			},
		}, {
			Code:    "sp-404",
			Message: "missing error response",
			Range: protocol.Range{
				Start: protocol.Position{Line: 8},
				End:   protocol.Position{Line: 8, Character: 12},
			},
		}},
	}})
	if comp.BaselineCount != 1 || comp.CurrentCount != 2 || comp.NewCount != 1 || comp.FixedCount != 0 {
		t.Fatalf("unexpected baseline comparison: %+v", comp)
	}
	if len(comp.NewDiags) != 1 || len(comp.NewDiags[0].Diagnostics) != 1 {
		t.Fatalf("expected one new diagnostic group, got %+v", comp.NewDiags)
	}
}

func TestNewRootCmd_WiresSubcommands(t *testing.T) {
	cmd := newRootCmd()
	names := map[string]bool{}
	for _, c := range cmd.Commands() {
		names[c.Name()] = true
	}
	for _, want := range []string{"lint", "validate", "ci", "serve", "bundle", "docs", "mock", "overlay", "contract"} {
		if !names[want] {
			t.Fatalf("missing subcommand %q", want)
		}
	}
}

func TestNewBundleCmd_Metadata(t *testing.T) {
	cmd := newBundleCmd()
	if cmd.Use != "bundle [root-file]" {
		t.Fatalf("unexpected use line: %q", cmd.Use)
	}
	if cmd.Flag("output") == nil || cmd.Flag("format") == nil || cmd.Flag("mode") == nil {
		t.Fatal("expected output, format, and mode flags")
	}
}

func TestNewOverlayCmd_Metadata(t *testing.T) {
	cmd := newOverlayCmd()
	if cmd.Use != "overlay" {
		t.Fatalf("unexpected use line: %q", cmd.Use)
	}
	applyCmd, _, err := cmd.Find([]string{"apply"})
	if err != nil {
		t.Fatalf("Find(apply): %v", err)
	}
	if applyCmd.Flag("overlay") == nil || applyCmd.Flag("output") == nil {
		t.Fatal("expected overlay apply flags")
	}
}

func TestNewDocsCmd_Metadata(t *testing.T) {
	cmd := newDocsCmd()
	if cmd.Use != "docs <spec>" {
		t.Fatalf("unexpected use line: %q", cmd.Use)
	}
	for _, name := range []string{"output", "serve", "publish", "port", "theme", "title", "no-llm", "no-json", "no-html", "binary"} {
		if cmd.Flag(name) == nil {
			t.Fatalf("missing docs flag %q", name)
		}
	}
}

func TestNewMockCmd_Metadata(t *testing.T) {
	cmd := newMockCmd()
	if cmd.Use != "mock <spec>" {
		t.Fatalf("unexpected use line: %q", cmd.Use)
	}
	for _, name := range []string{"port", "output", "schema", "format"} {
		if cmd.Flag(name) == nil {
			t.Fatalf("missing mock flag %q", name)
		}
	}
}

func TestLoadCommandConfig_WalksUpToRepoRoot(t *testing.T) {
	dir := t.TempDir()
	cfgDir := filepath.Join(dir, ".telescope")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfgDir, "config.yaml"), []byte("configVersion: 2\nlinting:\n  presets:\n    - telescope:strict\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	specDir := filepath.Join(dir, "api")
	if err := os.MkdirAll(specDir, 0o755); err != nil {
		t.Fatalf("mkdir spec dir: %v", err)
	}
	specPath := filepath.Join(specDir, "openapi.yaml")
	if err := os.WriteFile(specPath, []byte("openapi: 3.1.0\ninfo:\n  title: Example\n  version: 1.0.0\npaths: {}\n"), 0o644); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	cfg, workspaceRoot, err := loadCommandConfig(specPath)
	if err != nil {
		t.Fatalf("loadCommandConfig: %v", err)
	}
	if workspaceRoot != dir {
		t.Fatalf("workspaceRoot = %q, want %q", workspaceRoot, dir)
	}
	if cfg.Extends != "telescope:strict" {
		t.Fatalf("extends = %q, want telescope:strict", cfg.Extends)
	}
}

func TestApplyDocsConfigDefaults_UsesV2DocumentationSection(t *testing.T) {
	cmd := newDocsCmd()
	opts := telescopedocs.GenerateOpts{}
	cfg := &config.Config{
		ConfigVersion: 2,
		Documentation: config.DocumentationSection{
			PrintingPress: config.PrintingPressSection{
				Output:  "docs",
				Publish: true,
				Preview: config.PrintingPressPreviewSection{
					Port:  9191,
					Theme: "roger",
				},
				Options: config.PrintingPressOptionsSection{
					Title:  "Example API",
					NoLLM:  true,
					NoJSON: true,
					NoHTML: true,
					Binary: "bin/printing-press",
				},
			},
		},
	}

	applyDocsConfigDefaults(cmd, cfg, "/workspace", &opts)
	if opts.OutputDir != filepath.Join("/workspace", "docs") {
		t.Fatalf("OutputDir = %q", opts.OutputDir)
	}
	if !opts.Publish || opts.ServePort != 9191 || opts.Theme != "roger" {
		t.Fatalf("unexpected preview defaults: %+v", opts)
	}
	if !opts.NoLLM || !opts.NoJSON || !opts.NoHTML || opts.Title != "Example API" {
		t.Fatalf("unexpected option defaults: %+v", opts)
	}
	if opts.BinaryPath != filepath.Join("/workspace", "bin/printing-press") {
		t.Fatalf("BinaryPath = %q", opts.BinaryPath)
	}
}

func TestApplyMockConfigDefaults_UsesV2TestingSection(t *testing.T) {
	cmd := newMockCmd()
	opts := telescopemock.GenerateOptions{}
	port := 0
	cfg := &config.Config{
		ConfigVersion: 2,
		Testing: config.TestingSection{
			Mocks: config.MockTestingSection{
				Generate: config.MockGenerateSection{
					OutputDir: "mocks",
					Format:    "yaml",
					Schema:    "User",
				},
				Serve: config.MockServeSection{Port: 5050},
			},
		},
	}

	applyMockConfigDefaults(cmd, cfg, "/workspace", &opts, &port)
	if opts.OutputDir != filepath.Join("/workspace", "mocks") {
		t.Fatalf("OutputDir = %q", opts.OutputDir)
	}
	if opts.Format != telescopemock.FormatYAML || opts.SchemaName != "User" {
		t.Fatalf("unexpected mock defaults: %+v", opts)
	}
	if port != 5050 {
		t.Fatalf("port = %d, want 5050", port)
	}
}
