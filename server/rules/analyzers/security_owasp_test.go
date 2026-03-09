package analyzers_test

import (
	"strings"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/analyzers"
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
func runInlineRule(t *testing.T, idx *openapi.Index, ruleID string, severity ctypes.Severity, v rules.Visitors) []protocol.Diagnostic {
	t.Helper()
	r := rules.NewReporter(ruleID, severity)
	rules.Walk(idx, v, r)
	return adapt.DiagnosticsToProtocol(r.Diagnostics())
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
	diags := runInlineRule(t, idx, "owasp-no-http-basic", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "owasp-no-http-basic", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "owasp-no-api-keys-in-url", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "owasp-no-api-keys-in-url", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "security-schemes-defined", ctypes.SeverityError, rules.Visitors{
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
	diags := runInlineRule(t, idx, "security-schemes-defined", ctypes.SeverityError, rules.Visitors{
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
	diags := runInlineRule(t, idx, "path-keys-no-trailing-slash", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "path-keys-no-trailing-slash", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "no-api-key-in-query", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "no-api-key-in-query", ctypes.SeverityWarning, rules.Visitors{
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
	diags := runInlineRule(t, idx, "no-api-key-in-query", ctypes.SeverityWarning, rules.Visitors{
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

// ---------------------------------------------------------------------------
// owasp-short-lived-access-tokens
// ---------------------------------------------------------------------------

func TestOWASP_ShortLivedAccessTokens_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/authorize
          tokenUrl: https://auth.example.com/token
          scopes:
            read: Read access`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-short-lived-access-tokens", ctypes.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Flows == nil {
				return
			}
			type nf struct {
				n string
				f *openapi.OAuthFlow
			}
			for _, x := range []nf{
				{"implicit", ss.Flows.Implicit},
				{"password", ss.Flows.Password},
				{"authorizationCode", ss.Flows.AuthorizationCode},
			} {
				if x.f != nil && x.f.RefreshURL == "" {
					r.At(x.f.Loc, "OAuth2 %s flow in '%s' should define refreshUrl", x.n, name)
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for missing refreshUrl")
	}
	if !strings.Contains(diags[0].Message, "refreshUrl") {
		t.Errorf("expected message to mention refreshUrl, got: %s", diags[0].Message)
	}
}

func TestOWASP_ShortLivedAccessTokens_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://auth.example.com/authorize
          tokenUrl: https://auth.example.com/token
          refreshUrl: https://auth.example.com/refresh
          scopes:
            read: Read access`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-short-lived-access-tokens", ctypes.SeverityWarning, rules.Visitors{
		SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Flows == nil {
				return
			}
			type nf struct {
				n string
				f *openapi.OAuthFlow
			}
			for _, x := range []nf{
				{"implicit", ss.Flows.Implicit},
				{"password", ss.Flows.Password},
				{"authorizationCode", ss.Flows.AuthorizationCode},
			} {
				if x.f != nil && x.f.RefreshURL == "" {
					r.At(x.f.Loc, "OAuth2 %s flow in '%s' should define refreshUrl", x.n, name)
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-rate-limit-retry-after
// ---------------------------------------------------------------------------

func TestOWASP_RateLimitRetryAfter_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '429':
          description: Too Many Requests`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-rate-limit-retry-after", ctypes.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			resp, ok := op.Responses["429"]
			if !ok {
				return
			}
			for header := range resp.Headers {
				if strings.EqualFold(header, "Retry-After") {
					return
				}
			}
			r.At(resp.Loc, "429 response should include Retry-After header")
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for missing Retry-After header")
	}
}

func TestOWASP_RateLimitRetryAfter_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '429':
          description: Too Many Requests
          headers:
            Retry-After:
              schema:
                type: integer`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-rate-limit-retry-after", ctypes.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			resp, ok := op.Responses["429"]
			if !ok {
				return
			}
			for header := range resp.Headers {
				if strings.EqualFold(header, "Retry-After") {
					return
				}
			}
			r.At(resp.Loc, "429 response should include Retry-After header")
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-array-limit
// ---------------------------------------------------------------------------

func TestOWASP_ArrayLimit_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Tags:
      type: array
      items:
        type: string`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-array-limit", ctypes.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "array" && schema.MaxItems == nil {
				r.At(schema.Loc, "Array schema at %s should define maxItems", pointer)
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for array without maxItems")
	}
}

func TestOWASP_ArrayLimit_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Tags:
      type: array
      items:
        type: string
      maxItems: 100`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-array-limit", ctypes.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "array" && schema.MaxItems == nil {
				r.At(schema.Loc, "Array schema at %s should define maxItems", pointer)
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-integer-format
// ---------------------------------------------------------------------------

func TestOWASP_IntegerFormat_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Count:
      type: integer`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-integer-format", ctypes.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "integer" && schema.Format == "" {
				r.At(schema.Loc, "Integer schema should specify format")
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for integer without format")
	}
}

func TestOWASP_IntegerFormat_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Count:
      type: integer
      format: int32`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-integer-format", ctypes.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "integer" && schema.Format == "" {
				r.At(schema.Loc, "Integer schema should specify format")
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-string-restricted
// ---------------------------------------------------------------------------

func TestOWASP_StringRestricted_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Name:
      type: string`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-string-restricted", ctypes.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "string" && schema.Format == "" && schema.Pattern == "" &&
				schema.Enum == nil && !schema.HasConst {
				r.At(schema.Loc, "String schema should specify format, pattern, enum, or const")
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for unrestricted string")
	}
}

func TestOWASP_StringRestricted_PassesFormat(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Email:
      type: string
      format: email`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-string-restricted", ctypes.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "string" && schema.Format == "" && schema.Pattern == "" &&
				schema.Enum == nil && !schema.HasConst {
				r.At(schema.Loc, "String schema should specify format, pattern, enum, or const")
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-integer-limit (3.1+)
// ---------------------------------------------------------------------------

func TestOWASP_IntegerLimit_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Age:
      type: integer
      format: int32`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-integer-limit", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			if idx.Document.Components != nil {
				for name, schema := range idx.Document.Components.Schemas {
					if schema.Type == "integer" {
						hasLower := schema.Minimum != nil || schema.ExclusiveMinimum != nil
						hasUpper := schema.Maximum != nil || schema.ExclusiveMaximum != nil
						if !hasLower || !hasUpper {
							r.At(schema.Loc, "Integer schema '%s' should define min/max bounds", name)
						}
					}
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for integer without bounds")
	}
}

func TestOWASP_IntegerLimit_PassesExclusive(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Age:
      type: integer
      format: int32
      exclusiveMinimum: 0
      exclusiveMaximum: 200`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-integer-limit", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			if idx.Document.Components != nil {
				for name, schema := range idx.Document.Components.Schemas {
					if schema.Type == "integer" {
						hasLower := schema.Minimum != nil || schema.ExclusiveMinimum != nil
						hasUpper := schema.Maximum != nil || schema.ExclusiveMaximum != nil
						if !hasLower || !hasUpper {
							r.At(schema.Loc, "Integer schema '%s' should define min/max bounds", name)
						}
					}
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for integer with exclusiveMin/Max, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-integer-limit-legacy (OAS 3.0)
// ---------------------------------------------------------------------------

func TestOWASP_IntegerLimitLegacy_Fails(t *testing.T) {
	yaml := `openapi: "3.0.3"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Age:
      type: integer
      format: int32`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-integer-limit-legacy", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version20 && idx.Document.ParsedVersion != openapi.Version30 {
				return
			}
			if idx.Document.Components != nil {
				for name, schema := range idx.Document.Components.Schemas {
					if schema.Type == "integer" && (schema.Minimum == nil || schema.Maximum == nil) {
						r.At(schema.Loc, "Integer schema '%s' should define minimum and maximum", name)
					}
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for integer without min/max in OAS 3.0")
	}
}

func TestOWASP_IntegerLimitLegacy_SkipsOAS31(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    Age:
      type: integer
      format: int32`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-integer-limit-legacy", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version20 && idx.Document.ParsedVersion != openapi.Version30 {
				return
			}
			if idx.Document.Components != nil {
				for name, schema := range idx.Document.Components.Schemas {
					if schema.Type == "integer" && (schema.Minimum == nil || schema.Maximum == nil) {
						r.At(schema.Loc, "Integer schema '%s' should define minimum and maximum", name)
					}
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics for OAS 3.1 spec with legacy rule, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-no-unevaluatedProperties (3.1+)
// ---------------------------------------------------------------------------

func TestOWASP_NoUnevaluatedProperties_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-unevaluatedProperties", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			if idx.Document.Components != nil {
				for _, schema := range idx.Document.Components.Schemas {
					if schema.Type == "object" && len(schema.Properties) > 0 &&
						schema.UnevaluatedProperties == nil && !schema.UnevaluatedPropertiesFalse {
						r.At(schema.Loc, "Should set unevaluatedProperties to false")
					}
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for missing unevaluatedProperties")
	}
}

func TestOWASP_NoUnevaluatedProperties_PassesFalse(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
      unevaluatedProperties: false`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-unevaluatedProperties", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			if idx.Document.Components != nil {
				for _, schema := range idx.Document.Components.Schemas {
					if schema.Type == "object" && len(schema.Properties) > 0 &&
						schema.UnevaluatedProperties == nil && !schema.UnevaluatedPropertiesFalse {
						r.At(schema.Loc, "Should set unevaluatedProperties to false")
					}
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-no-additionalProperties (fix for additionalProperties: false)
// ---------------------------------------------------------------------------

func TestOWASP_NoAdditionalProperties_PassesFalse(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
      additionalProperties: false`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-additionalProperties", ctypes.SeverityWarning, rules.Visitors{
		Schema: func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "object" && len(schema.Properties) > 0 &&
				schema.AdditionalProperties == nil && !schema.AdditionalPropertiesFalse {
				r.At(schema.Loc, "Should restrict additionalProperties")
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics when additionalProperties: false, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-concerning-url-parameter
// ---------------------------------------------------------------------------

func TestOWASP_ConcerningURLParameter_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /fetch:
    get:
      operationId: fetchResource
      parameters:
        - name: callback_url
          in: query
          schema:
            type: string
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	urlPatterns := []string{"callback", "redirect", "_url", "-url", "returnurl", "next_url", "target"}
	diags := runInlineRule(t, idx, "owasp-concerning-url-parameter", ctypes.SeverityInfo, rules.Visitors{
		Parameter: func(param *openapi.Parameter, r *rules.Reporter) {
			nameLower := strings.ToLower(param.Name)
			for _, p := range urlPatterns {
				if strings.Contains(nameLower, p) {
					r.At(param.NameLoc, "Parameter '%s' has a URL-like name", param.Name)
					return
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for URL-like parameter name")
	}
}

func TestOWASP_ConcerningURLParameter_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	urlPatterns := []string{"callback", "redirect", "_url", "-url", "returnurl", "next_url", "target"}
	diags := runInlineRule(t, idx, "owasp-concerning-url-parameter", ctypes.SeverityInfo, rules.Visitors{
		Parameter: func(param *openapi.Parameter, r *rules.Reporter) {
			nameLower := strings.ToLower(param.Name)
			for _, p := range urlPatterns {
				if strings.Contains(nameLower, p) {
					r.At(param.NameLoc, "Parameter '%s' has a URL-like name", param.Name)
					return
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-inventory-access
// ---------------------------------------------------------------------------

func TestOWASP_InventoryAccess_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-inventory-access", ctypes.SeverityWarning, rules.Visitors{
		Server: func(server *openapi.Server, r *rules.Reporter) {
			if _, ok := server.Extensions["x-internal"]; !ok {
				r.At(server.Loc, "Server should declare x-internal")
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for server without x-internal")
	}
}

func TestOWASP_InventoryAccess_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
    x-internal: false`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-inventory-access", ctypes.SeverityWarning, rules.Visitors{
		Server: func(server *openapi.Server, r *rules.Reporter) {
			if _, ok := server.Extensions["x-internal"]; !ok {
				r.At(server.Loc, "Server should declare x-internal")
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-inventory-environment
// ---------------------------------------------------------------------------

func TestOWASP_InventoryEnvironment_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
    description: Main API`

	idx := buildIndexFromYAML(t, yaml)
	envTerms := []string{"production", "staging", "development", "sandbox", "local", "test", "qa", "dev", "prod", "uat"}
	diags := runInlineRule(t, idx, "owasp-inventory-environment", ctypes.SeverityWarning, rules.Visitors{
		Server: func(server *openapi.Server, r *rules.Reporter) {
			desc := strings.ToLower(server.Description.Text)
			for _, term := range envTerms {
				if strings.Contains(desc, term) {
					return
				}
			}
			r.At(server.Loc, "Server description should include environment")
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for server without environment description")
	}
}

func TestOWASP_InventoryEnvironment_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com
    description: Production server`

	idx := buildIndexFromYAML(t, yaml)
	envTerms := []string{"production", "staging", "development", "sandbox", "local", "test", "qa", "dev", "prod", "uat"}
	diags := runInlineRule(t, idx, "owasp-inventory-environment", ctypes.SeverityWarning, rules.Visitors{
		Server: func(server *openapi.Server, r *rules.Reporter) {
			desc := strings.ToLower(server.Description.Text)
			for _, term := range envTerms {
				if strings.Contains(desc, term) {
					return
				}
			}
			r.At(server.Loc, "Server description should include environment")
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-no-server-http
// ---------------------------------------------------------------------------

func TestOWASP_NoServerHTTP_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: http://api.example.com`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-server-http", ctypes.SeverityError, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			for _, srv := range idx.Document.Servers {
				lower := strings.ToLower(srv.URL)
				if !strings.HasPrefix(lower, "https://") && !strings.HasPrefix(lower, "wss://") {
					r.At(srv.URLLoc, "Server URL must use https:// or wss://")
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for HTTP server URL")
	}
}

func TestOWASP_NoServerHTTP_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
servers:
  - url: https://api.example.com`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-server-http", ctypes.SeverityError, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			for _, srv := range idx.Document.Servers {
				lower := strings.ToLower(srv.URL)
				if !strings.HasPrefix(lower, "https://") && !strings.HasPrefix(lower, "wss://") {
					r.At(srv.URLLoc, "Server URL must use https:// or wss://")
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-define-cors-origin
// ---------------------------------------------------------------------------

func TestOWASP_DefineCORSOrigin_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-define-cors-origin", ctypes.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			for code, resp := range op.Responses {
				if !strings.HasPrefix(code, "2") {
					continue
				}
				hasCORS := false
				for header := range resp.Headers {
					if strings.EqualFold(header, "Access-Control-Allow-Origin") {
						hasCORS = true
					}
				}
				if !hasCORS {
					r.At(resp.Loc, "Response %s should define CORS header", code)
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for missing CORS header")
	}
}

func TestOWASP_DefineCORSOrigin_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: OK
          headers:
            Access-Control-Allow-Origin:
              schema:
                type: string`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-define-cors-origin", ctypes.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			for code, resp := range op.Responses {
				if !strings.HasPrefix(code, "2") {
					continue
				}
				hasCORS := false
				for header := range resp.Headers {
					if strings.EqualFold(header, "Access-Control-Allow-Origin") {
						hasCORS = true
					}
				}
				if !hasCORS {
					r.At(resp.Loc, "Response %s should define CORS header", code)
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-no-scheme-http (OAS 2.0)
// ---------------------------------------------------------------------------

func TestOWASP_NoSchemeHTTP_Fails(t *testing.T) {
	yaml := `swagger: "2.0"
info:
  title: Test
  version: "1.0"
schemes:
  - http
  - https
paths: {}`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-scheme-http", ctypes.SeverityError, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version20 {
				return
			}
			for _, scheme := range idx.Document.Schemes {
				if strings.EqualFold(scheme, "http") {
					r.AtRange(adapt.RangeFromProtocol(protocol.FileStartRange), "OAS 2.0 schemes must not include 'http'")
					return
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for http in OAS 2.0 schemes")
	}
}

func TestOWASP_NoSchemeHTTP_PassesHTTPS(t *testing.T) {
	yaml := `swagger: "2.0"
info:
  title: Test
  version: "1.0"
schemes:
  - https
paths: {}`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-no-scheme-http", ctypes.SeverityError, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version20 {
				return
			}
			for _, scheme := range idx.Document.Schemes {
				if strings.EqualFold(scheme, "http") {
					r.AtRange(adapt.RangeFromProtocol(protocol.FileStartRange), "OAS 2.0 schemes must not include 'http'")
					return
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-admin-security-unique
// ---------------------------------------------------------------------------

func TestOWASP_AdminSecurityUnique_Fails(t *testing.T) {
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
  /admin/users:
    get:
      operationId: adminListUsers
      security:
        - bearerAuth: []
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-admin-security-unique", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			globalSchemes := schemeNamesFromReqs(idx.Document.Security)
			if len(globalSchemes) == 0 {
				return
			}
			for path, item := range idx.Document.Paths {
				lower := strings.ToLower(path)
				if !strings.Contains(lower, "/admin") && !strings.Contains(lower, "/internal") {
					continue
				}
				for _, mo := range item.Operations() {
					opSchemes := schemeNamesFromReqs(mo.Operation.Security)
					if len(opSchemes) == 0 {
						continue
					}
					if sameStringSet(globalSchemes, opSchemes) {
						r.At(mo.Operation.Loc, "Admin endpoint uses same security as non-admin")
					}
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for admin endpoint with same security")
	}
}

// helpers for admin security test
func schemeNamesFromReqs(reqs []openapi.SecurityRequirement) []string {
	seen := make(map[string]bool)
	for _, req := range reqs {
		for _, e := range req.Entries {
			seen[e.Name] = true
		}
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	return names
}

func sameStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	set := make(map[string]bool, len(a))
	for _, s := range a {
		set[s] = true
	}
	for _, s := range b {
		if !set[s] {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// owasp-rate-limit-responses-429
// ---------------------------------------------------------------------------

func TestOWASP_RateLimitResponses429_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: OK`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-rate-limit-responses-429", ctypes.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if _, ok := op.Responses["429"]; !ok {
				r.At(op.Loc, "Missing 429 response for %s %s", strings.ToUpper(method), path)
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for missing 429 response")
	}
}

func TestOWASP_RateLimitResponses429_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: OK
        '429':
          description: Too Many Requests`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-rate-limit-responses-429", ctypes.SeverityWarning, rules.Visitors{
		Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if _, ok := op.Responses["429"]; !ok {
				r.At(op.Loc, "Missing 429 response for %s %s", strings.ToUpper(method), path)
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// ---------------------------------------------------------------------------
// owasp-constrained-unevaluatedProperties
// ---------------------------------------------------------------------------

func TestOWASP_ConstrainedUnevaluatedProperties_Fails(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
      unevaluatedProperties:
        type: string`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-constrained-unevaluatedProperties", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			if idx.Document.Components != nil {
				for _, schema := range idx.Document.Components.Schemas {
					if schema.UnevaluatedProperties != nil && schema.MaxProperties == nil {
						r.At(schema.Loc, "Should define maxProperties")
					}
				}
			}
		},
	})
	if len(diags) == 0 {
		t.Fatal("expected diagnostic for unevaluatedProperties schema without maxProperties")
	}
}

func TestOWASP_ConstrainedUnevaluatedProperties_Passes(t *testing.T) {
	yaml := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
components:
  schemas:
    User:
      type: object
      properties:
        name:
          type: string
      unevaluatedProperties:
        type: string
      maxProperties: 10`

	idx := buildIndexFromYAML(t, yaml)
	diags := runInlineRule(t, idx, "owasp-constrained-unevaluatedProperties", ctypes.SeverityWarning, rules.Visitors{
		Custom: func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			if idx.Document.Components != nil {
				for _, schema := range idx.Document.Components.Schemas {
					if schema.UnevaluatedProperties != nil && schema.MaxProperties == nil {
						r.At(schema.Loc, "Should define maxProperties")
					}
				}
			}
		},
	})
	if len(diags) != 0 {
		t.Errorf("expected 0 diagnostics, got %d", len(diags))
	}
}

// Ensure all expected OWASP rules are registered.
func TestOWASP_AllRulesRegistered(t *testing.T) {
	// Register all rules by creating a throwaway gossip server.
	s := gossip.NewServer("test", "0.0.0")
	analyzers.RegisterAll(s)

	expected := []string{
		"owasp-no-http-basic",
		"owasp-no-api-keys-in-url",
		"owasp-no-credentials-in-url",
		"owasp-auth-insecure-schemes",
		"owasp-jwt-best-practices",
		"owasp-short-lived-access-tokens",
		"owasp-protection-global-unsafe",
		"owasp-protection-global-safe",
		"owasp-define-error-responses-401",
		"owasp-define-error-responses-500",
		"owasp-rate-limit",
		"owasp-rate-limit-retry-after",
		"owasp-rate-limit-responses-429",
		"owasp-define-error-validation",
		"owasp-define-cors-origin",
		"owasp-no-scheme-http",
		"owasp-no-server-http",
		"owasp-no-numeric-ids",
		"owasp-no-additionalProperties",
		"owasp-constrained-additionalProperties",
		"owasp-no-unevaluatedProperties",
		"owasp-constrained-unevaluatedProperties",
		"owasp-string-limit",
		"owasp-string-restricted",
		"owasp-array-limit",
		"owasp-integer-limit",
		"owasp-integer-limit-legacy",
		"owasp-integer-format",
		"owasp-admin-security-unique",
		"owasp-concerning-url-parameter",
		"owasp-inventory-access",
		"owasp-inventory-environment",
	}

	registered := rules.DefaultRegistry.ByCategory(rules.CategoryOWASP)
	regMap := make(map[string]bool)
	for _, m := range registered {
		regMap[m.ID] = true
	}

	for _, id := range expected {
		if !regMap[id] {
			t.Errorf("expected OWASP rule %q to be registered", id)
		}
	}

	if len(registered) != len(expected) {
		t.Errorf("expected %d OWASP rules, got %d", len(expected), len(registered))
		for _, m := range registered {
			if !contains(expected, m.ID) {
				t.Logf("  unexpected: %s", m.ID)
			}
		}
	}
}

func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

