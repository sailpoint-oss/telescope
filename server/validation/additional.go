// Package validation provides additional file validation capabilities beyond
// the built-in OpenAPI structural validation. It allows applying JSON Schema
// validation to arbitrary YAML/JSON files via pattern-based matching.
package validation

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
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

// SchemaType identifies the validation engine for a schema file.
type SchemaType string

const (
	SchemaTypeJSON SchemaType = "json-schema"
	SchemaTypeZod  SchemaType = "zod"
)

// DetectSchemaType determines the validation engine from a schema filename.
func DetectSchemaType(filename string) SchemaType {
	ext := strings.ToLower(filepath.Ext(filename))
	if ext == ".ts" || ext == ".mts" {
		return SchemaTypeZod
	}
	return SchemaTypeJSON
}

type matchedSchema struct {
	compiled   *jsonschema.CompiledSchema
	group      string
	file       string
	schemaType SchemaType
	schemaPath string // absolute path to schema file
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

	// Pre-load JSON Schema files (Zod schemas are loaded by the sidecar)
	for name, group := range groups {
		for _, sm := range group.Schemas {
			if _, ok := v.schemas[sm.Schema]; ok {
				continue
			}
			if DetectSchemaType(sm.Schema) != SchemaTypeJSON {
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
	path := resolveSchemaPath(v.rootDir, filename)
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
func (v *AdditionalValidator) MatchesFile(uri string) (*matchedSchema, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	relPath := uriToRelPath(uri, v.rootDir)
	if relPath == "" {
		return nil, false
	}

	for groupName, group := range v.groups {
		if !matchesPatterns(relPath, group.Patterns) {
			continue
		}
		for _, sm := range group.Schemas {
			patterns := sm.Patterns
			if len(patterns) == 0 {
				patterns = group.Patterns
			}
			if matchesPatterns(relPath, patterns) {
				st := DetectSchemaType(sm.Schema)
				schemaPath := resolveSchemaPath(v.rootDir, sm.Schema)
				compiled := v.schemas[sm.Schema] // may be nil for Zod schemas
				return &matchedSchema{
					compiled:   compiled,
					group:      groupName,
					file:       sm.Schema,
					schemaType: st,
					schemaPath: schemaPath,
				}, true
			}
		}
	}
	return nil, false
}

// SchemaMatch holds the information needed to route validation to the sidecar.
type SchemaMatch struct {
	GroupName  string
	SchemaPath string
	SchemaType SchemaType
}

// MatchesFileForSidecar returns schema match info for routing to the Bun sidecar.
func (v *AdditionalValidator) MatchesFileForSidecar(uri string) ([]SchemaMatch, bool) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	relPath := uriToRelPath(uri, v.rootDir)
	if relPath == "" {
		return nil, false
	}

	var matches []SchemaMatch
	for groupName, group := range v.groups {
		if !matchesPatterns(relPath, group.Patterns) {
			continue
		}
		for _, sm := range group.Schemas {
			patterns := sm.Patterns
			if len(patterns) == 0 {
				patterns = group.Patterns
			}
			if matchesPatterns(relPath, patterns) {
				matches = append(matches, SchemaMatch{
					GroupName:  groupName,
					SchemaPath: resolveSchemaPath(v.rootDir, sm.Schema),
					SchemaType: DetectSchemaType(sm.Schema),
				})
			}
		}
	}
	return matches, len(matches) > 0
}

// Analyzer returns a treesitter.Analyzer that validates matching files using
// Go-side JSON Schema validation. This is the fallback when the Bun sidecar
// is unavailable. Zod schemas are skipped since they require the sidecar.
func (v *AdditionalValidator) Analyzer() treesitter.Analyzer {
	return treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			if ctx.Document == nil {
				return nil
			}
			uri := string(ctx.Document.URI())
			match, ok := v.MatchesFile(uri)
			if !ok || match == nil {
				return nil
			}
			// Zod schemas require the sidecar; skip in Go-only mode
			if match.schemaType == SchemaTypeZod {
				return nil
			}
			if match.compiled == nil {
				return nil
			}

			tree := ctx.Tree
			if tree == nil {
				return nil
			}

			result := jsonschema.Validate(tree, match.compiled, jsonschema.ValidateOptions{
				Source:   "additional-validation",
				Code:     "json-schema",
				Severity: protocol.SeverityError,
			})
			return enrichAdditionalDiagnostics(result.Diagnostics, match.group, match.file)
		},
	}
}

func enrichAdditionalDiagnostics(diags []protocol.Diagnostic, groupName, schemaFile string) []protocol.Diagnostic {
	if len(diags) == 0 {
		return diags
	}
	enriched := make([]protocol.Diagnostic, 0, len(diags))
	prefix := fmt.Sprintf("[schema:%s group:%s] ", schemaFile, groupName)
	for _, d := range diags {
		diag := d
		diag.Source = "json-schema"
		diag.Code = "json-schema"
		if diag.Message != "" {
			diag.Message = prefix + diag.Message
		} else {
			diag.Message = prefix + "Schema validation failed"
		}
		enriched = append(enriched, diag)
	}
	return enriched
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

func resolveSchemaPath(rootDir, filename string) string {
	filename = strings.TrimSpace(filename)
	if filename == "" {
		return ""
	}
	if filepath.IsAbs(filename) {
		return filepath.Clean(filename)
	}
	clean := filepath.Clean(filepath.FromSlash(filename))
	if strings.HasPrefix(filepath.ToSlash(clean), ".telescope/") {
		return filepath.Join(rootDir, clean)
	}
	if strings.Contains(filepath.ToSlash(clean), "/") {
		return filepath.Join(rootDir, ".telescope", clean)
	}
	return filepath.Join(rootDir, ".telescope", "schemas", clean)
}

// doubleStarMatch handles ** glob patterns by expanding them to match any path segment.
func doubleStarMatch(pattern, path string) (bool, error) {
	if !strings.Contains(pattern, "**") {
		return filepath.Match(pattern, path)
	}
	parts := strings.SplitN(pattern, "**", 2)
	prefix := parts[0]
	suffix := strings.TrimPrefix(parts[1], "/")
	if prefix != "" {
		if !strings.HasPrefix(path, prefix) {
			return false, nil
		}
		path = path[len(prefix):]
	}
	if suffix == "" {
		return true, nil
	}
	for i := 0; i <= len(path); i++ {
		if matched, _ := filepath.Match(suffix, path[i:]); matched {
			return true, nil
		}
	}
	return false, nil
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
	rel = filepath.ToSlash(rel)
	if strings.HasPrefix(rel, "../") || rel == ".." {
		return ""
	}
	return rel
}
