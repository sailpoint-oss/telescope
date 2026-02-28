package rulesets

import (
	"fmt"
	"path/filepath"
	"strings"
)

// Resolve fully resolves a ruleset including its extends chain.
func Resolve(rs *RuleSet, basePath string) (*RuleSet, error) {
	resolved := &RuleSet{
		Name:        rs.Name,
		Description: rs.Description,
		Rules:       make(map[string]RuleDefinition),
	}

	if rs.Extends != nil {
		bases, err := resolveExtends(rs.Extends, basePath)
		if err != nil {
			return nil, err
		}
		for _, base := range bases {
			for id, def := range base.Rules {
				resolved.Rules[id] = def
			}
		}
	}

	// Override with this ruleset's rules (higher priority)
	for id, def := range rs.Rules {
		resolved.Rules[id] = def
	}

	return resolved, nil
}

func resolveExtends(extends interface{}, basePath string) ([]*RuleSet, error) {
	var names []string

	switch v := extends.(type) {
	case string:
		names = []string{v}
	case []interface{}:
		for _, item := range v {
			switch inner := item.(type) {
			case string:
				names = append(names, inner)
			case []interface{}:
				if len(inner) > 0 {
					if s, ok := inner[0].(string); ok {
						names = append(names, s)
					}
				}
			}
		}
	}

	var rulesets []*RuleSet
	for _, name := range names {
		rs, err := loadExtend(name, basePath)
		if err != nil {
			return nil, err
		}
		resolved, err := Resolve(rs, basePath)
		if err != nil {
			return nil, err
		}
		rulesets = append(rulesets, resolved)
	}
	return rulesets, nil
}

func loadExtend(name, basePath string) (*RuleSet, error) {
	if strings.HasPrefix(name, "telescope:") {
		rs := GetBuiltin(name)
		if rs == nil {
			return nil, fmt.Errorf("unknown built-in ruleset: %s", name)
		}
		return rs, nil
	}

	if strings.HasPrefix(name, "spectral:") {
		rs := GetSpectralBuiltin(name)
		if rs == nil {
			return nil, fmt.Errorf("unknown Spectral built-in ruleset: %s", name)
		}
		return rs, nil
	}

	// Treat as file path
	path := name
	if !filepath.IsAbs(path) {
		path = filepath.Join(basePath, path)
	}
	return LoadFile(path)
}
