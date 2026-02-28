package config_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
)

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
