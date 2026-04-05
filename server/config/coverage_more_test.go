package config_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
)

func TestLoad_FindsNestedConfigFile(t *testing.T) {
	dir := t.TempDir()
	cfgDir := filepath.Join(dir, ".telescope")
	if err := os.MkdirAll(cfgDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	path := filepath.Join(cfgDir, "config.yaml")
	if err := os.WriteFile(path, []byte("extends: telescope:strict\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Extends != "telescope:strict" {
		t.Fatalf("extends = %q, want telescope:strict", cfg.Extends)
	}
}

func TestLoad_NoConfigReturnsDefault(t *testing.T) {
	dir := t.TempDir()
	cfg, err := config.Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg == nil || cfg.Extends == "" {
		t.Fatal("expected default config")
	}
}

func TestResolveRunner(t *testing.T) {
	tests := []struct {
		name string
		ref  config.RuleRef
		want string
	}{
		{name: "explicit bun", ref: config.RuleRef{Runner: "bun", Rule: "x.go"}, want: "bun"},
		{name: "explicit native", ref: config.RuleRef{Runner: "native", Rule: "x.ts"}, want: "native"},
		{name: "auto ts", ref: config.RuleRef{Runner: "auto", Rule: "rule.ts"}, want: "bun"},
		{name: "empty js", ref: config.RuleRef{Rule: "rule.js"}, want: "bun"},
		{name: "yaml native", ref: config.RuleRef{Rule: "rule.yaml"}, want: "native"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := config.ResolveRunner(tt.ref); got != tt.want {
				t.Fatalf("ResolveRunner() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestContractConfigHelpers(t *testing.T) {
	var nilCfg *config.ContractTestsConfig
	if got := nilCfg.EffectiveConcurrency(); got != 2 {
		t.Fatalf("nil EffectiveConcurrency = %d, want 2", got)
	}
	if got := nilCfg.EffectiveContractBaseURL(""); got != "http://localhost:8080" {
		t.Fatalf("nil EffectiveContractBaseURL = %q", got)
	}
	files := nilCfg.EffectiveEnvFiles()
	if len(files) == 0 {
		t.Fatal("expected default env files")
	}

	cfg := &config.ContractTestsConfig{
		DefaultBaseURL: " https://api.example.com ",
		Concurrency:    7,
		EnvFiles:       []string{" .env.shared ", "", ".env.local"},
	}
	if got := cfg.EffectiveContractBaseURL(""); got != "https://api.example.com" {
		t.Fatalf("EffectiveContractBaseURL = %q", got)
	}
	if got := cfg.EffectiveConcurrency(); got != 7 {
		t.Fatalf("EffectiveConcurrency = %d, want 7", got)
	}
	if got := cfg.EffectiveEnvFiles(); len(got) != 2 || got[0] != ".env.shared" || got[1] != ".env.local" {
		t.Fatalf("EffectiveEnvFiles = %#v", got)
	}
}

func TestResolveContractCredentials_PrefersOverridesAndEnv(t *testing.T) {
	cfg := &config.ContractTestsConfig{
		Credentials: map[string]config.CredentialSource{
			"basic": {
				UsernameEnv: "BASIC_USER",
				PasswordEnv: "BASIC_PASS",
			},
			"bearer": {
				AccessTokenEnv: "ACCESS_TOKEN",
			},
		},
	}
	dotenv := map[string]string{
		"BASIC_USER":   "user",
		"BASIC_PASS":   "pass",
		"ACCESS_TOKEN": "token-from-env",
	}
	got := cfg.ResolveContractCredentials(map[string]string{
		"bearer": "override-token",
	}, dotenv)
	if got["basic"] != "user:pass" {
		t.Fatalf("basic creds = %q", got["basic"])
	}
	if got["bearer"] != "override-token" {
		t.Fatalf("bearer creds = %q", got["bearer"])
	}
}

func TestLoad_ContextCancellationDoesNotMatter(t *testing.T) {
	_ = context.Background()
	dir := t.TempDir()
	cfg, err := config.Load(dir)
	if err != nil || cfg == nil {
		t.Fatalf("expected default config on empty workspace, got cfg=%v err=%v", cfg, err)
	}
}
