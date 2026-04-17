package config_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
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
	if got := cfg.EffectiveLintEngines(); len(got) != 1 || got[0] != "barrelman" {
		t.Errorf("EffectiveLintEngines() = %v, want [barrelman]", got)
	}
}

func TestConfig_BuildEnabledRules(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Rules = map[string]string{
		"operation-tags": "off",
	}
	enabled := cfg.BuildEnabledRules()
	if enabled["sailpoint-operation-single-tag"] {
		t.Error("sailpoint-operation-single-tag should be disabled via legacy alias")
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

	cfg2 := config.DefaultConfig()
	cfg2.AdditionalValidation = map[string]config.ValidationGroup{
		"test": {
			Patterns: []string{"*.yaml"},
			Schemas: []config.SchemaPatternMapping{
				{Schema: "my-schema.json"},
			},
		},
	}
	if !cfg2.NeedsBunSidecar() {
		t.Fatal("additional validation schemas should require bun sidecar")
	}

	cfg3 := config.DefaultConfig()
	cfg3.AdditionalValidation = map[string]config.ValidationGroup{
		"test": {
			Patterns: []string{"*.yaml"},
		},
	}
	if cfg3.NeedsBunSidecar() {
		t.Fatal("additional validation without schemas should not require bun sidecar")
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
	if cfg.Rules["sailpoint-operation-single-tag"] != "error" {
		t.Fatalf("expected sailpoint-operation-single-tag override, got %+v", cfg.Rules)
	}
	if got := cfg.GuidelinesBaseURL; got != "https://docs.example.com/guidelines/" {
		t.Fatalf("GuidelinesBaseURL = %q, want %q", got, "https://docs.example.com/guidelines/")
	}
}

func TestLoadFile_NormalizesLintEngines(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".telescope.yaml")
	if err := os.WriteFile(path, []byte(`
lint:
  engines:
    - both
    - vacuum
`), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := config.LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	got := cfg.EffectiveLintEngines()
	if len(got) != 2 || got[0] != "barrelman" || got[1] != "vacuum" {
		t.Fatalf("EffectiveLintEngines() = %v, want [barrelman vacuum]", got)
	}
	if !cfg.UsesVacuum() {
		t.Fatal("UsesVacuum() = false, want true")
	}
}

func TestLoad_PrefersNestedConfigOverLegacy(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, ".telescope.yaml"), []byte("extends: telescope:owasp\n"), 0o644); err != nil {
		t.Fatalf("write legacy config: %v", err)
	}
	cfgDir := filepath.Join(dir, ".telescope")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatalf("mkdir nested config dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cfgDir, "config.yaml"), []byte("extends: telescope:strict\n"), 0o644); err != nil {
		t.Fatalf("write nested config: %v", err)
	}

	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Extends != "telescope:strict" {
		t.Fatalf("extends = %q, want telescope:strict", cfg.Extends)
	}
}

