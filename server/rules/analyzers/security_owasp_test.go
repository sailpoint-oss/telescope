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
)

// buildIndexFromYAML parses inline YAML content and returns an openapi.Index.
// This avoids fixture files and keeps tests self-contained.
func buildIndexFromYAML(t *testing.T, content string) *openapi.Index {
	t.Helper()
	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	uri := protocol.DocumentURI("file:///test.yaml")
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       content,
		},
	})

	tree := mgr.GetTree(uri)
	if tree == nil {
		t.Fatal("nil tree from treesitter manager")
	}
	doc := store.Get(uri)
	if doc == nil {
		t.Fatal("nil document from store")
	}
	return openapi.BuildIndex(tree, doc)
}

// runInlineRule is a convenience wrapper around rules.NewReporter + rules.Walk
// for inline YAML tests.
func runInlineRule(t *testing.T, idx *openapi.Index, ruleID string, severity protocol.DiagnosticSeverity, v rules.Visitors) []protocol.Diagnostic {
	t.Helper()
	r := rules.NewReporter(ruleID, severity)
	rules.Walk(idx, v, r)
	return r.Diagnostics()
}

// ---------------------------------------------------------------------------
// owasp-no-http-basic
// ---------------------------------------------------------------------------

func TestOWASP_NoHTTPBasic_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    basicAuth:
      type: http
      scheme: basic`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-http-basic", protocol.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "http" && strings.EqualFold(ss.Scheme, "basic") {
				r.At(ss.Loc, "Security scheme '%s' uses HTTP Basic; consider a stronger mechanism", name)
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected at least one diagnostic for HTTP basic auth scheme")
	}
	found := false
	for _, d := range diags {
		if strings.Contains(d.Message, "basicAuth") && strings.Contains(d.Message, "Basic") {
			found = true
		}
	}
	if !found {
		t.Error("expected diagnostic mentioning 'basicAuth' and 'Basic'")
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

func TestOWASP_NoHTTPBasic_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-http-basic", protocol.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "http" && strings.EqualFold(ss.Scheme, "basic") {
				r.At(ss.Loc, "Security scheme '%s' uses HTTP Basic; consider a stronger mechanism", name)
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for bearer auth, got %d", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

// ---------------------------------------------------------------------------
// owasp-no-api-keys-in-url
// ---------------------------------------------------------------------------

func TestOWASP_NoAPIKeysInURL_FailsQuery(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    queryKey:
      type: apiKey
      in: query
      name: api_key`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-api-keys-in-url", protocol.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "apiKey" && (ss.In == "query" || ss.In == "path") {
				r.At(ss.Loc, "Security scheme '%s' passes API key in %s; use header instead", name, ss.In)
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for API key in query")
	}
	if !strings.Contains(diags[0].Message, "query") {
		t.Errorf("expected message to mention 'query', got: %s", diags[0].Message)
	}
}

func TestOWASP_NoAPIKeysInURL_PassesHeader(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    headerKey:
      type: apiKey
      in: header
      name: X-API-Key`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-api-keys-in-url", protocol.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "apiKey" && (ss.In == "query" || ss.In == "path") {
				r.At(ss.Loc, "Security scheme '%s' passes API key in %s; use header instead", name, ss.In)
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for API key in header, got %d", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

// ---------------------------------------------------------------------------
// security-schemes-defined
// ---------------------------------------------------------------------------

func TestSecurity_SchemesDefined_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
security:
  - nonExistentScheme: []
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "security-schemes-defined", protocol.SeverityError, rules.Visitors{
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
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for undefined security scheme reference")
	}
	found := false
	for _, d := range diags {
		if strings.Contains(d.Message, "nonExistentScheme") {
			found = true
		}
	}
	if !found {
		t.Error("expected diagnostic mentioning 'nonExistentScheme'")
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

func TestSecurity_SchemesDefined_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
security:
  - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "security-schemes-defined", protocol.SeverityError, rules.Visitors{
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
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics when all schemes are defined, got %d", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

// ---------------------------------------------------------------------------
// path-keys-no-trailing-slash
// ---------------------------------------------------------------------------

func TestPaths_NoTrailingSlash_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users/:
    get:
      summary: List users
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "path-keys-no-trailing-slash", protocol.SeverityWarning, rules.Visitors{
		Path: func(path string, item *openapi.PathItem, r *rules.Reporter) {
			if len(path) > 1 && strings.HasSuffix(path, "/") {
				r.At(item.PathLoc, "Path '%s' should not have a trailing slash", path)
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for trailing slash in path")
	}
	if !strings.Contains(diags[0].Message, "/users/") {
		t.Errorf("expected message to mention '/users/', got: %s", diags[0].Message)
	}
}

func TestPaths_NoTrailingSlash_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: OK
  /users/{id}:
    get:
      summary: Get user
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "path-keys-no-trailing-slash", protocol.SeverityWarning, rules.Visitors{
		Path: func(path string, item *openapi.PathItem, r *rules.Reporter) {
			if len(path) > 1 && strings.HasSuffix(path, "/") {
				r.At(item.PathLoc, "Path '%s' should not have a trailing slash", path)
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for paths without trailing slashes, got %d", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

// ---------------------------------------------------------------------------
// no-api-key-in-query
// ---------------------------------------------------------------------------

func TestSecurity_NoAPIKeyInQuery_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    queryAuth:
      type: apiKey
      in: query
      name: token`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "no-api-key-in-query", protocol.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "apiKey" && ss.In == "query" {
				r.At(ss.Loc, "Security scheme '%s' passes API key in query; use header instead", name)
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for API key in query parameter")
	}
	if !strings.Contains(diags[0].Message, "queryAuth") {
		t.Errorf("expected message to mention 'queryAuth', got: %s", diags[0].Message)
	}
}

func TestSecurity_NoAPIKeyInQuery_PassesHeader(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    headerAuth:
      type: apiKey
      in: header
      name: X-Auth-Token`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "no-api-key-in-query", protocol.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "apiKey" && ss.In == "query" {
				r.At(ss.Loc, "Security scheme '%s' passes API key in query; use header instead", name)
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for API key in header, got %d", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}

func TestSecurity_NoAPIKeyInQuery_PassesCookie(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    cookieAuth:
      type: apiKey
      in: cookie
      name: session`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "no-api-key-in-query", protocol.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "apiKey" && ss.In == "query" {
				r.At(ss.Loc, "Security scheme '%s' passes API key in query; use header instead", name)
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for API key in cookie, got %d", len(diags))
		for _, d := range diags {
			t.Logf("  %s", d.Message)
		}
	}
}
