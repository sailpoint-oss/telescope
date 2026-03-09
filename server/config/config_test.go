package config_test

import (
	"testing"

	"github.com/LukasParke/gossip"
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
	if cfg.LSP.Debounce == 0 {
		t.Error("LSP.Debounce should not be zero")
	}
}

func TestConfig_BuildEnabledRules(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.Rules = map[string]string{
		"some-rule": "off",
	}
	enabled := cfg.BuildEnabledRules()
	if enabled["some-rule"] {
		t.Error("some-rule should be disabled")
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
