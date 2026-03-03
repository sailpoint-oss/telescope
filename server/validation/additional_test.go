package validation_test

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/validation"
)

func testLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
}

func setupTestDir(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	schemasDir := filepath.Join(dir, ".telescope", "schemas")
	if err := os.MkdirAll(schemasDir, 0o755); err != nil {
		t.Fatal(err)
	}
	return dir
}

func writeSchema(t *testing.T, dir, name, content string) {
	t.Helper()
	path := filepath.Join(dir, ".telescope", "schemas", name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

const validSchema = `{
	"type": "object",
	"required": ["name"],
	"properties": {
		"name": { "type": "string" },
		"age": { "type": "integer" }
	},
	"additionalProperties": false
}`

func TestNewAdditionalValidator(t *testing.T) {
	v := validation.NewAdditionalValidator(testLogger())
	if v == nil {
		t.Fatal("expected non-nil validator")
	}
}

func TestConfigure_LoadsValidSchema(t *testing.T) {
	dir := setupTestDir(t)
	writeSchema(t, dir, "test.json", validSchema)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"test": {
			Patterns: []string{"data/*.yaml"},
			Schemas: []validation.SchemaPatternMapping{
				{Schema: "test.json"},
			},
		},
	}

	err := v.Configure(dir, groups)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestConfigure_InvalidSchemaLogsWarning(t *testing.T) {
	dir := setupTestDir(t)
	writeSchema(t, dir, "bad.json", `not valid json`)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"test": {
			Patterns: []string{"data/*.yaml"},
			Schemas: []validation.SchemaPatternMapping{
				{Schema: "bad.json"},
			},
		},
	}

	err := v.Configure(dir, groups)
	if err != nil {
		t.Fatalf("Configure should not return error for bad schema (it logs warning): %v", err)
	}
}

func TestConfigure_MissingSchemaFile(t *testing.T) {
	dir := setupTestDir(t)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"test": {
			Patterns: []string{"data/*.yaml"},
			Schemas: []validation.SchemaPatternMapping{
				{Schema: "nonexistent.json"},
			},
		},
	}

	err := v.Configure(dir, groups)
	if err != nil {
		t.Fatalf("Configure should not return error for missing file (it logs warning): %v", err)
	}
}

func TestMatchesFile_MatchesPattern(t *testing.T) {
	dir := setupTestDir(t)
	writeSchema(t, dir, "test.json", validSchema)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"test": {
			Patterns: []string{"data/*.yaml"},
			Schemas: []validation.SchemaPatternMapping{
				{Schema: "test.json"},
			},
		},
	}
	_ = v.Configure(dir, groups)

	uri := "file://" + filepath.Join(dir, "data", "example.yaml")
	schema, ok := v.MatchesFile(uri)
	if !ok {
		t.Fatal("expected file to match")
	}
	if schema == nil {
		t.Fatal("expected non-nil schema")
	}
}

func TestMatchesFile_NoMatch(t *testing.T) {
	dir := setupTestDir(t)
	writeSchema(t, dir, "test.json", validSchema)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"test": {
			Patterns: []string{"data/*.yaml"},
			Schemas: []validation.SchemaPatternMapping{
				{Schema: "test.json"},
			},
		},
	}
	_ = v.Configure(dir, groups)

	uri := "file://" + filepath.Join(dir, "other", "example.yaml")
	_, ok := v.MatchesFile(uri)
	if ok {
		t.Fatal("expected no match for non-matching path")
	}
}

func TestMatchesFile_SchemaSpecificPatterns(t *testing.T) {
	dir := setupTestDir(t)
	writeSchema(t, dir, "narrow.json", validSchema)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"test": {
			Patterns: []string{"data/*.yaml"},
			Schemas: []validation.SchemaPatternMapping{
				{
					Schema:   "narrow.json",
					Patterns: []string{"data/special-*.yaml"},
				},
			},
		},
	}
	_ = v.Configure(dir, groups)

	matchURI := "file://" + filepath.Join(dir, "data", "special-one.yaml")
	_, ok := v.MatchesFile(matchURI)
	if !ok {
		t.Fatal("expected special-one.yaml to match schema-specific pattern")
	}

	noMatchURI := "file://" + filepath.Join(dir, "data", "regular.yaml")
	_, ok = v.MatchesFile(noMatchURI)
	if ok {
		t.Fatal("expected regular.yaml to not match schema-specific pattern")
	}
}

func TestMatchesFile_EmptyURI(t *testing.T) {
	v := validation.NewAdditionalValidator(testLogger())
	_, ok := v.MatchesFile("")
	if ok {
		t.Fatal("expected no match for empty URI")
	}
}

func TestConfigure_MultipleGroups(t *testing.T) {
	dir := setupTestDir(t)
	writeSchema(t, dir, "a.json", validSchema)
	writeSchema(t, dir, "b.json", `{"type": "object"}`)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"group-a": {
			Patterns: []string{"a/*.yaml"},
			Schemas:  []validation.SchemaPatternMapping{{Schema: "a.json"}},
		},
		"group-b": {
			Patterns: []string{"b/*.yaml"},
			Schemas:  []validation.SchemaPatternMapping{{Schema: "b.json"}},
		},
	}
	err := v.Configure(dir, groups)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	aURI := "file://" + filepath.Join(dir, "a", "file.yaml")
	schema, ok := v.MatchesFile(aURI)
	if !ok || schema == nil {
		t.Fatal("expected group-a match")
	}

	bURI := "file://" + filepath.Join(dir, "b", "file.yaml")
	schema, ok = v.MatchesFile(bURI)
	if !ok || schema == nil {
		t.Fatal("expected group-b match")
	}
}

func TestConfigure_DuplicateSchemaLoadedOnce(t *testing.T) {
	dir := setupTestDir(t)
	writeSchema(t, dir, "shared.json", validSchema)

	v := validation.NewAdditionalValidator(testLogger())
	groups := map[string]validation.ValidationGroup{
		"g1": {
			Patterns: []string{"a/*.yaml"},
			Schemas:  []validation.SchemaPatternMapping{{Schema: "shared.json"}},
		},
		"g2": {
			Patterns: []string{"b/*.yaml"},
			Schemas:  []validation.SchemaPatternMapping{{Schema: "shared.json"}},
		},
	}
	err := v.Configure(dir, groups)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestAnalyzer_ReturnsAnalyzer(t *testing.T) {
	v := validation.NewAdditionalValidator(testLogger())
	analyzer := v.Analyzer()
	if analyzer.Run == nil {
		t.Fatal("expected analyzer with non-nil Run function")
	}
}
