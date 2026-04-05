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
	rs.Rules = normalizeRuleDefinitions(rs.Rules)
	return &rs, nil
}

func normalizeRuleDefinitions(rules map[string]RuleDefinition) map[string]RuleDefinition {
	if len(rules) == 0 {
		return rules
	}

	normalized := make(map[string]RuleDefinition, len(rules))
	for id, def := range rules {
		canonical := NormalizeRuleID(id)
		if canonical == id {
			normalized[id] = def
		}
	}
	for id, def := range rules {
		canonical := NormalizeRuleID(id)
		if canonical != id {
			if _, exists := normalized[canonical]; exists {
				continue
			}
		}
		normalized[canonical] = def
	}
	return normalized
}
