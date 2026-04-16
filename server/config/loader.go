package config

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"

	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/telescope/server/rulesets"
	"gopkg.in/yaml.v3"
)

// ConfigFiles are the files searched for configuration, in priority order.
var ConfigFiles = []string{
	".telescope/config.yaml",
	".telescope/config.yml",
	".telescope.yaml",
	".telescope.yml",
}

// Load finds and loads the telescope config from the given workspace root.
// Returns the default config if no config file is found.
func Load(workspaceRoot string) (*Config, error) {
	for _, name := range ConfigFiles {
		path := filepath.Join(workspaceRoot, name)
		if _, err := os.Stat(path); err == nil {
			return LoadFile(path)
		}
	}
	cfg := DefaultConfig()
	barrelman.SetGuidelinesBaseURL(cfg.EffectiveGuidelinesBaseURL())
	return cfg, nil
}

// LoadFile loads config from a specific file path.
func LoadFile(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config %s: %w", path, err)
	}

	cfg := DefaultConfig()
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	if err := dec.Decode(cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	if err := cfg.normalizeV2(path); err != nil {
		return nil, fmt.Errorf("normalize config %s: %w", path, err)
	}
	cfg.Rules = normalizeRuleOverrides(cfg.Rules)
	cfg.GuidelinesBaseURL = cfg.EffectiveGuidelinesBaseURL()
	barrelman.SetGuidelinesBaseURL(cfg.GuidelinesBaseURL)

	return cfg, nil
}

func normalizeRuleOverrides(rules map[string]string) map[string]string {
	if len(rules) == 0 {
		return rules
	}

	normalized := make(map[string]string, len(rules))
	for id, severity := range rules {
		canonical := rulesets.NormalizeRuleID(id)
		if canonical == id {
			normalized[id] = severity
		}
	}
	for id, severity := range rules {
		canonical := rulesets.NormalizeRuleID(id)
		if canonical != id {
			if _, exists := normalized[canonical]; exists {
				continue
			}
		}
		normalized[canonical] = severity
	}
	return normalized
}
