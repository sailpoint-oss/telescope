package validation

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestEnrichAdditionalDiagnostics_AddsPrefix(t *testing.T) {
	diags := []protocol.Diagnostic{
		{Message: "required property missing", Source: "original", Code: "orig-code"},
		{Message: "wrong type", Source: "original"},
	}

	result := enrichAdditionalDiagnostics(diags, "my-group", "schema.json")

	if len(result) != 2 {
		t.Fatalf("expected 2 diagnostics, got %d", len(result))
	}
	for _, d := range result {
		if d.Source != "json-schema" {
			t.Errorf("expected source 'json-schema', got %q", d.Source)
		}
		if d.Code != "json-schema" {
			t.Errorf("expected code 'json-schema', got %q", d.Code)
		}
		if !strings.Contains(d.Message, "[schema:schema.json group:my-group]") {
			t.Errorf("expected enriched prefix in message, got %q", d.Message)
		}
	}
}

func TestEnrichAdditionalDiagnostics_EmptyMessage(t *testing.T) {
	diags := []protocol.Diagnostic{
		{Message: ""},
	}
	result := enrichAdditionalDiagnostics(diags, "grp", "s.json")
	if !strings.Contains(result[0].Message, "Schema validation failed") {
		t.Errorf("expected fallback message, got %q", result[0].Message)
	}
}

func TestEnrichAdditionalDiagnostics_Empty(t *testing.T) {
	result := enrichAdditionalDiagnostics(nil, "grp", "s.json")
	if len(result) != 0 {
		t.Errorf("expected empty, got %d diagnostics", len(result))
	}
}

func TestDetectSchemaType_JSONSchema(t *testing.T) {
	tests := []struct {
		filename string
		want     SchemaType
	}{
		{"schema.json", SchemaTypeJSON},
		{"schema.yaml", SchemaTypeJSON},
		{"schema.yml", SchemaTypeJSON},
		{"custom.schema", SchemaTypeJSON},
	}
	for _, tt := range tests {
		got := DetectSchemaType(tt.filename)
		if got != tt.want {
			t.Errorf("DetectSchemaType(%q) = %q, want %q", tt.filename, got, tt.want)
		}
	}
}

func TestDetectSchemaType_Zod(t *testing.T) {
	tests := []struct {
		filename string
		want     SchemaType
	}{
		{"schema.ts", SchemaTypeZod},
		{"schema.mts", SchemaTypeZod},
		{"SCHEMA.TS", SchemaTypeZod},
		{"SCHEMA.MTS", SchemaTypeZod},
	}
	for _, tt := range tests {
		got := DetectSchemaType(tt.filename)
		if got != tt.want {
			t.Errorf("DetectSchemaType(%q) = %q, want %q", tt.filename, got, tt.want)
		}
	}
}

func TestMatchesPatterns_SimpleGlob(t *testing.T) {
	if !matchesPatterns("config.yaml", []string{"*.yaml"}) {
		t.Error("expected config.yaml to match *.yaml")
	}
	if matchesPatterns("config.json", []string{"*.yaml"}) {
		t.Error("expected config.json NOT to match *.yaml")
	}
}

func TestMatchesPatterns_DoubleStarGlob(t *testing.T) {
	if !matchesPatterns("specs/v2/openapi.yaml", []string{"specs/**/*.yaml"}) {
		t.Error("expected specs/v2/openapi.yaml to match specs/**/*.yaml")
	}
	if matchesPatterns("other/openapi.yaml", []string{"specs/**/*.yaml"}) {
		t.Error("expected other/openapi.yaml NOT to match specs/**/*.yaml")
	}
}

func TestMatchesPatterns_NoPatterns(t *testing.T) {
	if matchesPatterns("anything.yaml", nil) {
		t.Error("nil patterns should match nothing")
	}
}

func TestDoubleStarMatch_NoDoubleStar(t *testing.T) {
	matched, err := doubleStarMatch("*.yaml", "test.yaml")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !matched {
		t.Error("expected match for *.yaml against test.yaml")
	}
}

func TestDoubleStarMatch_PrefixOnly(t *testing.T) {
	matched, _ := doubleStarMatch("src/**", "src/foo/bar.go")
	if !matched {
		t.Error("expected src/** to match src/foo/bar.go")
	}
}

func TestDoubleStarMatch_PrefixAndSuffix(t *testing.T) {
	matched, _ := doubleStarMatch("src/**/*.yaml", "src/api/spec.yaml")
	if !matched {
		t.Error("expected src/**/*.yaml to match src/api/spec.yaml")
	}
}

