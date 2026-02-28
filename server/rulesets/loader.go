package rulesets

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// LoadFile loads a ruleset from a YAML file.
func LoadFile(path string) (*RuleSet, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read ruleset %s: %w", path, err)
	}
	return LoadBytes(data)
}

// LoadBytes parses a ruleset from YAML bytes.
func LoadBytes(data []byte) (*RuleSet, error) {
	var rs RuleSet
	if err := yaml.Unmarshal(data, &rs); err != nil {
		return nil, fmt.Errorf("parse ruleset: %w", err)
	}
	return &rs, nil
}
