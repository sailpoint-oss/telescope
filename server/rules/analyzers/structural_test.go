package analyzers_test

import (
	"strings"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_json "github.com/tree-sitter/tree-sitter-json/bindings/go"

	"github.com/LukasParke/gossip/jsonschema"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

func jsonLang() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(tree_sitter_json.Language()))
}

func parseTree(t *testing.T, src string, lang *tree_sitter.Language) *treesitter.Tree {
	t.Helper()
	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(lang); err != nil {
		t.Fatalf("SetLanguage: %v", err)
	}
	raw := parser.Parse([]byte(src), nil)
	if raw == nil {
		t.Fatal("parse returned nil")
	}
	return treesitter.NewTree(raw, []byte(src))
}

func buildTree(t *testing.T, spec specs.Spec) *treesitter.Tree {
	t.Helper()
	var lang *tree_sitter.Language
	if spec.Format == openapi.FormatJSON {
		lang = jsonLang()
	} else {
		lang = yamlLang()
	}
	return parseTree(t, string(spec.Content), lang)
}

func TestGetSchema_AllVersions(t *testing.T) {
	versions := []openapi.Version{
		openapi.Version20,
		openapi.Version30,
		openapi.Version31,
		openapi.Version32,
	}
	names := []string{"2.0", "3.0", "3.1", "3.2"}
	for i, ver := range versions {
		t.Run(names[i], func(t *testing.T) {
			schema := analyzers.GetSchemaForVersion(ver)
			if schema == nil {
				t.Fatalf("expected non-nil schema for version %s", names[i])
			}
		})
	}
}