func TestLoadFile_V2ConfigNormalizesActionSections(t *testing.T) {
	dir := t.TempDir()
	cfgDir := filepath.Join(dir, ".telescope")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	path := filepath.Join(cfgDir, "config.yaml")
	content := `
configVersion: 2
workspace:
  envFiles:
    - .env.shared
  targets:
    apis:
      kind: openapi
      include:
        - api/**/*.yaml
    telescopeConfig:
      kind: config
      include:
        - .telescope/config.yaml
linting:
  presets:
    - telescope:recommended
    - telescope:owasp
  overrides:
    operation-tags: off
  engines:
    vacuum:
      enabled: true
      rulesets:
        - builtin: recommended
        - path: rulesets/vacuum.yaml
  rulesets:
    spectral:
      - rulesets/spectral.yaml
validation:
  openapi:
    targets:
      - apis
    targetVersion: "3.1"
    breakingChanges:
      enabled: true
      onSave: true
      compareTo: main
      rules: rulesets/breaking.yaml
  files:
    telescopeConfig:
      targets:
        - telescopeConfig
      schema: schemas/telescope-config.v2.schema.json
testing:
  contract:
    baseUrl: https://api.example.com
    concurrency: 4
`
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := config.LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	if !cfg.UsesV2Layout() {
		t.Fatal("expected v2 config layout to be detected")
	}
	if got := cfg.EffectivePresetNames(); len(got) != 2 || got[0] != "telescope:recommended" || got[1] != "telescope:owasp" {
		t.Fatalf("EffectivePresetNames() = %v", got)
	}
	if cfg.Extends != "telescope:recommended" {
		t.Fatalf("legacy extends compatibility = %q, want telescope:recommended", cfg.Extends)
	}
	if got := cfg.EffectiveLintEngines(); len(got) != 2 || got[0] != "barrelman" || got[1] != "vacuum" {
		t.Fatalf("EffectiveLintEngines() = %v, want [barrelman vacuum]", got)
	}
	if got := cfg.Lint.Vacuum.Ruleset; got != ".telescope/rulesets/vacuum.yaml" {
		t.Fatalf("vacuum ruleset = %q", got)
	}
	if got := cfg.SpectralRulesets; len(got) != 1 || got[0] != ".telescope/rulesets/spectral.yaml" {
		t.Fatalf("spectral rulesets = %v", got)
	}
	if got := cfg.OpenAPI.TargetVersion; got != "3.1" {
		t.Fatalf("OpenAPI.TargetVersion = %q", got)
	}
	if got := cfg.OpenAPI.Patterns; len(got) != 1 || got[0] != "api/**/*.yaml" {
		t.Fatalf("OpenAPI.Patterns = %v", got)
	}
	if !cfg.LSP.DiffOnSave {
		t.Fatal("expected LSP diff-on-save to be enabled")
	}
	if got := cfg.EffectiveDiffCompareBaseRef(); got != "main" {
		t.Fatalf("EffectiveDiffCompareBaseRef() = %q", got)
	}
	if got := cfg.LSP.BreakingRulesPath; got != ".telescope/rulesets/breaking.yaml" {
		t.Fatalf("BreakingRulesPath = %q", got)
	}
	if got := cfg.EffectiveEnvFiles(); len(got) != 1 || got[0] != ".env.shared" {
		t.Fatalf("EffectiveEnvFiles() = %v", got)
	}
	if got := cfg.EffectiveContractBaseURL(""); got != "https://api.example.com" {
		t.Fatalf("EffectiveContractBaseURL() = %q", got)
	}
	if got := cfg.EffectiveContractConcurrency(); got != 4 {
		t.Fatalf("EffectiveContractConcurrency() = %d", got)
	}
	group, ok := cfg.AdditionalValidation["telescopeConfig"]
	if !ok {
		t.Fatal("expected validation.files group to normalize into AdditionalValidation")
	}
	if len(group.Patterns) != 1 || group.Patterns[0] != ".telescope/config.yaml" {
		t.Fatalf("group patterns = %v", group.Patterns)
	}
	if len(group.Schemas) != 1 || group.Schemas[0].Schema != "schemas/telescope-config.v2.schema.json" {
		t.Fatalf("group schemas = %#v", group.Schemas)
	}
}

func TestLoadFile_V2RequiresExplicitVersion(t *testing.T) {
	dir := t.TempDir()
	cfgDir := filepath.Join(dir, ".telescope")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	path := filepath.Join(cfgDir, "config.yaml")
	if err := os.WriteFile(path, []byte("workspace:\n  ignore:\n    - vendor/**\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	_, err := config.LoadFile(path)
	if err == nil || !strings.Contains(err.Error(), "configVersion: 2") {
		t.Fatalf("LoadFile() error = %v, want explicit configVersion failure", err)
	}
}

func TestResolveAndFetchCredentials_V2SupportsLiteralAndFileSources(t *testing.T) {
	dir := t.TempDir()
	secretPath := filepath.Join(dir, "token.txt")
	if err := os.WriteFile(secretPath, []byte("file-secret\n"), 0o600); err != nil {
		t.Fatalf("write secret: %v", err)
	}
	cfg := &config.Config{
		ConfigVersion: 2,
		Testing: config.TestingSection{
			Contract: config.ContractTestingSection{
				Credentials: map[string]config.CredentialSourceV2{
					"literal": {
						APIKey: config.CredentialValueSource{Literal: "hard-coded"},
					},
					"file": {
						AccessToken: config.CredentialValueSource{File: "token.txt"},
					},
					"basic": {
						Username: config.CredentialValueSource{Literal: "user"},
						Password: config.CredentialValueSource{Literal: "pass"},
					},
				},
			},
		},
	}

	got, err := cfg.ResolveAndFetchCredentials(context.Background(), nil, map[string]string{
		"literal": "override-token",
	}, dir, nil, nil)
	if err != nil {
		t.Fatalf("ResolveAndFetchCredentials: %v", err)
	}
	if got["literal"] != "override-token" {
		t.Fatalf("literal credential = %q", got["literal"])
	}
	if got["file"] != "file-secret" {
		t.Fatalf("file credential = %q", got["file"])
	}
	if got["basic"] != "user:pass" {
		t.Fatalf("basic credential = %q", got["basic"])
	}
}
