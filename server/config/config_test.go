package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/rules/checks"
)

func init() {
	s := gossip.NewServer("test", "0.0.0")
	analyzers.RegisterAll(s)
	checks.RegisterAll(s)
}

func TestDefaultConfig(t *testing.T) {
	cfg := config.DefaultConfig()

	if cfg.Extends == "" {
		t.Error("Extends should not be empty")
	}
	if len(cfg.Include) == 0 {
		t.Error("Include should not be empty")
	}
	if cfg.Output.Format != "text" {
		t.Errorf("Output.Format = %q, want %q", cfg.Output.Format, "text")
	}
	if got := cfg.GuidelinesBaseURL; got != barrelman.GuidelinesBaseURL() {
		t.Errorf("GuidelinesBaseURL = %q, want %q", got, barrelman.GuidelinesBaseURL())
	}
	if cfg.LSP.Debounce == 0 {
		t.Error("LSP.Debounce should not be zero")
	}
	if got := cfg.EffectiveSchemaValidationMode(); got != "go" {
		t.Errorf("EffectiveSchemaValidationMode() = %q, want %q", got, "go")
	}
}

func TestConfig_BuildEnabledRules(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Rules = map[string]string{
		"operation-tags": "off",
	}
	enabled := cfg.BuildEnabledRules()
	if enabled["sp-123"] {
		t.Error("sp-123 should be disabled via legacy alias")
	}
}

func TestConfig_EffectiveGuidelinesBaseURL(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.GuidelinesBaseURL = "https://docs.example.com/guidelines"
	if got := cfg.EffectiveGuidelinesBaseURL(); got != "https://docs.example.com/guidelines/" {
		t.Errorf("EffectiveGuidelinesBaseURL() = %q, want %q", got, "https://docs.example.com/guidelines/")
	}
}

func TestConfig_BuildEnabledRules_Strict(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Extends = "telescope:strict"
	enabled := cfg.BuildEnabledRules()
	if len(enabled) == 0 {
		t.Fatal("telescope:strict should produce non-empty enabled rules")
	}
}

func TestConfig_BuildEnabledRules_UnknownExtends(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Extends = "telescope:nonexistent"
	enabled := cfg.BuildEnabledRules()
	// Should not panic; returns empty map (only user overrides apply)
	if len(enabled) != 0 {
		t.Errorf("unknown extends should produce empty enabled rules, got %d", len(enabled))
	}
}

func TestConfig_EffectiveSchemaValidationMode(t *testing.T) {
	cfg := config.DefaultConfig()

	cfg.LSP.SchemaValidation.Mode = "bun"
	if got := cfg.EffectiveSchemaValidationMode(); got != "go" {
		t.Errorf("mode bun => %q, want go", got)
	}

	cfg.LSP.SchemaValidation.Mode = "compare"
	if got := cfg.EffectiveSchemaValidationMode(); got != "go" {
		t.Errorf("mode compare => %q, want go", got)
	}

	cfg.LSP.SchemaValidation.Mode = "invalid"
	if got := cfg.EffectiveSchemaValidationMode(); got != "go" {
		t.Errorf("invalid mode => %q, want go", got)
	}
}

func TestConfig_NeedsBunSidecar(t *testing.T) {
	cfg := config.DefaultConfig()
	if cfg.NeedsBunSidecar() {
		t.Fatal("default config should not require bun sidecar")
	}

	cfg.LSP.SchemaValidation.Mode = "bun"
	if cfg.NeedsBunSidecar() {
		t.Fatal("schema validation mode should not require bun sidecar")
	}

	cfg.LSP.SchemaValidation.Mode = "go"
	cfg.SpectralRulesets = []string{"my-ruleset.yaml"}
	if !cfg.NeedsBunSidecar() {
		t.Fatal("spectral ruleset should require bun sidecar")
	}
}

func TestLoadFile_NormalizesLegacyRulesAndBaseURL(t *testing.T) {
	originalBaseURL := barrelman.GuidelinesBaseURL()
	t.Cleanup(func() {
		barrelman.SetGuidelinesBaseURL(originalBaseURL)
	})

	dir := t.TempDir()
	path := filepath.Join(dir, ".telescope.yaml")
	if err := os.WriteFile(path, []byte(`
guidelinesBaseURL: https://docs.example.com/guidelines
rules:
  operation-tags: error
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := config.LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	if _, ok := cfg.Rules["operation-tags"]; ok {
		t.Fatalf("expected legacy rule ID to be normalized, got %+v", cfg.Rules)
	}
	if cfg.Rules["sp-123"] != "error" {
		t.Fatalf("expected sp-123 override, got %+v", cfg.Rules)
	}
	if got := cfg.GuidelinesBaseURL; got != "https://docs.example.com/guidelines/" {
		t.Fatalf("GuidelinesBaseURL = %q, want %q", got, "https://docs.example.com/guidelines/")
	}
}
