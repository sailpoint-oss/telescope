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
