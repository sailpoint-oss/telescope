// Package validation provides additional file validation capabilities beyond
// the built-in OpenAPI structural validation. It allows applying JSON Schema
// validation to arbitrary YAML/JSON files via pattern-based matching.
package validation

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"github.com/LukasParke/gossip/jsonschema"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
)

// ValidationGroup defines a set of file patterns and associated schemas
// for validating non-OpenAPI files.
type ValidationGroup struct {
	Patterns []string               `yaml:"patterns" json:"patterns"`
	Schemas  []SchemaPatternMapping `yaml:"schemas,omitempty" json:"schemas,omitempty"`
}

// SchemaPatternMapping pairs a JSON Schema file with optional pattern overrides.
type SchemaPatternMapping struct {
	Schema   string   `yaml:"schema" json:"schema"`
	Patterns []string `yaml:"patterns,omitempty" json:"patterns,omitempty"`
}

// AdditionalValidator validates files against schemas based on pattern matching.
type AdditionalValidator struct {
	mu         sync.RWMutex
	groups     map[string]ValidationGroup
	schemas    map[string]*jsonschema.CompiledSchema
	rootDir    string
	schemasDir string
	logger     *slog.Logger
}

// NewAdditionalValidator creates a new validator.
func NewAdditionalValidator(logger *slog.Logger) *AdditionalValidator {
	return &AdditionalValidator{
		groups:  make(map[string]ValidationGroup),
		schemas: make(map[string]*jsonschema.CompiledSchema),
		logger:  logger,
	}
}

// Configure sets up validation groups and loads their schemas from disk.
func (v *AdditionalValidator) Configure(rootDir string, groups map[string]ValidationGroup) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	v.rootDir = rootDir
	v.schemasDir = filepath.Join(rootDir, ".telescope", "schemas")
	v.groups = groups

	// Pre-load all referenced schemas
	for name, group := range groups {
		for _, sm := range group.Schemas {
			if _, ok := v.schemas[sm.Schema]; ok {
				continue
			}
			schema, err := v.loadSchema(sm.Schema)
			if err != nil {
				v.logger.Warn("failed to load schema for additional validation",
					"group", name, "schema", sm.Schema, "error", err)
				continue
			}
			v.schemas[sm.Schema] = schema
		}
	}
	return nil
}

func (v *AdditionalValidator) loadSchema(filename string) (*jsonschema.CompiledSchema, error) {
	path := filepath.Join(v.schemasDir, filename)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read schema %s: %w", path, err)
	}
	compiled, err := jsonschema.Load(data)
	if err != nil {
		return nil, fmt.Errorf("compile schema %s: %w", path, err)
	}
	return compiled, nil
}

// MatchesFile returns whether the given file URI matches any additional
// validation group, and if so, returns the associated schema.
func (v *AdditionalValidator) MatchesFile(uri string) (*jsonschema.CompiledSchema, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	relPath := uriToRelPath(uri, v.rootDir)
	if relPath == "" {
		return nil, false
	}

	for _, group := range v.groups {
		if !matchesPatterns(relPath, group.Patterns) {
			continue
		}
		for _, sm := range group.Schemas {
			patterns := sm.Patterns
			if len(patterns) == 0 {
				patterns = group.Patterns
			}
			if matchesPatterns(relPath, patterns) {
				if schema, ok := v.schemas[sm.Schema]; ok {
					return schema, true
				}
			}
		}
	}
	return nil, false
}

// Analyzer returns a treesitter.Analyzer that validates matching files.
func (v *AdditionalValidator) Analyzer() treesitter.Analyzer {
	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if ctx.Document == nil {
				return nil
			}
			uri := string(ctx.Document.URI())
			schema, ok := v.MatchesFile(uri)
			if !ok || schema == nil {
				return nil
			}

			tree := ctx.Tree
			if tree == nil {
				return nil
			}

			result := jsonschema.Validate(tree, schema, jsonschema.ValidateOptions{
				Source:   "additional-validation",
				Severity: protocol.SeverityWarning,
			})
			return result.Diagnostics
		},
	}
}

func matchesPatterns(path string, patterns []string) bool {
	for _, pattern := range patterns {
		matched, err := filepath.Match(pattern, path)
		if err == nil && matched {
			return true
		}
		// Try with double-star glob (simplified)
		if matched, err := doubleStarMatch(pattern, path); err == nil && matched {
			return true
		}
	}
	return false
}

// doubleStarMatch handles ** glob patterns by splitting and matching segments.
func doubleStarMatch(pattern, path string) (bool, error) {
	if pattern == "**" {
		return true, nil
	}

	parts := filepath.SplitList(pattern)
	if len(parts) == 0 {
		return filepath.Match(pattern, path)
	}

	// Simple implementation: replace ** with *
	simplified := filepath.Clean(pattern)
	simplified = filepath.ToSlash(simplified)
	path = filepath.ToSlash(path)

	// Handle the common **/*.yaml pattern
	if len(simplified) > 3 && simplified[:3] == "**/" {
		suffix := simplified[3:]
		base := filepath.Base(path)
		if matched, err := filepath.Match(suffix, base); err == nil && matched {
			return true, nil
		}
		if matched, err := filepath.Match(suffix, path); err == nil && matched {
			return true, nil
		}
	}

	return filepath.Match(simplified, path)
}

func uriToRelPath(uri, rootDir string) string {
	path := uri
	if len(path) > 7 && path[:7] == "file://" {
		path = path[7:]
	}
	rel, err := filepath.Rel(rootDir, path)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}
