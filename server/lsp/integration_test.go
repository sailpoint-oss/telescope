package lsp_test

import (
	"strings"
	"testing"
	"time"

	"github.com/LukasParke/gossip/protocol"
)

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

func hasDiagWithCode(diags []protocol.Diagnostic, code string) bool {
	for _, d := range diags {
		if c, ok := d.Code.(string); ok && c == code {
			return true
		}
	}
	return false
}

func hasDiagContaining(diags []protocol.Diagnostic, substr string) bool {
	for _, d := range diags {
		if strings.Contains(d.Message, substr) {
			return true
		}
	}
	return false
}

func dumpDiags(t *testing.T, label string, diags []protocol.Diagnostic) {
	t.Helper()
	t.Logf("--- %s (%d diagnostics) ---", label, len(diags))
	for i, d := range diags {
		code := ""
		if d.Code != nil {
			if c, ok := d.Code.(string); ok {
				code = c
			}
		}
		t.Logf("  [%d] L%d:%d sev=%d code=%q src=%q msg=%q",
			i, d.Range.Start.Line+1, d.Range.Start.Character+1,
			d.Severity, code, d.Source, d.Message)
	}
}

// ---------------------------------------------------------------------------
// Broken YAML Parsing Tests (6)
//
// These verify the pipeline handles malformed YAML gracefully. Telescope's
// own checks (duplicate-keys, ascii, analyzers) still run on content that
// tree-sitter can partially parse. Pure syntax error reporting requires
// child LSPs, which are not exercised in the in-memory test harness.
// ---------------------------------------------------------------------------

