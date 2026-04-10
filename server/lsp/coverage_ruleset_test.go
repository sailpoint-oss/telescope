package lsp

import (
	"log/slog"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func TestNewRulesetManager(t *testing.T) {
	logger := slog.Default()
	mgr := NewRulesetManager(nil, logger)
	if mgr == nil {
		t.Fatal("NewRulesetManager returned nil")
	}
	if mgr.logger != logger {
		t.Error("logger not stored")
	}
	if mgr.engine != nil {
		t.Error("engine should be nil when passed nil")
	}
}

func TestTelescopeConfig_DefaultWhenNil(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	cfg := mgr.TelescopeConfig()
	if cfg == nil {
		t.Fatal("TelescopeConfig() returned nil when telescopeCfg is nil")
	}
	if cfg.Extends == "" {
		t.Error("default config should have a non-empty Extends")
	}
}

func TestTelescopeConfig_ReturnsSet(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	custom := &config.Config{Extends: "telescope:all"}
	mgr.telescopeCfg = custom
	got := mgr.TelescopeConfig()
	if got != custom {
		t.Error("expected the config we set")
	}
	if got.Extends != "telescope:all" {
		t.Errorf("Extends = %q, want %q", got.Extends, "telescope:all")
	}
}

func TestWorkspaceEnv_NilWhenEmpty(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	if env := mgr.WorkspaceEnv(); env != nil {
		t.Fatalf("expected nil, got %v", env)
	}
}

func TestWorkspaceEnv_ReturnsCopy(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	mgr.workspaceEnv = map[string]string{"KEY": "value"}

	env := mgr.WorkspaceEnv()
	if env == nil {
		t.Fatal("expected non-nil env")
	}
	if env["KEY"] != "value" {
		t.Errorf("KEY = %q, want %q", env["KEY"], "value")
	}

	env["KEY"] = "mutated"
	env2 := mgr.WorkspaceEnv()
	if env2["KEY"] != "value" {
		t.Error("WorkspaceEnv returned a reference instead of a copy")
	}
}

func TestDiagnosticRuleID(t *testing.T) {
	tests := []struct {
		name string
		diag protocol.Diagnostic
		want string
	}{
		{
			"code string",
			protocol.Diagnostic{Code: "my-rule", Source: "fallback"},
			"my-rule",
		},
		{
			"code empty falls back to source",
			protocol.Diagnostic{Code: "", Source: "source-rule"},
			"source-rule",
		},
		{
			"code nil falls back to source",
			protocol.Diagnostic{Source: "from-source"},
			"from-source",
		},
		{
			"code integer falls back to source",
			protocol.Diagnostic{Code: 42, Source: "src"},
			"src",
		},
		{
			"both empty",
			protocol.Diagnostic{},
			"",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := diagnosticRuleID(tt.diag)
			if got != tt.want {
				t.Errorf("diagnosticRuleID() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestIsWatchedFile(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"/some/path/.spectral.yaml", true},
		{"/some/path/.spectral.yml", true},
		{"/some/path/.spectral.json", true},
		{"/workspace/.telescope.yaml", true},
		{"/workspace/.telescope.yml", true},
		{"/workspace/.telescope/config.yaml", true},
		{"/workspace/.telescope/config.yml", true},
		{"/workspace/.telescope/spectral.yaml", true},
		{"/workspace/.telescope/spectral.yml", true},
		{"/workspace/.telescope/spectral.json", true},
		{"/workspace/.env", true},
		{"/workspace/.env.local", true},
		{"/workspace/openapi.yaml", false},
		{"/workspace/package.json", false},
		{"/workspace/.gitignore", false},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := IsWatchedFile(tt.path)
			if got != tt.want {
				t.Errorf("IsWatchedFile(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

func TestWatchPatterns_NonEmpty(t *testing.T) {
	patterns := WatchPatterns()
	if len(patterns) == 0 {
		t.Fatal("WatchPatterns() returned empty slice")
	}
	seen := make(map[string]bool, len(patterns))
	for _, p := range patterns {
		if seen[p] {
			t.Errorf("duplicate pattern: %s", p)
		}
		seen[p] = true
	}
}

func TestWatchPatterns_ContainsExpected(t *testing.T) {
	patterns := WatchPatterns()
	want := []string{
		"**/.spectral.yaml",
		"**/.telescope.yaml",
		"**/.env",
	}
	pset := make(map[string]bool, len(patterns))
	for _, p := range patterns {
		pset[p] = true
	}
	for _, w := range want {
		if !pset[w] {
			t.Errorf("WatchPatterns() missing %q", w)
		}
	}
}

func TestBuildTransformer_NilResolved(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	mgr.resolved = nil
	tr := mgr.buildTransformer()
	if tr != nil {
		t.Error("buildTransformer should return nil when resolved is nil")
	}
}

func TestBuildTransformer_EmptyRules(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	mgr.resolved = &rulesets.RuleSet{Rules: map[string]rulesets.RuleDefinition{}}
	tr := mgr.buildTransformer()
	if tr != nil {
		t.Error("buildTransformer should return nil when rules are empty")
	}
}

func TestBuildTransformer_FiltersDisabled(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	mgr.resolved = &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"keep-rule":    {Severity: "warn"},
			"disable-rule": {Severity: "off"},
		},
	}
	tr := mgr.buildTransformer()
	if tr == nil {
		t.Fatal("expected non-nil transformer")
	}

	diags := []protocol.Diagnostic{
		{Source: "keep-rule", Message: "kept"},
		{Source: "disable-rule", Message: "dropped"},
	}
	result := tr("file:///test.yaml", diags)
	if len(result) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(result))
	}
	if result[0].Source != "keep-rule" {
		t.Errorf("expected keep-rule, got %s", result[0].Source)
	}
}

func TestBuildTransformer_OverridesSeverity(t *testing.T) {
	mgr := NewRulesetManager(nil, slog.Default())
	mgr.resolved = &rulesets.RuleSet{
		Rules: map[string]rulesets.RuleDefinition{
			"my-rule": {Severity: "error"},
		},
	}
	tr := mgr.buildTransformer()
	if tr == nil {
		t.Fatal("expected non-nil transformer")
	}

	diags := []protocol.Diagnostic{
		{Source: "my-rule", Severity: protocol.SeverityWarning, Message: "test"},
	}
	result := tr("file:///test.yaml", diags)
	if len(result) != 1 {
		t.Fatalf("expected 1 diagnostic, got %d", len(result))
	}
	if result[0].Severity != protocol.SeverityError {
		t.Errorf("severity = %d, want %d (Error)", result[0].Severity, protocol.SeverityError)
	}
}