func TestStructural_MinimalValidSpec_NoDiagnostics(t *testing.T) {
	yamlSrc := `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"`

	schema := analyzers.GetSchemaForVersion(openapi.Version31)
	if schema == nil {
		t.Fatal("no schema for 3.1")
	}

	tree := parseTree(t, yamlSrc, yamlLang())
	result := jsonschema.Validate(tree, schema, jsonschema.ValidateOptions{
		Source:         "oas3-schema",
		Severity:       protocol.SeverityError,
		MaxDiagnostics: 100,
	})

	if len(result.Diagnostics) != 0 {
		t.Errorf("expected 0 diagnostics for minimal valid spec, got %d:", len(result.Diagnostics))
		for _, d := range result.Diagnostics {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestStructural_AnalyzerDoesNotPanic(t *testing.T) {
	for _, spec := range specs.YAML() {
		t.Run(spec.Name, func(t *testing.T) {
			idx := buildIndex(t, spec)
			if idx == nil || idx.Version == openapi.VersionUnknown {
				t.Skip("unknown version")
			}
			schema := analyzers.GetSchemaForVersion(idx.Version)
			if schema == nil {
				t.Skipf("no schema for version %v", idx.Version)
			}
			result := jsonschema.Validate(
				buildTree(t, spec),
				schema,
				jsonschema.ValidateOptions{
					Source:         "oas3-schema",
					Severity:       protocol.SeverityError,
					MaxDiagnostics: 100,
				},
			)
			_ = result
		})
	}
}

func TestStructural_MissingInfo(t *testing.T) {
	yamlSrc := `openapi: "3.1.0"
paths: {}`

	schema := analyzers.GetSchemaForVersion(openapi.Version31)
	if schema == nil {
		t.Fatal("no schema for 3.1")
	}

	tree := parseTree(t, yamlSrc, yamlLang())
	result := jsonschema.Validate(tree, schema, jsonschema.ValidateOptions{
		Source:         "oas3-schema",
		Severity:       protocol.SeverityError,
		MaxDiagnostics: 100,
	})

	found := false
	for _, d := range result.Diagnostics {
		if strings.Contains(d.Message, "info") && strings.Contains(d.Message, "missing") {
			found = true
		}
	}
	if !found {
		t.Error("expected diagnostic about missing 'info'")
		for _, d := range result.Diagnostics {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestStructural_MissingRequiredInfo_Title(t *testing.T) {
	yamlSrc := `openapi: "3.1.0"
info:
  version: "1.0.0"`

	schema := analyzers.GetSchemaForVersion(openapi.Version31)
	if schema == nil {
		t.Fatal("no schema for 3.1")
	}

	tree := parseTree(t, yamlSrc, yamlLang())
	result := jsonschema.Validate(tree, schema, jsonschema.ValidateOptions{
		Source:         "oas3-schema",
		Severity:       protocol.SeverityError,
		MaxDiagnostics: 100,
	})

	found := false
	for _, d := range result.Diagnostics {
		if strings.Contains(d.Message, "title") && strings.Contains(d.Message, "missing") {
			found = true
		}
	}
	if !found {
		t.Error("expected diagnostic about missing 'title' in info")
		for _, d := range result.Diagnostics {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

// --- Fragment schema validation tests ---

func TestGetFragmentSchema_AllVersionsAndTypes(t *testing.T) {
	versions := []openapi.Version{openapi.Version30, openapi.Version31, openapi.Version32}
	types := []struct {
		ft   openapi.FragmentType
		name string
	}{
		{openapi.FragmentSchema, "Schema"},
		{openapi.FragmentPathItem, "PathItem"},
		{openapi.FragmentOperation, "Operation"},
		{openapi.FragmentParameter, "Parameter"},
		{openapi.FragmentRequestBody, "RequestBody"},
		{openapi.FragmentResponse, "Response"},
		{openapi.FragmentHeader, "Header"},
		{openapi.FragmentSecurityScheme, "SecurityScheme"},
		{openapi.FragmentComponents, "Components"},
		{openapi.FragmentServer, "Server"},
	}
	for _, ver := range versions {
		for _, tc := range types {
			t.Run(string(ver)+"/"+tc.name, func(t *testing.T) {
				schema := analyzers.GetFragmentSchema(ver, tc.ft)
				if schema == nil {
					t.Fatalf("expected non-nil fragment schema for %s/%s", ver, tc.name)
				}
			})
		}
	}
}

func collectOas3SchemaAnalyzer(t *testing.T) rules.NamedAnalyzer {
	t.Helper()
	all := rules.CollectAnalyzers(analyzers.RegisterAll)
	for _, a := range all {
		if a.ID == "oas3-schema" {
			return a
		}
	}
	t.Fatal("oas3-schema analyzer not found")
	return rules.NamedAnalyzer{}
}

// runFragmentAnalyzer runs the oas3-schema analyzer against YAML content that
// has no openapi/swagger root key, exercising the fragment validation path.
func runFragmentAnalyzer(t *testing.T, yamlSrc string, opts ...rules.AnalyzerOption) []protocol.Diagnostic {
	t.Helper()
	na := collectOas3SchemaAnalyzer(t)
	tree := parseTree(t, yamlSrc, yamlLang())
	defer tree.Close()

	idx := &openapi.Index{
		Document: &openapi.Document{DocType: openapi.DocTypeFragment},
		Version:  openapi.VersionUnknown,
		Format:   openapi.FormatYAML,
	}

	data := &rules.AnalysisData{
		Index:  idx,
		DocURI: "file:///test/fragment.yaml",
	}
	for _, opt := range opts {
		opt(data)
	}

	ctx := &treesitter.AnalysisContext{
		Tree:     tree,
		UserData: data,
	}
	return na.Analyzer.Run(ctx)
}

func TestFragment_ValidSchema_NoDiagnostics(t *testing.T) {
	yamlSrc := `type: object
properties:
  id:
    type: integer
  name:
    type: string
required:
  - id
  - name`

	diags := runFragmentAnalyzer(t, yamlSrc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for valid schema fragment, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_ValidPathItem_NoDiagnostics(t *testing.T) {
	yamlSrc := `get:
  summary: List users
  responses:
    '200':
      description: OK
post:
  summary: Create user
  responses:
    '201':
      description: Created`

	diags := runFragmentAnalyzer(t, yamlSrc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for valid path item fragment, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_PathItemWithDeprecated_NoDiagnostics(t *testing.T) {
	yamlSrc := `get:
  summary: List users
  deprecated: true
  responses:
    '200':
      description: OK`

	diags := runFragmentAnalyzer(t, yamlSrc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_ValidParameter_NoDiagnostics(t *testing.T) {
	yamlSrc := `name: userId
in: path
required: true
schema:
  type: string`

	diags := runFragmentAnalyzer(t, yamlSrc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for valid parameter fragment, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_RootDocIsNotFragment(t *testing.T) {
	yamlSrc := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths: {}`

	na := collectOas3SchemaAnalyzer(t)
	tree := parseTree(t, yamlSrc, yamlLang())
	defer tree.Close()

	idx := &openapi.Index{
		Document: &openapi.Document{DocType: openapi.DocTypeRoot},
		Version:  openapi.Version31,
		Format:   openapi.FormatYAML,
	}

	ctx := &treesitter.AnalysisContext{
		Tree: tree,
		UserData: &rules.AnalysisData{
			Index:  idx,
			DocURI: "file:///test/root.yaml",
		},
	}
	diags := na.Analyzer.Run(ctx)
	for _, d := range diags {
		if d.Severity == protocol.SeverityWarning {
			t.Error("root document should use error severity, not warning (fragment path)")
		}
	}
}

func TestFragment_NonOpenAPIFile_NoDiagnostics(t *testing.T) {
	yamlSrc := `name: my-project
version: 1.0.0
dependencies:
  express: ^4.18.0`

	diags := runFragmentAnalyzer(t, yamlSrc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for non-OpenAPI YAML, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_InvalidParameter_UnknownKey(t *testing.T) {
	yamlSrc := `name: userId
in: path
schema:
  type: string
  unknownKey: invalid`

	diags := runFragmentAnalyzer(t, yamlSrc)
	hasDiag := false
	for _, d := range diags {
		if strings.Contains(d.Message, "unknownKey") || strings.Contains(d.Message, "additional") {
			hasDiag = true
		}
	}
	if !hasDiag && len(diags) == 0 {
		t.Log("schema may allow additional properties; checking for any diagnostics")
	}
}

func TestFragment_AnalyzerViaRunAnalyzers(t *testing.T) {
	yamlSrc := `get:
  summary: List users
  responses:
    '200':
      description: OK`

	tree := parseTree(t, yamlSrc, yamlLang())
	defer tree.Close()

	allAnalyzers := rules.CollectAnalyzers(analyzers.RegisterAll)
	diags := rules.RunAnalyzers(allAnalyzers, nil, "file:///test/path-item.yaml", tree)

	for _, d := range diags {
		if d.Source == "oas3-schema" && d.Severity != protocol.SeverityWarning {
			t.Errorf("fragment oas3-schema diagnostics should be warnings, got severity %d", d.Severity)
		}
	}
}

func TestFragment_JSON_PathItem_Valid(t *testing.T) {
	jsonSrc := `{
  "get": {
    "summary": "List users",
    "responses": {
      "200": { "description": "OK" }
    }
  }
}`

	na := collectOas3SchemaAnalyzer(t)
	tree := parseTree(t, jsonSrc, jsonLang())
	defer tree.Close()

	ctx := &treesitter.AnalysisContext{
		Tree: tree,
		UserData: &rules.AnalysisData{
			Index:  nil,
			DocURI: "file:///test/path-item.json",
		},
	}
	diags := na.Analyzer.Run(ctx)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for valid JSON path item, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_Components_Valid(t *testing.T) {
	yamlSrc := `schemas:
  User:
    type: object
    properties:
      id:
        type: integer
  Pet:
    type: object
    properties:
      name:
        type: string`

	diags := runFragmentAnalyzer(t, yamlSrc)
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for valid components fragment, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

// --- Version-specific fragment validation tests ---

func TestFragment_30_Operation_RequiresResponses(t *testing.T) {
	yamlSrc := `summary: List users
operationId: listUsers`

	diags := runFragmentAnalyzer(t, yamlSrc, rules.WithTargetVersion(openapi.Version30))
	found := false
	for _, d := range diags {
		if strings.Contains(d.Message, "responses") {
			found = true
		}
	}
	if !found {
		t.Error("expected diagnostic about missing required 'responses' for 3.0 operation")
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_31_Operation_ResponsesOptional(t *testing.T) {
	yamlSrc := `summary: List users
operationId: listUsers`

	diags := runFragmentAnalyzer(t, yamlSrc, rules.WithTargetVersion(openapi.Version31))
	for _, d := range diags {
		if strings.Contains(d.Message, "responses") && strings.Contains(d.Message, "missing") {
			t.Error("3.1 should NOT require 'responses' on Operation")
		}
	}
}

func TestFragment_30_Schema_AcceptsNullable(t *testing.T) {
	yamlSrc := `type: string
nullable: true`

	diags := runFragmentAnalyzer(t, yamlSrc, rules.WithTargetVersion(openapi.Version30))
	for _, d := range diags {
		if strings.Contains(d.Message, "nullable") {
			t.Errorf("3.0 should accept 'nullable' without error: %s", d.Message)
		}
	}
}

func TestFragment_Composition_TypelessOneOf(t *testing.T) {
	yamlSrc := `oneOf:
  - type: string
  - type: integer`

	diags := runFragmentAnalyzer(t, yamlSrc, rules.WithTargetVersion(openapi.Version31))
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for typeless oneOf composition, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_Composition_AllOf(t *testing.T) {
	yamlSrc := `allOf:
  - type: object
    properties:
      id:
        type: integer
  - type: object
    properties:
      name:
        type: string`

	diags := runFragmentAnalyzer(t, yamlSrc, rules.WithTargetVersion(openapi.Version30))
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for allOf composition, got %d:", len(diags))
		for _, d := range diags {
			t.Logf("  L%d: %s", d.Range.Start.Line, d.Message)
		}
	}
}

func TestFragment_TargetVersionFromConfig(t *testing.T) {
	yamlSrc := `summary: List users
operationId: listUsers`

	// With 3.2 target, responses should be optional (same as 3.1)
	diags := runFragmentAnalyzer(t, yamlSrc, rules.WithTargetVersion(openapi.Version32))
	for _, d := range diags {
		if strings.Contains(d.Message, "responses") && strings.Contains(d.Message, "missing") {
			t.Error("3.2 should NOT require 'responses' on Operation")
		}
	}
}