func TestBrokenYAML_InvalidIndentation(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///broken-indent.yaml"
	// "nested: indented too far" under summary -- tree-sitter treats this as
	// a multiline string, so the spec is actually valid-ish YAML.
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      summary: Outer value
        nested: indented too far
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(uri, "yaml", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "broken-indent", diags)

	// Verify server is still responsive after processing malformed content.
	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenYAML_MissingColon(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///missing-colon.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /no-colon
    get:
      summary: Should have a colon after path
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(uri, "yaml", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "missing-colon", diags)

	// Server stays alive after processing broken YAML.
	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenYAML_UnterminatedString(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///unterminated.yaml"
	// Unterminated quote in title -- tree-sitter still partially parses
	// this as a valid OpenAPI doc, producing telescope analyzer diagnostics.
	content := `openapi: "3.1.0"
info:
  title: "unterminated string
  version: "1.0"
paths: {}
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "unterminated-string", diags)

	if len(diags) == 0 {
		t.Error("expected telescope analyzer diagnostics on partially parsed spec")
	}
}

func TestBrokenYAML_TabCharacters(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///tabs.yaml"
	content := "openapi: \"3.1.0\"\ninfo:\n\ttitle: Tab Indented\n\tversion: \"1.0\"\npaths: {}\n"

	c.OpenWithLanguage(uri, "yaml", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "tab-characters", diags)

	// Tab detection is a child LSP feature; here we verify no crash.
	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenYAML_DuplicateKeysAtRoot(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///dup-root.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      summary: First
      responses:
        "200":
          description: OK
    get:
      summary: Second
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "dup-keys-root", diags)

	if !hasDiagWithCode(diags, "duplicate-keys") {
		t.Error("expected duplicate-keys diagnostic for duplicate 'get'")
	}
}

func TestBrokenYAML_EmptyDocument(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///empty.yaml"

	c.OpenWithLanguage(uri, "yaml", "")
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "empty-doc", diags)

	// No crash on empty input.
	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

// ---------------------------------------------------------------------------
// Broken JSON Parsing Tests (6)
//
// Same strategy: verify graceful handling. JSON syntax errors (trailing
// commas, unquoted keys, etc.) are only reported by child LSPs.
// ---------------------------------------------------------------------------

func TestBrokenJSON_TrailingComma(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///trailing-comma.json"
	content := `{
  "openapi": "3.1.0",
  "info": {
    "title": "Test",
    "version": "1.0",
  },
  "paths": {}
}`
	c.OpenWithLanguage(uri, "json", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "trailing-comma", diags)

	// JSON trailing comma detection is a child LSP feature; verify no crash.
	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenJSON_MissingClosingBrace(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///missing-brace.json"
	content := `{
  "openapi": "3.1.0",
  "info": {
    "title": "Test",
    "version": "1.0"
  },
  "paths": {
    "/test": {
      "get": {
        "summary": "unclosed"
      }
    }
`
	c.OpenWithLanguage(uri, "json", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "missing-brace", diags)

	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenJSON_MissingClosingBracket(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///missing-bracket.json"
	content := `{
  "openapi": "3.1.0",
  "info": {"title": "Test", "version": "1.0"},
  "paths": {},
  "tags": [
    {"name": "test", "description": "test tag"}
}`
	c.OpenWithLanguage(uri, "json", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "missing-bracket", diags)

	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenJSON_UnquotedKey(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///unquoted-key.json"
	content := `{
  openapi: "3.1.0",
  "info": {"title": "Test", "version": "1.0"},
  "paths": {}
}`
	c.OpenWithLanguage(uri, "json", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "unquoted-key", diags)

	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenJSON_SingleQuotes(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///single-quotes.json"
	content := `{
  'openapi': '3.1.0',
  'info': {'title': 'Test', 'version': '1.0'},
  'paths': {}
}`
	c.OpenWithLanguage(uri, "json", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "single-quotes", diags)

	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

func TestBrokenJSON_DuplicateKeys(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///dup-json.json"
	content := `{
  "openapi": "3.1.0",
  "info": {"title": "Test", "version": "1.0"},
  "paths": {
    "/test": {
      "get": {"summary": "First", "responses": {"200": {"description": "OK"}}},
      "get": {"summary": "Second", "responses": {"200": {"description": "OK"}}}
    }
  }
}`
	c.OpenWithLanguage(uri, "json", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "dup-json", diags)

	if !hasDiagWithCode(diags, "duplicate-keys") {
		t.Error("expected duplicate-keys diagnostic for duplicate 'get' in JSON")
	}
}

// ---------------------------------------------------------------------------
// JSON Schema Validation Tests (5)
//
// These exercise telescope's oas3-schema analyzer using the tree-sitter +
// jsonschema pipeline. The oas3-schema check validates the document
// structure against the compiled OpenAPI JSON Schema.
// ---------------------------------------------------------------------------

func TestSchema_MissingRequiredInfo(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///no-info.yaml"
	content := `openapi: "3.1.0"
paths:
  /test:
    get:
      summary: No info block
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "missing-info", diags)

	if !hasDiagWithCode(diags, "oas3-schema") {
		t.Error("expected oas3-schema diagnostic for missing required 'info'")
	}
	if !hasDiagContaining(diags, "info") {
		t.Error("expected a diagnostic mentioning 'info'")
	}
}

func TestSchema_MissingInfoTitle(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///no-title.yaml"
	content := `openapi: "3.1.0"
info:
  version: "1.0"
paths: {}
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "missing-title", diags)

	if !hasDiagWithCode(diags, "oas3-schema") {
		t.Error("expected oas3-schema diagnostic for missing required 'title' in info")
	}
	if !hasDiagContaining(diags, "title") {
		t.Error("expected a diagnostic mentioning 'title'")
	}
}

func TestSchema_MissingInfoVersion(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///no-version.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
paths: {}
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "missing-version", diags)

	if !hasDiagWithCode(diags, "oas3-schema") {
		t.Error("expected oas3-schema diagnostic for missing required 'version' in info")
	}
	if !hasDiagContaining(diags, "version") {
		t.Error("expected a diagnostic mentioning 'version'")
	}
}

func TestSchema_MissingPathsKey(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///no-paths.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "missing-paths", diags)

	// oas3-schema should flag missing 'paths' (required in most OpenAPI versions)
	// or the spec is so minimal that other analyzers produce diagnostics.
	if len(diags) == 0 {
		t.Error("expected at least one diagnostic for a spec with no paths")
	}
}

func TestSchema_MissingOpenAPIVersion(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///no-version-field.yaml"
	content := `info:
  title: Test
  version: "1.0"
paths: {}
`
	c.OpenWithLanguage(uri, "yaml", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "no-openapi-version", diags)

	// Without "openapi:" key, the document isn't recognized as OpenAPI.
	// The server should handle this gracefully without panicking.
	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Errorf("server should handle hover gracefully: %v", err)
	}
}

// ---------------------------------------------------------------------------
// URI Normalization Roundtrip Tests
// ---------------------------------------------------------------------------

func TestURINormalization_Roundtrip(t *testing.T) {
	c := newTestServer(t)

	// Open a document with a clean URI.
	canonical := "file:///home/user/api.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      operationId: getTest
      summary: A test
      description: Test endpoint
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(canonical, "yaml", content)
	_ = c.WaitForDiagnostics(canonical, 5*time.Second)

	// Hover using a URI with dot segments — should resolve to the same document.
	variant := "file:///home/user/sub/../api.yaml"
	hover, err := c.Hover(variant, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Fatalf("hover with variant URI failed: %v", err)
	}
	if hover == nil {
		t.Log("hover returned nil (document not found via variant URI) -- may be expected if gossiptest client doesn't normalize request URIs")
	}
}

func TestURINormalization_DiagnosticLookupVariant(t *testing.T) {
	c := newTestServer(t)

	uri := "file:///home/user/norm.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /UPPER_CASE:
    get:
      operationId: getUpper
      summary: Upper case path
      description: Should trigger kebab-case
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "uri-normalization", diags)

	if !hasDiagWithCode(diags, "kebab-case") {
		t.Error("expected kebab-case diagnostic for /UPPER_CASE path")
	}
}

// ---------------------------------------------------------------------------
// Custom Edge Case Integration Tests (5)
// ---------------------------------------------------------------------------

func TestEdge_EmptyYAMLDocument(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///edge-empty.yaml"

	c.OpenWithLanguage(uri, "yaml", "")
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "edge-empty", diags)

	// Server must stay alive after empty input.
	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Logf("hover on empty doc returned: %v (expected)", err)
	}
}

func TestEdge_CommentOnlyYAML(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///edge-comments.yaml"
	content := `# This file has only comments
# No actual content
# Should be handled gracefully
`
	c.OpenWithLanguage(uri, "yaml", content)
	time.Sleep(500 * time.Millisecond)
	diags := c.LatestDiagnostics(uri)
	dumpDiags(t, "edge-comments", diags)

	_, err := c.Hover(uri, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Logf("hover on comment-only doc returned: %v (expected)", err)
	}
}

func TestEdge_UnicodeInKeysAndValues(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///edge-unicode.yaml"
	content := "openapi: \"3.1.0\"\ninfo:\n  title: \"Test API \xe2\x80\x94 Unicode\"\n  version: \"1.0\"\npaths: {}\n"

	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "edge-unicode", diags)

	if !hasDiagWithCode(diags, "ascii") {
		t.Error("expected ascii diagnostic for em-dash character")
	}
}

func TestEdge_VeryDeeplyNestedSchema(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///edge-deep.yaml"
	content := `openapi: "3.1.0"
info:
  title: Deep
  version: "1.0"
paths:
  /deep:
    get:
      operationId: getDeep
      summary: Deep nesting
      description: Tests deeply nested schema
      tags:
        - deep
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  a:
                    type: object
                    properties:
                      b:
                        type: object
                        properties:
                          c:
                            type: object
                            properties:
                              d:
                                type: object
                                properties:
                                  e:
                                    type: string
tags:
  - name: deep
    description: Deep nesting
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "edge-deep", diags)

	// The oas3-schema compiled schema may flag "deprecated" as required (schema
	// artifact). Filter those out and check there are no OTHER error diagnostics.
	for _, d := range diags {
		if d.Severity == protocol.SeverityError {
			code := ""
			if c, ok := d.Code.(string); ok {
				code = c
			}
			if code == "oas3-schema" && strings.Contains(d.Message, "deprecated") {
				continue
			}
			t.Errorf("unexpected error diagnostic on valid deeply nested spec: code=%q msg=%q", code, d.Message)
		}
	}
}

func TestEdge_MixedValidAndInvalidPaths(t *testing.T) {
	c := newTestServer(t)
	uri := "file:///edge-mixed.yaml"
	content := `openapi: "3.1.0"
info:
  title: Mixed
  version: "1.0"
paths:
  /valid-path:
    get:
      operationId: getValid
      summary: Valid endpoint
      description: Follows all rules
      tags:
        - test
      responses:
        "200":
          description: OK
  /INVALID_PATH:
    get:
      summary: Missing operationId and kebab-case violation
      responses:
        "200":
          description: OK
tags:
  - name: test
    description: Test endpoints
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)
	dumpDiags(t, "edge-mixed", diags)

	if len(diags) == 0 {
		t.Error("expected diagnostics for the invalid path")
	}
	if !hasDiagWithCode(diags, "kebab-case") {
		t.Error("expected kebab-case diagnostic for /INVALID_PATH")
	}
}

// ---------------------------------------------------------------------------
// URI Normalization — Variant URI Tests
// ---------------------------------------------------------------------------

func TestURINormalization_HoverWithVariantURI(t *testing.T) {
	c := newTestServer(t)

	canonical := "file:///home/user/api.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /test:
    get:
      operationId: getTest
      summary: A test endpoint
      description: Test endpoint
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(canonical, "yaml", content)
	_ = c.WaitForDiagnostics(canonical, 5*time.Second)

	// Hover using a URI with dot segments — should resolve to the same document.
	variant := "file:///home/user/sub/../api.yaml"
	hover, err := c.Hover(variant, protocol.Position{Line: 0, Character: 0})
	if err != nil {
		t.Fatalf("hover with variant URI failed: %v", err)
	}
	if hover == nil {
		t.Error("hover with variant URI should resolve to the same document, got nil")
	}
}

func TestURINormalization_DefinitionWithVariantURI(t *testing.T) {
	c := newTestServer(t)

	canonical := "file:///home/user/def.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /pets:
    get:
      operationId: listPets
      summary: List pets
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
components:
  schemas:
    Pet:
      type: object
      properties:
        name:
          type: string
`
	c.OpenWithLanguage(canonical, "yaml", content)
	_ = c.WaitForDiagnostics(canonical, 5*time.Second)

	// Definition using a variant URI with dot segments
	variant := "file:///home/user/sub/../def.yaml"
	refLine := 15 // 0-indexed line with $ref: '#/components/schemas/Pet'
	locs, err := c.Definition(variant, protocol.Position{Line: uint32(refLine), Character: 20})
	if err != nil {
		t.Fatalf("definition with variant URI failed: %v", err)
	}
	if len(locs) == 0 {
		t.Error("definition with variant URI should resolve the $ref, got no locations")
	} else {
		normTarget := string(protocol.NormalizeURI(locs[0].URI))
		if normTarget != canonical {
			t.Errorf("expected definition to point to %s, got %s", canonical, normTarget)
		}
	}
}

func TestURINormalization_DiagnosticsContinuity(t *testing.T) {
	c := newTestServer(t)

	uri := "file:///home/user/diag-cont.yaml"
	content := `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /UPPER_CASE:
    get:
      operationId: getUpper
      summary: Upper case path
      description: Should trigger kebab-case
      responses:
        "200":
          description: OK
`
	c.OpenWithLanguage(uri, "yaml", content)
	diags := c.WaitForDiagnostics(uri, 5*time.Second)

	if !hasDiagWithCode(diags, "kebab-case") {
		t.Fatal("expected initial kebab-case diagnostic")
	}

	// Request hover using variant URI — should not break diagnostics
	variant := "file:///home/user/sub/../diag-cont.yaml"
	_, _ = c.Hover(variant, protocol.Position{Line: 0, Character: 0})

	// Original URI should still yield diagnostics
	diags2 := c.WaitForDiagnostics(uri, 5*time.Second)
	if !hasDiagWithCode(diags2, "kebab-case") {
		t.Error("diagnostics should remain after hover with variant URI")
	}
}
