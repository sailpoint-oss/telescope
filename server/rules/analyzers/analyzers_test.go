package analyzers_test

import (
	"strings"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

func yamlLang() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
}

func buildIndex(t *testing.T, spec specs.Spec) *openapi.Index {
	t.Helper()
	store := document.NewStore()
	lang := yamlLang()
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	uri := protocol.DocumentURI(spec.URI())
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       string(spec.Content),
		},
	})

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("nil tree")
	}
	doc := store.Get(uri)
	if doc == nil {
		t.Fatal("nil doc")
	}
	return openapi.BuildIndex(tree, doc)
}

func runRule(t *testing.T, idx *openapi.Index, ruleID string, severity protocol.DiagnosticSeverity, v rules.Visitors) []protocol.Diagnostic {
	t.Helper()
	r := rules.NewReporter(ruleID, severity)
	rules.Walk(idx, v, r)
	return r.Diagnostics()
}

func TestNaming_SchemaNameCapital(t *testing.T) {
	spec := specs.ByName("test-valid")
	if spec.Name == "" {
		t.Skip("test-valid spec not found")
	}
	idx := buildIndex(t, spec)
	diags := runRule(t, idx, "schema-name-capital", protocol.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && len(name) > 0 && name[0] >= 'a' && name[0] <= 'z' {
				r.At(schema.NameLoc, "Schema name '%s' should start with uppercase", name)
			}
		},
	})
	for _, d := range diags {
		if d.Code != "schema-name-capital" {
			t.Errorf("unexpected code %q", d.Code)
		}
	}
}

func TestNaming_OperationIDUnique(t *testing.T) {
	spec := specs.ByName("test-duplicate-operation-ids")
	if spec.Name == "" {
		t.Skip("test-duplicate-operation-ids spec not found")
	}
	idx := buildIndex(t, spec)
	seen := make(map[string]bool)
	var dupes int
	diags := runRule(t, idx, "operation-operationId-unique", protocol.SeverityError, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if op.OperationID == "" {
				return
			}
			if seen[op.OperationID] {
				r.At(op.OperationIDLoc, "Duplicate operationId '%s'", op.OperationID)
				dupes++
			}
			seen[op.OperationID] = true
		},
	})
	if dupes == 0 {
		t.Error("expected duplicate operationId diagnostics in test-duplicate-operation-ids spec")
	}
	if len(diags) != dupes {
		t.Errorf("diag count mismatch: got %d diagnostics, expected %d", len(diags), dupes)
	}
}

func TestExtended_OperationTags(t *testing.T) {
	spec := specs.ByName("test-warnings")
	if spec.Name == "" {
		t.Skip("test-warnings spec not found")
	}
	idx := buildIndex(t, spec)
	diags := runRule(t, idx, "operation-tags", protocol.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if len(op.Tags) == 0 {
				r.At(op.Loc, "Operation %s %s should have at least one tag", method, path)
			}
		},
	})
	_ = diags // coverage test: ensure rule runs without panic
}

func TestExtended_OperationDescription(t *testing.T) {
	spec := specs.ByName("test-warnings")
	if spec.Name == "" {
		t.Skip("test-warnings spec not found")
	}
	idx := buildIndex(t, spec)
	diags := runRule(t, idx, "operation-description", protocol.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if op.Description.Text == "" {
				r.At(op.Loc, "Operation %s %s should have a description", method, path)
			}
		},
	})
	_ = diags
}

func TestSecurity_SecuritySchemesDefined(t *testing.T) {
	spec := specs.ByName("test-errors")
	if spec.Name == "" {
		t.Skip("test-errors spec not found")
	}
	idx := buildIndex(t, spec)
	diags := runRule(t, idx, "security-schemes-defined", protocol.SeverityError, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			allReqs := append([]openapi.SecurityRequirement{}, idx.Document.Security...)
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					allReqs = append(allReqs, mo.Operation.Security...)
				}
			}
			for _, req := range allReqs {
				for _, entry := range req.Entries {
					if _, ok := idx.SecuritySchemes[entry.Name]; !ok {
						loc := entry.NameLoc
						if loc.Node == nil {
							loc = idx.Document.Loc
						}
						r.At(loc, "Security requirement references undefined scheme '%s'", entry.Name)
					}
				}
			}
		},
	})
	_ = diags
}

func TestPaths_KebabCase(t *testing.T) {
	spec := specs.ByName("test-warnings")
	if spec.Name == "" {
		t.Skip("test-warnings spec not found")
	}
	idx := buildIndex(t, spec)
	diags := runRule(t, idx, "kebab-case", protocol.SeverityWarning, rules.Visitors{
		Path: func(path string, item *openapi.PathItem, r *rules.Reporter) {
			for _, seg := range strings.Split(path, "/") {
				if seg == "" || strings.HasPrefix(seg, "{") {
					continue
				}
				if seg != strings.ToLower(seg) || strings.Contains(seg, "_") {
					r.At(item.PathLoc, "Path segment '%s' should be kebab-case", seg)
					return
				}
			}
		},
	})
	_ = diags
}

func TestServers_ServersDefined(t *testing.T) {
	spec := specs.ByName("test-valid")
	if spec.Name == "" {
		t.Skip("test-valid spec not found")
	}
	idx := buildIndex(t, spec)
	diags := runRule(t, idx, "oas3-api-servers", protocol.SeverityWarning, rules.Visitors{
		Document: func(doc *openapi.Document, r *rules.Reporter) {
			if len(doc.Servers) == 0 {
				r.At(doc.Loc, "API should define at least one server")
			}
		},
	})
	_ = diags
}

func TestValidSpec_NoUnresolvedRefs(t *testing.T) {
	spec := specs.ByName("test-valid")
	if spec.Name == "" {
		t.Skip("test-valid spec not found")
	}
	idx := buildIndex(t, spec)
	diags := runRule(t, idx, "unresolved-ref", protocol.SeverityError, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			for _, ref := range idx.AllRefs {
				if _, err := idx.Resolve(ref.Target); err != nil {
					r.At(ref.Loc, "Unresolved $ref: %s", ref.Target)
				}
			}
		},
	})
	if len(diags) > 0 {
		t.Errorf("expected no unresolved refs in test-valid, got %d", len(diags))
		for _, d := range diags {
			t.Logf("  %s at %d:%d", d.Message, d.Range.Start.Line, d.Range.Start.Character)
		}
	}
}

func TestAllSpecsParseable(t *testing.T) {
	for _, spec := range specs.YAML() {
		t.Run(spec.Name, func(t *testing.T) {
			idx := buildIndex(t, spec)
			if idx == nil {
				t.Fatal("nil index")
			}
			if idx.Document == nil {
				t.Fatal("nil document")
			}
		})
	}
}