func TestDoubleStarMatch_NoPrefix(t *testing.T) {
	matched, _ := doubleStarMatch("**/*.json", "deep/nested/file.json")
	if !matched {
		t.Error("expected **/*.json to match deep/nested/file.json")
	}
}

func TestUriToRelPath_FileURI(t *testing.T) {
	rootDir := "/workspace/project"
	uri := "file:///workspace/project/specs/api.yaml"
	got := uriToRelPath(uri, rootDir)
	if got != "specs/api.yaml" {
		t.Errorf("expected 'specs/api.yaml', got %q", got)
	}
}

func TestUriToRelPath_PlainPath(t *testing.T) {
	rootDir := "/workspace/project"
	path := "/workspace/project/config.yaml"
	got := uriToRelPath(path, rootDir)
	if got != "config.yaml" {
		t.Errorf("expected 'config.yaml', got %q", got)
	}
}

func TestUriToRelPath_OutsideRoot(t *testing.T) {
	rootDir := "/workspace/project"
	uri := "file:///other/place/file.yaml"
	got := uriToRelPath(uri, rootDir)
	if got != "" {
		t.Errorf("expected empty string for outside path, got %q", got)
	}
}

func TestMatchesFile_NoGroups(t *testing.T) {
	v := NewAdditionalValidator(nil)
	_, ok := v.MatchesFile("file:///test.yaml")
	if ok {
		t.Error("expected no match with empty groups")
	}
}

func TestMatchesFile_MatchingGroup(t *testing.T) {
	v := NewAdditionalValidator(nil)
	v.rootDir = "/workspace"
	v.schemasDir = filepath.Join("/workspace", ".telescope", "schemas")
	v.groups = map[string]ValidationGroup{
		"configs": {
			Patterns: []string{"*.yaml"},
			Schemas:  []SchemaPatternMapping{{Schema: "config-schema.json"}},
		},
	}

	match, ok := v.MatchesFile("file:///workspace/settings.yaml")
	if !ok {
		t.Fatal("expected match for settings.yaml")
	}
	if match.group != "configs" {
		t.Errorf("expected group 'configs', got %q", match.group)
	}
	if match.schemaType != SchemaTypeJSON {
		t.Errorf("expected JSON schema type, got %q", match.schemaType)
	}
}

func TestMatchesFileForSidecar_MultipleSchemas(t *testing.T) {
	v := NewAdditionalValidator(nil)
	v.rootDir = "/workspace"
	v.schemasDir = filepath.Join("/workspace", ".telescope", "schemas")
	v.groups = map[string]ValidationGroup{
		"specs": {
			Patterns: []string{"*.yaml"},
			Schemas: []SchemaPatternMapping{
				{Schema: "spec.json"},
				{Schema: "spec.ts"},
			},
		},
	}

	matches, ok := v.MatchesFileForSidecar("file:///workspace/api.yaml")
	if !ok {
		t.Fatal("expected sidecar matches")
	}
	if len(matches) != 2 {
		t.Fatalf("expected 2 matches, got %d", len(matches))
	}

	hasJSON, hasZod := false, false
	for _, m := range matches {
		if m.SchemaType == SchemaTypeJSON {
			hasJSON = true
		}
		if m.SchemaType == SchemaTypeZod {
			hasZod = true
		}
	}
	if !hasJSON || !hasZod {
		t.Error("expected both JSON and Zod schema types in matches")
	}
}

func TestMatchesFileForSidecar_NoMatch(t *testing.T) {
	v := NewAdditionalValidator(nil)
	v.rootDir = "/workspace"
	v.schemasDir = filepath.Join("/workspace", ".telescope", "schemas")
	v.groups = map[string]ValidationGroup{
		"specs": {
			Patterns: []string{"specs/*.yaml"},
			Schemas:  []SchemaPatternMapping{{Schema: "s.json"}},
		},
	}

	_, ok := v.MatchesFileForSidecar("file:///workspace/other/file.yaml")
	if ok {
		t.Error("expected no match for file outside pattern")
	}
}

func TestSchemaType_Constants(t *testing.T) {
	if SchemaTypeJSON != "json-schema" {
		t.Errorf("SchemaTypeJSON = %q, want %q", SchemaTypeJSON, "json-schema")
	}
	if SchemaTypeZod != "zod" {
		t.Errorf("SchemaTypeZod = %q, want %q", SchemaTypeZod, "zod")
	}
}
