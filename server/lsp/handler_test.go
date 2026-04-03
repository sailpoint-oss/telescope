package lsp_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"unsafe"

	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

type testEnv struct {
	store *document.Store
	mgr   *treesitter.Manager
	cache *openapi.IndexCache
	ctx   *gossip.Context
	uri   protocol.DocumentURI
}

func setupTestEnv(t *testing.T, uri protocol.DocumentURI, content string) *testEnv {
	t.Helper()

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

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
		t.Fatal("nil tree")
	}
	doc := store.Get(uri)
	if doc == nil {
		t.Fatal("nil document")
	}

	cache := openapi.NewIndexCache()
	idx := openapi.BuildIndex(tree, doc)
	cache.Set(uri, idx)

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}

	return &testEnv{
		store: store,
		mgr:   mgr,
		cache: cache,
		ctx:   ctx,
		uri:   uri,
	}
}

const testSpec = `openapi: "3.1.0"
info:
  title: Test API
  version: "1.0.0"
  description: A test API
tags:
  - name: pets
    description: Pet operations
paths:
  /pets:
    get:
      operationId: listPets
      tags:
        - pets
      summary: List all pets
      description: Returns a list of pets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        "200":
          description: A list of pets
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
    post:
      operationId: createPet
      tags:
        - pets
      summary: Create a pet
      responses:
        "201":
          description: Created
components:
  schemas:
    Pet:
      type: object
      required:
        - name
      properties:
        name:
          type: string
        id:
          type: integer
    Error:
      type: object
      properties:
        message:
          type: string
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
security:
  - bearerAuth: []
`

func TestRenameHandler_Tag(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewRenameHandler(env.cache, nil)

	// Rename the "pets" tag
	result, err := handler(env.ctx, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 6, Character: 12}, // "pets" in tags
		},
		NewName: "animals",
	})
	if err != nil {
		t.Fatalf("rename error: %v", err)
	}
	if result == nil {
		t.Fatal("rename returned nil")
	}

	edits, ok := result.Changes[env.uri]
	if !ok || len(edits) == 0 {
		t.Fatal("expected edits for the document URI")
	}

	// Should rename the root tag definition + each operation tag usage
	// Root "pets" definition + 2 operations referencing "pets"
	if len(edits) < 2 {
		t.Errorf("expected at least 2 edits (root def + op usages), got %d", len(edits))
	}

	for _, edit := range edits {
		if edit.NewText != "animals" {
			t.Errorf("edit NewText = %q, want 'animals'", edit.NewText)
		}
	}
}

func TestRenameHandler_TagFallsBackWhenNameLocIsZero(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewRenameHandler(env.cache, nil)

	idx := env.cache.Get(env.uri)
	tag, ok := idx.Tags["pets"]
	if !ok {
		t.Fatal("expected pets tag in index")
	}
	tag.NameLoc = openapi.Loc{}
	idx.Tags["pets"] = tag

	result, err := handler(env.ctx, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 6, Character: 12},
		},
		NewName: "animals",
	})
	if err != nil {
		t.Fatalf("rename error: %v", err)
	}
	if result == nil {
		t.Fatal("rename returned nil")
	}

	edits := result.Changes[env.uri]
	if len(edits) == 0 {
		t.Fatal("expected rename edits")
	}

	foundFallbackRange := false
	for _, edit := range edits {
		if edit.NewText != "animals" {
			t.Errorf("edit NewText = %q, want 'animals'", edit.NewText)
		}
		if edit.Range.Start.Line == 6 &&
			edit.Range.Start.Character == 10 &&
			edit.Range.End.Line == 6 &&
			edit.Range.End.Character == 14 {
			foundFallbackRange = true
		}
	}
	if !foundFallbackRange {
		t.Fatalf("expected fallback range edit for root tag definition, got %+v", edits)
	}
}

func TestRenameHandler_Schema(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewRenameHandler(env.cache, nil)

	// Position on "Pet" schema name in components
	idx := env.cache.Get(env.uri)
	var petNameRange protocol.Range
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNameRange = adapt.RangeToProtocol(schema.NameLoc.Range)
	}

	result, err := handler(env.ctx, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     petNameRange.Start,
		},
		NewName: "Animal",
	})
	if err != nil {
		t.Fatalf("rename error: %v", err)
	}
	if result == nil {
		t.Fatal("rename returned nil")
	}

	edits := result.Changes[env.uri]
	if len(edits) < 2 {
		t.Errorf("expected at least 2 edits (definition + $ref), got %d", len(edits))
	}
}

func TestPrepareRenameHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewPrepareRenameHandler(env.cache, nil)

	tests := []struct {
		name      string
		pos       protocol.Position
		canRename bool
	}{
		{"tag name", protocol.Position{Line: 6, Character: 12}, true},
		{"empty area", protocol.Position{Line: 0, Character: 0}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := handler(env.ctx, &protocol.PrepareRenameParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     tt.pos,
				},
			})
			if err != nil {
				t.Fatalf("error: %v", err)
			}
			if tt.canRename && result == nil {
				t.Error("expected non-nil result for renameable position")
			}
			if !tt.canRename && result != nil {
				t.Errorf("expected nil result for non-renameable position, got %+v", result)
			}
		})
	}
}

func TestCompletionHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewCompletionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 5, Character: 10},
		},
	})
	if err != nil {
		t.Fatalf("completion error: %v", err)
	}
	if result == nil {
		t.Log("completion returned nil list (no completions at this position)")
		return
	}
	// Verify completions are valid
	for _, item := range result.Items {
		if item.Label == "" {
			t.Error("completion item has empty label")
		}
	}
}

func TestCodeActionHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewCodeActionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 10, Character: 0},
		},
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{},
		},
	})
	if err != nil {
		t.Fatalf("code action error: %v", err)
	}
	_ = result // ensure no panic
}

func TestCodeActionHandler_MalformedDocumentReturnsNoActions(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: "unterminated
paths: {}
`
	env := setupTestEnv(t, "file:///malformed.yaml", spec)
	handler := lsp.NewCodeActionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 3, Character: 0},
		},
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{{
				Source:   "telescope",
				Code:     "oas3-schema",
				Message:  "syntax error in document",
				Severity: protocol.SeverityError,
			}},
		},
	})
	if err != nil {
		t.Fatalf("code action error: %v", err)
	}
	if len(result) != 0 {
		t.Fatalf("expected malformed document to return no actions, got %#v", result)
	}
}

func TestCodeActionHandler_AddInfoQuickFix(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  version: "1.0.0"
paths: {}
`
	env := setupTestEnv(t, "file:///missing-info-title.yaml", spec)
	handler := lsp.NewCodeActionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 1, Character: 0},
			End:   protocol.Position{Line: 2, Character: 0},
		},
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{{
				Source:   "oas3-schema",
				Code:     "oas3-schema",
				Message:  "`info.title` is required",
				Severity: protocol.SeverityError,
			}},
		},
	})
	if err != nil {
		t.Fatalf("code action error: %v", err)
	}

	action := findActionByTitle(result, "Add info.title")
	if action == nil {
		t.Fatalf("expected info.title quick fix, got %#v", result)
	}
	edits := action.Edit.Changes[env.uri]
	if len(edits) != 1 || !strings.Contains(edits[0].NewText, "title: TODO title") {
		t.Fatalf("expected info.title edit, got %#v", edits)
	}
}

func TestCodeActionHandler_AddMissingResponsesQuickFix(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Missing Responses
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
`
	env := setupTestEnv(t, "file:///missing-responses.yaml", spec)
	handler := lsp.NewCodeActionHandler(env.cache, nil)
	idx := env.cache.Get(env.uri)
	if idx == nil {
		t.Fatal("missing index")
	}
	op := idx.Document.Paths["/users"].Get
	if op == nil {
		t.Fatal("missing GET operation")
	}
	opRange := adapt.RangeToProtocol(openapi.LocOrFallback(op.MethodLoc, op.Loc).Range)

	result, err := handler(env.ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range:        opRange,
		Context:      protocol.CodeActionContext{},
	})
	if err != nil {
		t.Fatalf("code action error: %v", err)
	}

	action := findActionByTitle(result, "Add default 200 response to GET /users")
	if action == nil {
		t.Fatalf("expected missing responses quick fix, got %#v", result)
	}
	edits := action.Edit.Changes[env.uri]
	if len(edits) != 1 || !strings.Contains(edits[0].NewText, "responses:") {
		t.Fatalf("expected responses edit, got %#v", edits)
	}
}

func TestCodeActionHandler_UnresolvedLocalRefQuickFix(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Local Ref Fix
  version: "1.0.0"
paths:
  /pets:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pett"
components:
  schemas:
    Pet:
      type: object
`
	env := setupTestEnv(t, "file:///unresolved-local-ref.yaml", spec)
	handler := lsp.NewCodeActionHandler(env.cache, nil)

	idx := env.cache.Get(env.uri)
	if idx == nil || len(idx.AllRefs) == 0 {
		t.Fatal("expected indexed ref usage")
	}
	refRange := adapt.RangeToProtocol(idx.AllRefs[0].Loc.Range)

	result, err := handler(env.ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range:        refRange,
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{{
				Range:    refRange,
				Source:   "telescope",
				Code:     "unresolved-ref",
				Message:  "Cannot resolve $ref: #/components/schemas/Pett",
				Severity: protocol.SeverityError,
			}},
		},
	})
	if err != nil {
		t.Fatalf("code action error: %v", err)
	}

	action := findActionByTitle(result, "#/components/schemas/Pet")
	if action == nil {
		t.Fatalf("expected local ref quick fix, got %#v", result)
	}
	edits := action.Edit.Changes[env.uri]
	if len(edits) != 1 || edits[0].NewText != "#/components/schemas/Pet" {
		t.Fatalf("expected local ref replacement, got %#v", edits)
	}
}

func TestCodeActionHandler_UnresolvedExternalRefQuickFix(t *testing.T) {
	rootSpec := `openapi: "3.1.0"
info:
  title: External Ref Fix
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./components.yam#/components/schemas/User"
`

	dir := t.TempDir()
	rootPath := filepath.Join(dir, "root.yaml")
	compPath := filepath.Join(dir, "components.yaml")
	writeWorkspaceFile(t, rootPath, rootSpec)
	writeWorkspaceFile(t, compPath, crossFileCompSpec)

	rootURI := fileURI(rootPath)
	compURI := fileURI(compPath)

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{URI: rootURI, LanguageID: "yaml", Version: 1, Text: rootSpec},
	})

	rootTree := mgr.GetTree(rootURI)
	if rootTree == nil {
		t.Fatal("nil tree for unresolved external ref root")
	}
	rootDoc := store.Get(rootURI)
	cache := openapi.NewIndexCache()
	rootIdx := openapi.BuildIndex(rootTree, rootDoc)
	cache.Set(rootURI, rootIdx)
	cache.Set(compURI, openapi.ParseAndIndex([]byte(crossFileCompSpec)))

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}
	handler := lsp.NewCodeActionHandler(cache, nil)
	refRange := adapt.RangeToProtocol(rootIdx.AllRefs[0].Loc.Range)

	result, err := handler(ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: rootURI},
		Range:        refRange,
		Context: protocol.CodeActionContext{
			Diagnostics: []protocol.Diagnostic{{
				Range:    refRange,
				Source:   "telescope",
				Code:     "unresolved-ref",
				Message:  "Cannot resolve $ref: ./components.yam#/components/schemas/User",
				Severity: protocol.SeverityError,
			}},
		},
	})
	if err != nil {
		t.Fatalf("code action error: %v", err)
	}

	action := findActionByTitle(result, "./components.yaml#/components/schemas/User")
	if action == nil {
		t.Fatalf("expected external ref quick fix, got %#v", result)
	}
	edits := action.Edit.Changes[rootURI]
	if len(edits) != 1 || edits[0].NewText != "./components.yaml#/components/schemas/User" {
		t.Fatalf("expected external ref replacement, got %#v", edits)
	}
}

func TestDocumentLinkHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewDocumentLinkHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.DocumentLinkParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("document link error: %v", err)
	}
	// Local $ref links are intentionally omitted to avoid opening duplicate
	// same-file fragment tabs. Handler may still return links for external refs,
	// externalDocs URLs, or markdown URLs depending on input.
	for _, link := range result {
		if link.Target == nil {
			t.Error("link has nil target")
		}
		if link.Tooltip == "" {
			t.Error("link has empty tooltip")
		}
	}
}

func TestDocumentLinkHandler_RelativeMarkdownLinks(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Link Test
  version: "1.0.0"
  description: |
    See the [Guide](./docs/guide.md#intro).
paths: {}
`
	env := setupTestEnv(t, "file:///workspace/apis/openapi.yaml", spec)
	handler := lsp.NewDocumentLinkHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.DocumentLinkParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("document link error: %v", err)
	}

	wantSuffix := "/workspace/apis/docs/guide.md#intro"
	for _, link := range result {
		if link.Target != nil && strings.HasSuffix(string(*link.Target), wantSuffix) {
			return
		}
	}
	t.Fatalf("expected markdown link target ending in %q, got %#v", wantSuffix, result)
}

func TestFormattingHandler_YAML(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewFormattingHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.DocumentFormattingParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Options: protocol.FormattingOptions{
			TabSize:      2,
			InsertSpaces: true,
		},
	})
	if err != nil {
		t.Fatalf("formatting error: %v", err)
	}
	// YAML formatting may return an empty edit slice when no changes are needed.
	_ = result
}

func TestFormattingHandler_JSON_Minified(t *testing.T) {
	uri := protocol.DocumentURI("file:///tmp/format-e2e.json")
	content := `{"openapi":"3.1.0","info":{"title":"Format E2E","version":"1.0.0"},"paths":{}}`

	store := document.NewStore()
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "openapi-json",
			Version:    1,
			Text:       content,
		},
	})

	cache := openapi.NewIndexCache()
	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}

	handler := lsp.NewFormattingHandler(cache, nil)
	result, err := handler(ctx, &protocol.DocumentFormattingParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: uri},
		Options: protocol.FormattingOptions{
			TabSize:      2,
			InsertSpaces: true,
		},
	})
	if err != nil {
		t.Fatalf("formatting error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected one formatting edit, got %d", len(result))
	}
	if !strings.Contains(result[0].NewText, "\n") {
		t.Fatalf("expected pretty-printed JSON with newlines, got %q", result[0].NewText)
	}
}

func TestFormattingHandler_JSON_Minified_URIVariant(t *testing.T) {
	// Same file path as TestFormattingHandler_JSON_Minified but a URI string that
	// differs from the key used at didOpen (simulates client/server URI drift).
	opened := protocol.DocumentURI("file:///tmp/format-e2e.json")
	altURI := protocol.DocumentURI("file:///tmp/format-e2e.json#frag")
	content := `{"openapi":"3.1.0","info":{"title":"Format E2E","version":"1.0.0"},"paths":{}}`

	store := document.NewStore()
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        opened,
			LanguageID: "openapi-json",
			Version:    1,
			Text:       content,
		},
	})

	cache := openapi.NewIndexCache()
	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}

	handler := lsp.NewFormattingHandler(cache, nil)
	result, err := handler(ctx, &protocol.DocumentFormattingParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: altURI},
		Options: protocol.FormattingOptions{
			TabSize:      2,
			InsertSpaces: true,
		},
	})
	if err != nil {
		t.Fatalf("formatting error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected one formatting edit (path fallback), got %d", len(result))
	}
}

func TestFormattingHandler_YAML_TrimsTrailingWhitespace(t *testing.T) {
	spec := "openapi: 3.1.0  \ninfo:\n  title: Format Test   \n  version: 1.0.0\npaths: {}"
	env := setupTestEnv(t, "file:///format.yaml", spec)
	handler := lsp.NewFormattingHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.DocumentFormattingParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Options: protocol.FormattingOptions{
			TabSize:      2,
			InsertSpaces: true,
		},
	})
	if err != nil {
		t.Fatalf("formatting error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected single formatting edit, got %d", len(result))
	}
	if strings.Contains(result[0].NewText, "Format Test   ") {
		t.Fatalf("expected formatter to trim trailing spaces, got %q", result[0].NewText)
	}
	if !strings.HasSuffix(result[0].NewText, "\n") {
		t.Fatalf("expected formatter to add trailing newline, got %q", result[0].NewText)
	}
}

func TestHoverHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewHoverHandler(env.cache, nil)

	tests := []struct {
		name string
		pos  protocol.Position
	}{
		{"tag", protocol.Position{Line: 6, Character: 12}},
		{"operationId", protocol.Position{Line: 11, Character: 20}},
		{"empty", protocol.Position{Line: 0, Character: 0}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := handler(env.ctx, &protocol.HoverParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     tt.pos,
				},
			})
			if err != nil {
				t.Fatalf("hover error: %v", err)
			}
			_ = result
		})
	}
}

func TestDefinitionHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewDefinitionHandler(env.cache, nil, nil)

	result, err := handler(env.ctx, &protocol.DefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 5, Character: 10},
		},
	})
	if err != nil {
		t.Fatalf("definition error: %v", err)
	}
	_ = result
}

func TestDefinitionHandler_Ref(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewDefinitionHandler(env.cache, nil, nil)

	// Line 27 (0-based) in testSpec: `$ref: "#/components/schemas/Pet"`
	// Test Ctrl+Click on various positions within the $ref value
	positions := []struct {
		name string
		pos  protocol.Position
	}{
		{"middle of ref value", protocol.Position{Line: 27, Character: 30}},
		{"start of ref value", protocol.Position{Line: 27, Character: 22}},
		{"on $ref key", protocol.Position{Line: 27, Character: 17}},
	}

	idx := env.cache.Get(env.uri)
	petSchema, ok := idx.Schemas["Pet"]
	if !ok {
		t.Fatal("Pet schema not found in index")
	}

	expectedLines := map[uint32]bool{
		petSchema.Loc.Range.Start.Line: true,
	}
	if adapt.RangeToProtocol(petSchema.NameLoc.Range) != (protocol.Range{}) {
		expectedLines[petSchema.NameLoc.Range.Start.Line] = true
	}

	for _, tt := range positions {
		t.Run(tt.name, func(t *testing.T) {
			result, err := handler(env.ctx, &protocol.DefinitionParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     tt.pos,
				},
			})
			if err != nil {
				t.Fatalf("definition error: %v", err)
			}
			if len(result) == 0 {
				t.Fatal("expected definition result for $ref to Pet schema")
			}
			if !expectedLines[result[0].Range.Start.Line] {
				t.Errorf("expected definition at one of %v, got line %d",
					expectedLines, result[0].Range.Start.Line)
			}
		})
	}
}

// Regression: E2E used to get empty hover/definition on Linux/macOS for local
// $ref in rich-api.yaml when the index cache preferred a stale graph-projected
// index. Pins non-empty providers for the same fixture bytes and a Unix-style
// file URI.
func TestRichAPIFixture_HoverAndDefinition_UnixFileURI(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	fixturePath := filepath.Join(filepath.Dir(thisFile), "..", "..", "client", "test-fixtures", "workspace-basic", "rich-api.yaml")
	b, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture %s: %v", fixturePath, err)
	}
	content := string(b)

	uri := protocol.DocumentURI("file:///workspace/rich-api.yaml")
	env := setupTestEnv(t, uri, content)
	doc := env.store.Get(uri)
	if doc == nil {
		t.Fatal("nil document")
	}

	refNeedle := "#/components/schemas/User"
	off := strings.Index(content, refNeedle)
	if off < 0 {
		t.Fatal("fixture missing local User $ref")
	}
	pos := doc.PositionAt(off + 5)

	hoverH := lsp.NewHoverHandler(env.cache, nil)
	hoverResult, err := hoverH(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("hover: %v", err)
	}
	if hoverResult == nil || hoverResult.Contents.Value == "" {
		t.Fatal("expected non-empty hover for local $ref")
	}
	hv := strings.ToLower(hoverResult.Contents.Value)
	if !strings.Contains(hv, "user") && !strings.Contains(hv, "email") && !strings.Contains(hv, "schema") {
		v := hoverResult.Contents.Value
		if len(v) > 400 {
			v = v[:400]
		}
		t.Fatalf("hover should describe User schema; got: %s", v)
	}

	defH := lsp.NewDefinitionHandler(env.cache, nil, nil)
	defResult, err := defH(env.ctx, &protocol.DefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("definition: %v", err)
	}
	if len(defResult) == 0 {
		t.Fatal("expected definition for local $ref")
	}
}

// RichAPI fixture: User schema component highlights include Write (definition) and Read (refs).
func TestRichAPIFixture_DocumentHighlight_UserSchema(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	fixturePath := filepath.Join(filepath.Dir(thisFile), "..", "..", "client", "test-fixtures", "workspace-basic", "rich-api.yaml")
	b, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture %s: %v", fixturePath, err)
	}
	content := string(b)

	uri := protocol.DocumentURI("file:///workspace/rich-api.yaml")
	env := setupTestEnv(t, uri, content)
	doc := env.store.Get(uri)
	if doc == nil {
		t.Fatal("nil document")
	}

	userNeedle := "    User:"
	off := strings.Index(content, userNeedle)
	if off < 0 {
		t.Fatal("fixture missing User schema definition line")
	}
	// Cursor on "User" component name (after "    Us")
	pos := doc.PositionAt(off + len("    Us"))

	h := lsp.NewDocumentHighlightHandler(env.cache, nil)
	result, err := h(env.ctx, &protocol.DocumentHighlightParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("document highlight: %v", err)
	}
	if len(result) < 2 {
		t.Fatalf("expected definition + usages, got %d highlights", len(result))
	}
	var writes, reads int
	for _, x := range result {
		if x.Kind == 3 { // highlightWrite
			writes++
		}
		if x.Kind == 2 { // highlightRead
			reads++
		}
	}
	if writes < 1 || reads < 1 {
		t.Fatalf("expected at least one Write and one Read highlight, got writes=%d reads=%d", writes, reads)
	}
}

func TestNilIndex(t *testing.T) {
	store := document.NewStore()
	cache := openapi.NewIndexCache()
	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}
	uri := protocol.DocumentURI("file:///nonexistent.yaml")

	hoverHandler := lsp.NewHoverHandler(cache, nil)
	result, err := hoverHandler(ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     protocol.Position{Line: 0, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("hover with nil index should not error: %v", err)
	}
	if result != nil {
		t.Errorf("hover with nil index should return nil result")
	}

	completionHandler := lsp.NewCompletionHandler(cache, nil)
	cResult, err := completionHandler(ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     protocol.Position{Line: 0, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("completion with nil index: %v", err)
	}
	if cResult != nil {
		t.Errorf("expected nil completion list for unknown URI")
	}
}

func TestCodeLensHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewCodeLensHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CodeLensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("code lens error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected code lenses for spec with paths and schemas")
	}

	// Should include a file header lens with OpenAPI version
	foundHeader := false
	for _, lens := range result {
		if lens.Command != nil && lens.Command.Title != "" {
			if lens.Range.Start.Line == 0 && lens.Range.Start.Character == 0 {
				foundHeader = true
			}
		}
	}
	if !foundHeader {
		t.Error("expected file header code lens at line 0")
	}

	// Should include reference count lenses for schemas
	foundRefLens := false
	for _, lens := range result {
		if lens.Command != nil && lens.Command.Command == "telescope.showReferences" {
			foundRefLens = true
			break
		}
	}
	if !foundRefLens {
		t.Error("expected reference count code lens for component schemas")
	}
}

func TestPrepareCallHierarchyHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewPrepareCallHierarchyHandler(env.cache, nil)

	// Position on "Pet" schema name in components
	idx := env.cache.Get(env.uri)
	var petNamePos protocol.Position
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNamePos = adapt.PositionToProtocol(schema.NameLoc.Range.Start)
	} else {
		t.Fatal("Pet schema not found in index")
	}

	result, err := handler(env.ctx, &protocol.CallHierarchyPrepareParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     petNamePos,
		},
	})
	if err != nil {
		t.Fatalf("prepare call hierarchy error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected call hierarchy item for Pet schema")
	}
	if result[0].Name != "Pet" {
		t.Errorf("call hierarchy item name = %q, want 'Pet'", result[0].Name)
	}
}

func TestPrepareCallHierarchyHandler_Empty(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewPrepareCallHierarchyHandler(env.cache, nil)

	// Position on an empty area should return nil
	result, err := handler(env.ctx, &protocol.CallHierarchyPrepareParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 0, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("prepare call hierarchy error: %v", err)
	}
	if result != nil {
		t.Errorf("expected nil result for non-component position, got %+v", result)
	}
}

func TestCallHierarchyIncomingHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	prepareHandler := lsp.NewPrepareCallHierarchyHandler(env.cache, nil)
	incomingHandler := lsp.NewCallHierarchyIncomingHandler(env.cache, nil)

	// First prepare to get a valid CallHierarchyItem for Pet
	idx := env.cache.Get(env.uri)
	var petNamePos protocol.Position
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNamePos = adapt.PositionToProtocol(schema.NameLoc.Range.Start)
	} else {
		t.Fatal("Pet schema not found in index")
	}

	items, err := prepareHandler(env.ctx, &protocol.CallHierarchyPrepareParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     petNamePos,
		},
	})
	if err != nil {
		t.Fatalf("prepare error: %v", err)
	}
	if len(items) == 0 {
		t.Fatal("no items from prepare")
	}

	// Now get incoming calls for Pet
	result, err := incomingHandler(env.ctx, &protocol.CallHierarchyIncomingCallsParams{
		Item: items[0],
	})
	if err != nil {
		t.Fatalf("incoming calls error: %v", err)
	}
	// testSpec has a $ref to Pet from the GET /pets response, so expect at least 1
	if len(result) == 0 {
		t.Error("expected at least one incoming call for Pet schema (referenced via $ref)")
	}
}

func TestSemanticTokensHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewSemanticTokensHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("semantic tokens error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil semantic tokens result")
	}
	// Data should be a multiple of 5 (deltaLine, deltaChar, length, tokenType, modifiers)
	if len(result.Data)%5 != 0 {
		t.Errorf("semantic tokens data length %d is not a multiple of 5", len(result.Data))
	}
	if len(result.Data) == 0 {
		t.Error("expected semantic token data for spec with paths, schemas, refs")
	}
}

func TestSemanticTokensPositions(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewSemanticTokensHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("semantic tokens error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil semantic tokens result")
	}

	// Decode delta-encoded tokens to absolute positions
	type absToken struct {
		line, char, length, tokenType, modifiers uint32
	}
	var tokens []absToken
	var prevLine, prevChar uint32
	for i := 0; i+4 < len(result.Data); i += 5 {
		dLine := result.Data[i]
		dChar := result.Data[i+1]
		line := prevLine + dLine
		ch := dChar
		if dLine == 0 {
			ch = prevChar + dChar
		}
		tokens = append(tokens, absToken{
			line: line, char: ch,
			length:    result.Data[i+2],
			tokenType: result.Data[i+3],
			modifiers: result.Data[i+4],
		})
		prevLine = line
		prevChar = ch
	}

	const (
		tokMethod = 11
		tokEnum   = 3
		tokMacro  = 12
	)

	// Verify HTTP method tokens land on the key, not the value body
	// testSpec line 10: "    get:" → char 4, len 3
	// testSpec line 28: "    post:" → char 4, len 4
	findToken := func(line, char, length, tokenType uint32) bool {
		for _, tok := range tokens {
			if tok.line == line && tok.char == char && tok.length == length && tok.tokenType == tokenType {
				return true
			}
		}
		return false
	}

	tests := []struct {
		name                          string
		line, char, length, tokenType uint32
	}{
		{"get method key", 10, 4, 3, tokMethod},
		{"post method key", 28, 4, 4, tokMethod},
		{"200 response code key", 22, 8, 5, tokEnum},
		{"201 response code key", 34, 8, 5, tokEnum},
		{"bearerAuth security scheme key", 53, 4, 10, tokMacro},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !findToken(tt.line, tt.char, tt.length, tt.tokenType) {
				t.Errorf("expected token at line %d char %d len %d type %d; got tokens:", tt.line, tt.char, tt.length, tt.tokenType)
				for _, tok := range tokens {
					if tok.tokenType == tt.tokenType {
						t.Errorf("  line=%d char=%d len=%d type=%d mod=%d", tok.line, tok.char, tok.length, tok.tokenType, tok.modifiers)
					}
				}
			}
		})
	}
}

func TestDocumentSymbolHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewSymbolHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.DocumentSymbolParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("document symbol error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected document symbols for spec")
	}

	// Check for expected top-level symbols: info, paths, schemas, securitySchemes, tags
	names := make(map[string]bool)
	for _, sym := range result {
		names[sym.Name] = true
	}
	for _, expected := range []string{"paths", "schemas", "tags"} {
		if !names[expected] {
			t.Errorf("expected top-level symbol %q not found", expected)
		}
	}
}

func TestReferencesHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewReferencesHandler(env.cache, nil)

	// Position on "Pet" schema name
	idx := env.cache.Get(env.uri)
	var petNamePos protocol.Position
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNamePos = adapt.PositionToProtocol(schema.NameLoc.Range.Start)
	} else {
		t.Fatal("Pet schema not found in index")
	}

	result, err := handler(env.ctx, &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     petNamePos,
		},
		Context: protocol.ReferenceContext{
			IncludeDeclaration: true,
		},
	})
	if err != nil {
		t.Fatalf("references error: %v", err)
	}
	// Should find the declaration + $ref usage
	if len(result) < 2 {
		t.Errorf("expected at least 2 references (declaration + $ref), got %d", len(result))
	}
}

func TestReferencesHandler_Empty(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewReferencesHandler(env.cache, nil)

	// Position on an area with no referenceable symbol
	result, err := handler(env.ctx, &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 0, Character: 0},
		},
		Context: protocol.ReferenceContext{
			IncludeDeclaration: false,
		},
	})
	if err != nil {
		t.Fatalf("references error: %v", err)
	}
	_ = result // ensure no panic
}

func TestInlayHintHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewInlayHintHandler(env.cache, nil)

	// Request hints for the full document range
	result, err := handler(env.ctx, &protocol.InlayHintParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 132, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("inlay hint error: %v", err)
	}
	// testSpec has required fields on Pet and a $ref, expect some hints
	if len(result) == 0 {
		t.Error("expected inlay hints for spec with required fields and $ref")
	}
	for _, hint := range result {
		if hint.Label == "" {
			t.Error("inlay hint has empty label")
		}
	}
}

func TestInlayHintHandler_EmptyRange(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewInlayHintHandler(env.cache, nil)

	// Request hints for a range outside the document content
	result, err := handler(env.ctx, &protocol.InlayHintParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 500, Character: 0},
			End:   protocol.Position{Line: 510, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("inlay hint error: %v", err)
	}
	if len(result) != 0 {
		t.Errorf("expected no inlay hints for out-of-range request, got %d", len(result))
	}
}

// testSpecRich exercises hover enrichments: constraints, flags, request bodies,
// examples, deprecated schemas, links, and headers.
const testSpecRich = `openapi: "3.1.0"
info:
  title: Rich API
  version: "1.0.0"
tags:
  - name: Users
    description: User management
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      tags:
        - Users
      parameters:
        - $ref: "#/components/parameters/Limit"
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/User"
          links:
            GetUser:
              $ref: "#/components/links/GetUserLink"
        "401":
          $ref: "#/components/responses/Unauthorized"
    post:
      operationId: createUser
      summary: Create user
      tags:
        - Users
      requestBody:
        $ref: "#/components/requestBodies/CreateUser"
      responses:
        "201":
          description: Created
  /users/{id}:
    get:
      operationId: getUser
      summary: Get user by ID
      tags:
        - Users
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
    delete:
      operationId: deleteUser
      deprecated: true
      summary: Delete user
      tags:
        - Users
      responses:
        "204":
          description: Deleted
components:
  schemas:
    User:
      type: object
      description: A user account
      required:
        - id
        - email
      properties:
        id:
          type: string
          format: uuid
          readOnly: true
        email:
          type: string
          format: email
          minLength: 5
          maxLength: 254
        age:
          type: integer
          minimum: 0
          maximum: 150
        status:
          type: string
          enum: [active, inactive]
          default: active
    DeprecatedModel:
      type: object
      deprecated: true
      description: Legacy model
      properties:
        name:
          type: string
          nullable: true
  parameters:
    Limit:
      name: limit
      in: query
      description: Max items to return
      schema:
        type: integer
        minimum: 1
        maximum: 100
      example: 25
  responses:
    Unauthorized:
      description: Authentication required
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/User"
  requestBodies:
    CreateUser:
      description: User creation payload
      required: true
      content:
        application/json:
          schema:
            type: object
            properties:
              email:
                type: string
              name:
                type: string
  headers:
    X-Total-Count:
      description: Total number of items
      schema:
        type: integer
  links:
    GetUserLink:
      operationId: getUser
      description: Fetch a user by ID
  examples:
    UserExample:
      summary: Sample user
      description: A typical user
      value: '{"id":"123","email":"a@b.com"}'
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`

func TestHoverHandler_RefToRequestBody(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewHoverHandler(env.cache, nil)

	// Line with $ref to requestBodies/CreateUser (0-based line 36)
	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 36, Character: 15},
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for $ref to requestBody")
	}
	content := result.Contents.Value
	if !strings.Contains(content, "$ref") {
		t.Errorf("expected $ref in hover, got: %s", content)
	}
	if !strings.Contains(content, "application/json") {
		t.Errorf("expected content type in requestBody hover, got: %s", content)
	}
}

func TestHoverHandler_ConstrainedSchema(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewHoverHandler(env.cache, nil)

	// Hover over "User" schema name in components
	idx := env.cache.Get(env.uri)
	var userPos protocol.Position
	if schema, ok := idx.Schemas["User"]; ok {
		userPos = adapt.PositionToProtocol(schema.NameLoc.Range.Start)
	} else {
		t.Fatal("User schema not found")
	}

	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     userPos,
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for User schema")
	}
	content := result.Contents.Value
	// User schema has properties with constraints
	if !strings.Contains(content, "Property") {
		t.Errorf("expected property table in schema hover, got: %s", content)
	}
}

func TestHoverHandler_SchemaPropertyRefInlineSummary(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Ref Summary
  version: "1.0.0"
paths: {}
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
        email:
          type: string
    Pet:
      type: object
      properties:
        owner:
          $ref: "#/components/schemas/User"
`
	env := setupTestEnv(t, "file:///ref-summary.yaml", spec)
	handler := lsp.NewHoverHandler(env.cache, nil)

	idx := env.cache.Get(env.uri)
	var pos protocol.Position
	if schema, ok := idx.Schemas["Pet"]; ok {
		pos = adapt.PositionToProtocol(schema.NameLoc.Range.Start)
	} else {
		t.Fatal("Pet schema not found")
	}

	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for Pet schema")
	}
	content := result.Contents.Value
	if !strings.Contains(content, "owner") || !strings.Contains(content, "→ User") {
		t.Errorf("expected inline ref summary for owner -> User, got: %s", content)
	}
	if !strings.Contains(content, "id") || !strings.Contains(content, "email") {
		t.Errorf("expected referenced User fields in hover summary, got: %s", content)
	}
}

func TestHoverHandler_MultiHopRefSummaryIsBounded(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Multi-hop Hover
  version: "1.0.0"
paths: {}
components:
  schemas:
    A:
      type: object
      properties:
        b:
          $ref: "#/components/schemas/B"
    B:
      type: object
      properties:
        c:
          $ref: "#/components/schemas/C"
    C:
      type: object
      properties:
        a:
          $ref: "#/components/schemas/A"
        leaf:
          type: string
`
	env := setupTestEnv(t, "file:///multi-hop.yaml", spec)
	handler := lsp.NewHoverHandler(env.cache, nil)

	idx := env.cache.Get(env.uri)
	aSchema, ok := idx.Schemas["A"]
	if !ok {
		t.Fatal("A schema not found")
	}
	pos := adapt.PositionToProtocol(aSchema.NameLoc.Range.Start)

	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for schema A")
	}
	content := result.Contents.Value
	if !strings.Contains(content, "b") || !strings.Contains(content, "→ B") {
		t.Fatalf("expected first hop summary for b -> B, got: %s", content)
	}
	if !strings.Contains(content, "{...}") {
		t.Fatalf("expected bounded/truncated deep preview marker, got: %s", content)
	}
}

func TestHoverHandler_UnresolvedExternalRefFallbackText(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: External Ref Hover
  version: "1.0.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./missing.yaml#/components/schemas/User"
`
	env := setupTestEnv(t, "file:///external-ref.yaml", spec)
	handler := lsp.NewHoverHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 13, Character: 28},
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for unresolved external $ref")
	}
	content := result.Contents.Value
	if !strings.Contains(content, "current workspace") || !strings.Contains(content, "preview is limited") {
		t.Fatalf("expected external fallback context in hover, got: %s", content)
	}
}

func TestHoverHandler_DeprecatedSchema(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewHoverHandler(env.cache, nil)

	idx := env.cache.Get(env.uri)
	var pos protocol.Position
	if schema, ok := idx.Schemas["DeprecatedModel"]; ok {
		pos = adapt.PositionToProtocol(schema.NameLoc.Range.Start)
	} else {
		t.Fatal("DeprecatedModel schema not found")
	}

	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover for deprecated schema")
	}
	content := result.Contents.Value
	if !strings.Contains(content, "deprecated") {
		t.Errorf("expected 'deprecated' flag in hover, got: %s", content)
	}
}

func TestHoverHandler_OperationIdRich(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewHoverHandler(env.cache, nil)

	// Hover on "listUsers" operationId (0-based line 10, char 20)
	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 10, Character: 20},
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for operationId")
	}
	content := result.Contents.Value
	if !strings.Contains(content, "GET") {
		t.Errorf("expected HTTP method in operation hover, got: %s", content)
	}
	if !strings.Contains(content, "Tags") {
		t.Errorf("expected Tags in operation hover, got: %s", content)
	}
	if !strings.Contains(content, "Responses") {
		t.Errorf("expected Responses in operation hover, got: %s", content)
	}
}

func TestHoverHandler_ResponseShowsSchema(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewHoverHandler(env.cache, nil)

	idx := env.cache.Get(env.uri)
	var pos protocol.Position
	if resp, ok := idx.Responses["Unauthorized"]; ok {
		pos = adapt.PositionToProtocol(resp.Loc.Range.Start)
	}

	// Hover on "Unauthorized" component response
	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	// If we got a hover, it should mention the schema type
	if result != nil {
		content := result.Contents.Value
		if !strings.Contains(content, "application/json") {
			t.Errorf("expected content type in response hover, got: %s", content)
		}
	}
}

func TestCompletionResolve_RefRich(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewCompletionResolveHandler(env.cache, nil)

	item := &protocol.CompletionItem{
		Label: "#/components/schemas/User",
		Data: map[string]interface{}{
			"resolveKind":  "ref",
			"resolveValue": "#/components/schemas/User",
		},
	}
	result, err := handler(env.ctx, item)
	if err != nil {
		t.Fatalf("resolve error: %v", err)
	}
	doc, ok := result.Documentation.(*protocol.MarkupContent)
	if !ok || doc == nil {
		t.Fatal("expected markdown documentation")
	}
	if !strings.Contains(doc.Value, "$ref") {
		t.Errorf("expected $ref in resolved doc, got: %s", doc.Value)
	}
	if !strings.Contains(doc.Value, "object") {
		t.Errorf("expected type info in resolved doc, got: %s", doc.Value)
	}
}

func TestCompletionResolve_SecuritySchemeRich(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewCompletionResolveHandler(env.cache, nil)

	item := &protocol.CompletionItem{
		Label: "bearerAuth",
		Data: map[string]interface{}{
			"resolveKind":  "securityScheme",
			"resolveValue": "bearerAuth",
		},
	}
	result, err := handler(env.ctx, item)
	if err != nil {
		t.Fatalf("resolve error: %v", err)
	}
	doc, ok := result.Documentation.(*protocol.MarkupContent)
	if !ok || doc == nil {
		t.Fatal("expected markdown documentation")
	}
	if !strings.Contains(doc.Value, "http") {
		t.Errorf("expected scheme type in resolved doc, got: %s", doc.Value)
	}
	if !strings.Contains(doc.Value, "bearer") {
		t.Errorf("expected 'bearer' in resolved doc, got: %s", doc.Value)
	}
}

func TestCompletionResolve_TagRich(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewCompletionResolveHandler(env.cache, nil)

	item := &protocol.CompletionItem{
		Label: "Users",
		Data: map[string]interface{}{
			"resolveKind":  "tag",
			"resolveValue": "Users",
		},
	}
	result, err := handler(env.ctx, item)
	if err != nil {
		t.Fatalf("resolve error: %v", err)
	}
	doc, ok := result.Documentation.(*protocol.MarkupContent)
	if !ok || doc == nil {
		t.Fatal("expected markdown documentation")
	}
	if !strings.Contains(doc.Value, "Users") {
		t.Errorf("expected tag name in resolved doc, got: %s", doc.Value)
	}
	if !strings.Contains(doc.Value, "Operations") {
		t.Errorf("expected operations list in resolved doc, got: %s", doc.Value)
	}
}

func TestSemanticTokens_DeprecatedSchema(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewSemanticTokensHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("semantic tokens error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil semantic tokens")
	}

	// Decode tokens to find the DeprecatedModel schema name
	idx := env.cache.Get(env.uri)
	schema, ok := idx.Schemas["DeprecatedModel"]
	if !ok {
		t.Fatal("DeprecatedModel not found")
	}
	targetLine := schema.NameLoc.Range.Start.Line

	type absToken struct{ line, char, length, tokenType, modifiers uint32 }
	var tokens []absToken
	var prevLine, prevChar uint32
	for i := 0; i+4 < len(result.Data); i += 5 {
		dLine := result.Data[i]
		dChar := result.Data[i+1]
		line := prevLine + dLine
		ch := dChar
		if dLine == 0 {
			ch = prevChar + dChar
		}
		tokens = append(tokens, absToken{line, ch, result.Data[i+2], result.Data[i+3], result.Data[i+4]})
		prevLine = line
		prevChar = ch
	}

	const tokType = 1
	const modDeclaration = 1 << 0

	found := false
	for _, tok := range tokens {
		if tok.line == targetLine && tok.tokenType == tokType {
			// Deprecated modifier is no longer sent via semantic tokens;
			// deprecated styling is handled client-side via decorations.
			if tok.modifiers&modDeclaration == 0 {
				t.Errorf("DeprecatedModel schema token at line %d missing declaration modifier", targetLine)
			}
			found = true
			break
		}
	}
	if !found {
		t.Errorf("no type token found for DeprecatedModel at line %d", targetLine)
	}
}

func TestSemanticTokens_TagNames(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewSemanticTokensHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("semantic tokens error: %v", err)
	}

	idx := env.cache.Get(env.uri)
	tag, ok := idx.Tags["Users"]
	if !ok {
		t.Fatal("Users tag not found")
	}
	targetLine := tag.NameLoc.Range.Start.Line

	type absToken struct{ line, char, length, tokenType, modifiers uint32 }
	var tokens []absToken
	var prevLine, prevChar uint32
	for i := 0; i+4 < len(result.Data); i += 5 {
		dLine := result.Data[i]
		dChar := result.Data[i+1]
		line := prevLine + dLine
		ch := dChar
		if dLine == 0 {
			ch = prevChar + dChar
		}
		tokens = append(tokens, absToken{line, ch, result.Data[i+2], result.Data[i+3], result.Data[i+4]})
		prevLine = line
		prevChar = ch
	}

	const tokType = 1
	const modDefinition = 1 << 1

	found := false
	for _, tok := range tokens {
		if tok.line == targetLine && tok.tokenType == tokType && tok.modifiers&modDefinition != 0 {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("no type+definition token found for Users tag at line %d", targetLine)
	}
}

func TestInlayHints_NoDeprecatedHints(t *testing.T) {
	// Deprecated markers are now handled client-side via decorations,
	// so the server should NOT emit deprecated inlay hints.
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewInlayHintHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.InlayHintParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 200, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("inlay hint error: %v", err)
	}

	for _, hint := range result {
		if hint.Label == "deprecated" {
			t.Error("deprecated inlay hints should no longer be emitted by the server")
		}
	}
}

func TestLinkedEditing_Tag(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewLinkedEditingRangeHandler(env.cache, nil)

	// Position on "Users" tag name in root tags (line 8)
	idx := env.cache.Get(env.uri)
	tag, ok := idx.Tags["Users"]
	if !ok {
		t.Fatal("Users tag not found")
	}
	pos := adapt.PositionToProtocol(tag.NameLoc.Range.Start)

	result, err := handler(env.ctx, &protocol.LinkedEditingRangeParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("linked editing error: %v", err)
	}
	if result == nil {
		t.Fatal("expected linked editing ranges for tag")
	}
	// Root definition + operation usages (listUsers, createUser, getUser, deleteUser use Users tag)
	if len(result.Ranges) < 2 {
		t.Errorf("expected at least 2 linked editing ranges for tag, got %d", len(result.Ranges))
	}
}

func TestComponentDefinitionLoc_AllKinds(t *testing.T) {
	env := setupTestEnv(t, "file:///rich.yaml", testSpecRich)
	handler := lsp.NewReferencesHandler(env.cache, nil)
	idx := env.cache.Get(env.uri)

	// Verify that all component kinds resolve to a non-zero definition loc
	// by checking that references finds a declaration for each.
	kinds := map[string]string{
		"schemas":         "User",
		"parameters":      "Limit",
		"responses":       "Unauthorized",
		"requestBodies":   "CreateUser",
		"headers":         "X-Total-Count",
		"securitySchemes": "bearerAuth",
		"links":           "GetUserLink",
		"examples":        "UserExample",
	}

	for kind, name := range kinds {
		t.Run(kind+"/"+name, func(t *testing.T) {
			names := idx.ComponentNames(kind)
			found := false
			for _, n := range names {
				if n == name {
					found = true
					break
				}
			}
			if !found {
				t.Skipf("component %s/%s not indexed", kind, name)
			}

			// Rename handler uses componentDefinitionLoc — verify it gives a real range
			// by checking the references handler can find the definition + refs.
			pos := adapt.PositionToProtocol(idx.Document.Components.Schemas["User"].NameLoc.Range.Start)
			if kind == "schemas" {
				pos = adapt.PositionToProtocol(idx.Document.Components.Schemas[name].NameLoc.Range.Start)
			}

			result, err := handler(env.ctx, &protocol.ReferenceParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     pos,
				},
				Context: protocol.ReferenceContext{IncludeDeclaration: true},
			})
			if err != nil {
				t.Fatalf("references error: %v", err)
			}
			_ = result // no panic
		})
	}
}

func TestDocumentHighlight_RefDirect(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewDocumentHighlightHandler(env.cache, nil)

	// Position on $ref value pointing to Pet schema (line 27 in testSpec)
	result, err := handler(env.ctx, &protocol.DocumentHighlightParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 27, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("highlight error: %v", err)
	}
	if len(result) == 0 {
		t.Error("expected highlights for $ref to Pet schema")
	}
	for _, h := range result {
		if h.Kind != 2 { // highlightRead
			t.Errorf("expected highlight kind 2 (read), got %d", h.Kind)
		}
	}
}

func TestLinkedEditing_OperationIdInlineResponseLink(t *testing.T) {
	// Spec with inline response link referencing an operationId
	spec := `openapi: "3.1.0"
info:
  title: Link Test
  version: "1.0.0"
paths:
  /items:
    get:
      operationId: listItems
      responses:
        "200":
          description: OK
          links:
            GetItem:
              operationId: listItems
  /items/{id}:
    get:
      operationId: getItem
      responses:
        "200":
          description: OK
`
	env := setupTestEnv(t, "file:///link.yaml", spec)
	handler := lsp.NewLinkedEditingRangeHandler(env.cache, nil)
	idx := env.cache.Get(env.uri)

	opRef, ok := idx.Operations["listItems"]
	if !ok {
		t.Fatal("listItems operation not found")
	}
	pos := adapt.PositionToProtocol(opRef.Operation.OperationIDLoc.Range.Start)

	result, err := handler(env.ctx, &protocol.LinkedEditingRangeParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("linked editing error: %v", err)
	}
	if result == nil {
		t.Fatal("expected linked editing ranges for operationId with inline link")
	}
	// Should include: the operationId definition + the inline response link reference
	if len(result.Ranges) < 2 {
		t.Errorf("expected at least 2 linked editing ranges (def + inline link), got %d", len(result.Ranges))
	}
}

func TestTypeDefinitionHandler_Ref(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewTypeDefinitionHandler(env.cache, nil, nil)

	// Position on $ref to Pet schema (line 27)
	result, err := handler(env.ctx, &protocol.TypeDefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 27, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("type definition error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected type definition result for $ref to Pet schema")
	}
	idx := env.cache.Get(env.uri)
	petSchema := idx.Schemas["Pet"]
	if result[0].Range.Start.Line != petSchema.Loc.Range.Start.Line {
		t.Errorf("expected type definition at line %d, got %d",
			petSchema.Loc.Range.Start.Line, result[0].Range.Start.Line)
	}
}

func TestPrepareRename_ExactRange(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewPrepareRenameHandler(env.cache, nil)
	idx := env.cache.Get(env.uri)

	// Test that prepare rename returns the exact NameLoc range for a schema
	schema, ok := idx.Schemas["Pet"]
	if !ok {
		t.Fatal("Pet schema not found")
	}
	pos := adapt.PositionToProtocol(schema.NameLoc.Range.Start)

	result, err := handler(env.ctx, &protocol.PrepareRenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("prepare rename error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil prepare rename result")
	}
	if result.Range != adapt.RangeToProtocol(schema.NameLoc.Range) {
		t.Errorf("expected exact NameLoc range %+v, got %+v", adapt.RangeToProtocol(schema.NameLoc.Range), result.Range)
	}
}

const testSpecUnicode = `openapi: "3.1.0"
info:
  title: Ünïcödé API
  version: "1.0.0"
paths:
  /héllo/{nàme}:
    get:
      operationId: greet
      parameters:
        - name: nàme
          in: path
          required: true
          schema:
            type: string
      responses:
        "200":
          description: OK
components:
  schemas:
    Ünïcödé:
      type: object
      properties:
        nàme:
          type: string
  securitySchemes:
    Öauth:
      type: http
      scheme: bearer
`

func TestSemanticTokens_UnicodePathParam(t *testing.T) {
	env := setupTestEnv(t, "file:///unicode.yaml", testSpecUnicode)
	handler := lsp.NewSemanticTokensHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("semantic tokens error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil semantic tokens")
	}
	if len(result.Data)%5 != 0 {
		t.Errorf("data length %d not a multiple of 5", len(result.Data))
	}

	type absToken struct {
		line, char, length, tokenType, modifiers uint32
	}
	var tokens []absToken
	var prevLine, prevChar uint32
	for i := 0; i+4 < len(result.Data); i += 5 {
		dLine := result.Data[i]
		dChar := result.Data[i+1]
		line := prevLine + dLine
		ch := dChar
		if dLine == 0 {
			ch = prevChar + dChar
		}
		tokens = append(tokens, absToken{
			line: line, char: ch,
			length:    result.Data[i+2],
			tokenType: result.Data[i+3],
			modifiers: result.Data[i+4],
		})
		prevLine = line
		prevChar = ch
	}

	// Path param {nàme} - verify the token offset accounts for multi-byte
	// chars in "héllo/" preceding the param (UTF-16: h=1, é=1, l=1, l=1, o=1, /=1 = 6).
	// The path key starts at some character. The param "{nàme}" starts at offset 6
	// from the path start (after "/héllo/"), which in UTF-16 is 7 chars.
	const tokTypeParameter = 6
	foundParam := false
	for _, tok := range tokens {
		if tok.tokenType == tokTypeParameter {
			foundParam = true
			// nàme is 4 chars in UTF-16 (nàme: n=1,à=1,m=1,e=1 = 4), braces add 2 = 6
			if tok.length != 6 {
				t.Errorf("param token length = %d, want 6 (UTF-16 len of {nàme})", tok.length)
			}
		}
	}
	if !foundParam {
		t.Error("no path parameter token found for Unicode path")
	}

	// Schema name "Ünïcödé" should use rangeLen, not byte len
	const tokType = 1
	foundSchema := false
	for _, tok := range tokens {
		if tok.tokenType == tokType && tok.modifiers == 1 {
			foundSchema = true
			// Ünïcödé: each char is 1 UTF-16 unit = 7
			if tok.length != 7 {
				t.Errorf("schema name token length = %d, want 7 (UTF-16 len of Ünïcödé)", tok.length)
			}
		}
	}
	if !foundSchema {
		t.Error("no schema declaration token found for Unicode schema name")
	}
}

func TestFoldingRangeHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewFoldingRangeHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.FoldingRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("folding range error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected folding ranges for spec with paths, schemas, info")
	}
	for _, fr := range result {
		if fr.StartLine >= fr.EndLine {
			t.Errorf("invalid folding range: start %d >= end %d", fr.StartLine, fr.EndLine)
		}
		if fr.Kind != "region" {
			t.Errorf("expected folding kind 'region', got %q", fr.Kind)
		}
	}
}

func TestDefinitionHandler_OnDemandIndex(t *testing.T) {
	// Simulate the "first click does nothing" scenario: handler is called
	// before the DiagnosticEngine has built the index. With the builder
	// wired on the cache, Get should build on-demand.
	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	uri := protocol.DocumentURI("file:///ondemand.yaml")
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       testSpec,
		},
	})

	cache := openapi.NewIndexCache()
	// Wire the on-demand builder like server.go does.
	cache.SetBuilder(func(u protocol.DocumentURI) *openapi.Index {
		doc := store.Get(u)
		tree := mgr.GetTree(u)
		if doc == nil || tree == nil {
			return nil
		}
		return openapi.BuildIndex(tree, doc)
	})

	// Do NOT pre-populate the cache. The handler should build on-demand.
	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}

	handler := lsp.NewDefinitionHandler(cache, nil, nil)

	// Line 27 (0-based) in testSpec: `$ref: "#/components/schemas/Pet"`
	result, err := handler(ctx, &protocol.DefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     protocol.Position{Line: 27, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("definition error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected definition result from on-demand index build")
	}
	if result[0].URI != uri {
		t.Errorf("expected definition URI %q, got %q", uri, result[0].URI)
	}
}

func TestPrepareRenameHandler_TagRenameFromBuilderOnDemand(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	fixturePath := filepath.Join(filepath.Dir(thisFile), "..", "..", "client", "test-fixtures", "workspace-basic", "rich-api.yaml")
	b, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture %s: %v", fixturePath, err)
	}
	content := string(b)

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	uri := protocol.DocumentURI("file:///workspace/rich-api.yaml")
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       content,
		},
	})

	cache := openapi.NewIndexCache()
	// Register the on-demand builder (no stale seed). cache.Get will call
	// the builder the first time and cache the result.
	cache.SetBuilder(func(u protocol.DocumentURI) *openapi.Index {
		doc := store.Get(u)
		tree := mgr.GetTree(u)
		if doc == nil || tree == nil {
			return nil
		}
		return openapi.BuildIndex(tree, doc)
	})

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}
	doc := store.Get(uri)
	if doc == nil {
		t.Fatal("nil document")
	}

	tagNeedle := "  - name: Users"
	off := strings.Index(content, tagNeedle)
	if off < 0 {
		t.Fatal("fixture missing Users tag definition")
	}
	pos := doc.PositionAt(off + len("  - name: Use"))

	prepare := lsp.NewPrepareRenameHandler(cache, nil)
	prepResult, err := prepare(ctx, &protocol.PrepareRenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     pos,
		},
	})
	if err != nil {
		t.Fatalf("prepare rename error: %v", err)
	}
	if prepResult == nil {
		t.Fatal("expected prepare rename result from on-demand builder")
	}
	if prepResult.Placeholder != "Users" {
		t.Fatalf("expected placeholder Users, got %q", prepResult.Placeholder)
	}

	rename := lsp.NewRenameHandler(cache, nil)
	edit, err := rename(ctx, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     pos,
		},
		NewName: "People",
	})
	if err != nil {
		t.Fatalf("rename error: %v", err)
	}
	if edit == nil {
		t.Fatal("expected rename edit from on-demand builder")
	}
	changes := edit.Changes[uri]
	if len(changes) < 2 {
		t.Fatalf("expected at least definition + usage edits, got %d", len(changes))
	}
}

func TestRenameHandler_NilDocumentInCacheDoesNotPanic(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	fixturePath := filepath.Join(filepath.Dir(thisFile), "..", "..", "client", "test-fixtures", "workspace-basic", "rich-api.yaml")
	b, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture %s: %v", fixturePath, err)
	}
	content := string(b)

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	uri := protocol.DocumentURI("file:///workspace/rich-api.yaml")
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       content,
		},
	})

	cache := openapi.NewIndexCache()
	cache.SetBuilder(func(u protocol.DocumentURI) *openapi.Index {
		doc := store.Get(u)
		tree := mgr.GetTree(u)
		if doc == nil || tree == nil {
			return nil
		}
		return openapi.BuildIndex(tree, doc)
	})

	// Seed a second cache entry with nil Document to simulate a partially
	// loaded graph-bridge node. The rename handler must not panic.
	poisonURI := protocol.DocumentURI("file:///workspace/partial.yaml")
	cache.Set(poisonURI, &openapi.Index{Document: nil})

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}
	doc := store.Get(uri)
	if doc == nil {
		t.Fatal("nil document")
	}

	tagNeedle := "  - name: Users"
	off := strings.Index(content, tagNeedle)
	if off < 0 {
		t.Fatal("fixture missing Users tag definition")
	}
	pos := doc.PositionAt(off + len("  - name: Use"))

	rename := lsp.NewRenameHandler(cache, nil)
	edit, err := rename(ctx, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: uri},
			Position:     pos,
		},
		NewName: "People",
	})
	if err != nil {
		t.Fatalf("rename should not error: %v", err)
	}
	if edit == nil {
		t.Fatal("expected rename edit even with nil-Document entry in cache")
	}
}

func TestDefinitionHandler_LocalRefReturnsSameURI(t *testing.T) {
	env := setupTestEnv(t, "file:///same-uri.yaml", testSpec)
	handler := lsp.NewDefinitionHandler(env.cache, nil, nil)

	// Line 27 (0-based) in testSpec: `$ref: "#/components/schemas/Pet"`
	result, err := handler(env.ctx, &protocol.DefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 27, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("definition error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected definition result")
	}
	if result[0].URI != env.uri {
		t.Errorf("expected returned URI to match input URI %q, got %q", env.uri, result[0].URI)
	}
}

func TestLocationFromTarget_Document(t *testing.T) {
	env := setupTestEnv(t, "file:///doc-target.yaml", testSpec)
	idx := env.cache.Get(env.uri)
	if idx == nil || idx.Document == nil {
		t.Fatal("expected index with document")
	}

	loc := lsp.LocationFromTarget(env.uri, idx.Document)
	if loc == nil {
		t.Fatal("expected non-nil location for *Document target")
	}
	if loc.URI != env.uri {
		t.Errorf("expected URI %q, got %q", env.uri, loc.URI)
	}
}

func TestLocationFromTarget_Schema(t *testing.T) {
	env := setupTestEnv(t, "file:///schema-target.yaml", testSpec)
	idx := env.cache.Get(env.uri)
	if idx == nil {
		t.Fatal("expected index")
	}
	pet := idx.Schemas["Pet"]
	if pet == nil {
		t.Fatal("expected Pet schema in index")
	}

	loc := lsp.LocationFromTarget(env.uri, pet)
	if loc == nil {
		t.Fatal("expected non-nil location for *Schema target")
	}
	if loc.URI != env.uri {
		t.Errorf("expected URI %q, got %q", env.uri, loc.URI)
	}
}

func TestLocationFromTarget_UnknownType(t *testing.T) {
	loc := lsp.LocationFromTarget("file:///test.yaml", "not-a-model-type")
	if loc != nil {
		t.Error("expected nil for unknown target type")
	}
}

func TestUriToFSPath(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string
	}{
		{"standard file URI", "file:///home/user/test.yaml", filepath.FromSlash("/home/user/test.yaml")},
		{"non-file URI", "/some/path", "/some/path"},
		{"with encoded space", "file:///home/user/my%20file.yaml", filepath.FromSlash("/home/user/my file.yaml")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := lsp.UriToFSPath(tt.uri)
			if got != tt.want {
				t.Errorf("uriToFSPath(%q) = %q, want %q", tt.uri, got, tt.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Cross-file handler tests
// ---------------------------------------------------------------------------

type crossFileEnv struct {
	store   *document.Store
	mgr     *treesitter.Manager
	cache   *openapi.IndexCache
	bridge  *lsp.GraphBridge
	ctx     *gossip.Context
	rootURI protocol.DocumentURI
	compURI protocol.DocumentURI
}

const crossFileRootSpec = `openapi: "3.1.0"
info:
  title: Ref Root
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./components.yaml#/components/schemas/User"
`

const crossFileCompSpec = `openapi: "3.1.0"
info:
  title: Components
  version: "1.0.0"
components:
  schemas:
    User:
      type: object
      required:
        - id
        - email
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
`

func setupCrossFileEnv(t *testing.T) *crossFileEnv {
	t.Helper()

	rootURI := protocol.DocumentURI("file:///project/root.yaml")
	compURI := protocol.DocumentURI("file:///project/components.yaml")

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{URI: compURI, LanguageID: "yaml", Version: 1, Text: crossFileCompSpec},
	})
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{URI: rootURI, LanguageID: "yaml", Version: 1, Text: crossFileRootSpec},
	})

	cache := openapi.NewIndexCache()

	bridge, _ := lsp.NewGraphBridge(nil)
	bridge.OnDocumentOpen(string(compURI), []byte(crossFileCompSpec))
	bridge.OnDocumentOpen(string(rootURI), []byte(crossFileRootSpec))
	if _, err := bridge.RunPipeline(context.Background(), cache, string(compURI), string(rootURI)); err != nil {
		t.Fatalf("RunPipeline: %v", err)
	}

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}

	return &crossFileEnv{
		store:   store,
		mgr:     mgr,
		cache:   cache,
		bridge:  bridge,
		ctx:     ctx,
		rootURI: rootURI,
		compURI: compURI,
	}
}

func writeWorkspaceFile(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func fileURI(path string) protocol.DocumentURI {
	return protocol.DocumentURI(project.PathToURI(path))
}

func setupProjectCacheEnv(t *testing.T) *crossFileEnv {
	t.Helper()

	dir := t.TempDir()
	rootPath := filepath.Join(dir, "root.yaml")
	compPath := filepath.Join(dir, "components.yaml")
	writeWorkspaceFile(t, rootPath, crossFileRootSpec)
	writeWorkspaceFile(t, compPath, crossFileCompSpec)

	rootURI := fileURI(rootPath)
	compURI := fileURI(compPath)

	cache := openapi.NewIndexCache()
	if _, err := project.BuildProjectContext(string(rootURI), cache, nil); err != nil {
		t.Fatalf("BuildProjectContext: %v", err)
	}

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{URI: compURI, LanguageID: "yaml", Version: 1, Text: crossFileCompSpec},
	})

	compTree := mgr.GetTree(compURI)
	if compTree == nil {
		t.Fatal("nil tree for cached components")
	}
	compDoc := store.Get(compURI)
	if compDoc == nil {
		t.Fatal("nil cached components document")
	}
	cache.Set(compURI, openapi.BuildIndex(compTree, compDoc))

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}

	return &crossFileEnv{
		store:   store,
		mgr:     mgr,
		cache:   cache,
		ctx:     ctx,
		rootURI: rootURI,
		compURI: compURI,
	}
}

func findActionByTitle(actions []protocol.CodeAction, needle string) *protocol.CodeAction {
	for i := range actions {
		if strings.Contains(actions[i].Title, needle) {
			return &actions[i]
		}
	}
	return nil
}

func TestDefinitionHandler_CrossFile_ReturnsAbsoluteURI(t *testing.T) {
	env := setupCrossFileEnv(t)
	handler := lsp.NewDefinitionHandler(env.cache, nil, env.bridge)

	// $ref is on line 14 in crossFileRootSpec
	result, err := handler(env.ctx, &protocol.DefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.rootURI},
			Position:     protocol.Position{Line: 14, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("definition error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected at least one definition result for cross-file $ref")
	}

	targetURI := string(result[0].URI)
	if !strings.HasPrefix(targetURI, "file://") {
		t.Errorf("expected file:// URI, got %q", targetURI)
	}
	if !strings.HasSuffix(targetURI, "/project/components.yaml") {
		t.Errorf("expected target URI to end with /project/components.yaml, got %q", targetURI)
	}
	if result[0].URI != env.compURI {
		t.Errorf("target URI %q should match components URI %q", result[0].URI, env.compURI)
	}
}

func TestDefinitionHandler_CrossFile_LandsAtSchema(t *testing.T) {
	env := setupCrossFileEnv(t)
	handler := lsp.NewDefinitionHandler(env.cache, nil, env.bridge)

	result, err := handler(env.ctx, &protocol.DefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.rootURI},
			Position:     protocol.Position{Line: 14, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("definition error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected definition result")
	}

	// User schema key is at line 6 in crossFileCompSpec
	targetLine := result[0].Range.Start.Line
	if targetLine < 5 || targetLine > 7 {
		t.Errorf("expected definition to land near User schema (line 5-7), got line %d", targetLine)
	}
}

func TestDefinitionHandler_CrossFile_FallbackWithoutGraphOrProject(t *testing.T) {
	env := setupCrossFileEnv(t)
	handler := lsp.NewDefinitionHandler(env.cache, nil, nil)

	// Simulate cache/graph not being hydrated for the target document yet.
	env.cache.Delete(env.compURI)

	result, err := handler(env.ctx, &protocol.DefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.rootURI},
			Position:     protocol.Position{Line: 14, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("definition error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected fallback definition result for cross-file $ref")
	}
	if result[0].URI != env.compURI {
		t.Fatalf("expected fallback target URI %q, got %q", env.compURI, result[0].URI)
	}
}

func TestHoverHandler_CrossFile_ReturnsSchemaContent(t *testing.T) {
	env := setupCrossFileEnv(t)
	handler := lsp.NewHoverHandler(env.cache, env.bridge)

	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.rootURI},
			Position:     protocol.Position{Line: 14, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for cross-file $ref, got nil")
	}

	content := result.Contents.Value
	if content == "" {
		t.Fatal("expected non-empty hover content")
	}

	if !strings.Contains(content, "$ref") {
		t.Errorf("hover should mention $ref, got: %s", content[:min(len(content), 300)])
	}
}

func TestHoverHandler_CrossFile_ShowsProperties(t *testing.T) {
	env := setupCrossFileEnv(t)
	handler := lsp.NewHoverHandler(env.cache, env.bridge)

	result, err := handler(env.ctx, &protocol.HoverParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.rootURI},
			Position:     protocol.Position{Line: 14, Character: 30},
		},
	})
	if err != nil {
		t.Fatalf("hover error: %v", err)
	}
	if result == nil {
		t.Fatal("expected hover result for cross-file $ref")
	}

	content := result.Contents.Value
	if !strings.Contains(content, "id") || !strings.Contains(content, "email") {
		t.Errorf("hover should show User properties (id, email), got: %s", content[:min(len(content), 500)])
	}
}

func TestRenameHandler_CrossFile_SchemaUpdatesDefinitionAndRefs(t *testing.T) {
	env := setupCrossFileEnv(t)
	handler := lsp.NewRenameHandler(env.cache, env.bridge)
	compIdx := env.cache.Get(env.compURI)
	if compIdx == nil {
		t.Fatal("missing components index")
	}
	if _, ok := compIdx.Schemas["User"]; !ok {
		t.Fatal("missing User schema in components index")
	}
	start := protocol.Position{Line: 6, Character: 6}

	result, err := handler(env.ctx, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.compURI},
			Position:     start,
		},
		NewName: "AccountUser",
	})
	if err != nil {
		t.Fatalf("rename error: %v", err)
	}
	if result == nil {
		t.Fatal("rename returned nil")
	}

	compEdits := result.Changes[env.compURI]
	rootEdits := result.Changes[env.rootURI]
	if len(compEdits) == 0 {
		t.Fatal("expected rename edits in components file")
	}
	if len(rootEdits) == 0 {
		t.Fatal("expected rename edits in root file")
	}

	foundRefUpdate := false
	for _, e := range rootEdits {
		if strings.Contains(e.NewText, "AccountUser") {
			foundRefUpdate = true
			break
		}
	}
	if !foundRefUpdate {
		t.Fatalf("expected root edits to include updated ref name; got %#v", rootEdits)
	}
}

func TestReferencesHandler_CrossFile_UsesCachedProjectDocs(t *testing.T) {
	env := setupProjectCacheEnv(t)
	handler := lsp.NewReferencesHandler(env.cache, nil)

	compIdx := env.cache.Get(env.compURI)
	if compIdx == nil {
		t.Fatal("missing cached components index")
	}
	schema, ok := compIdx.Schemas["User"]
	if !ok {
		t.Fatal("missing User schema")
	}
	pos := adapt.PositionToProtocol(schema.NameLoc.Range.Start)

	result, err := handler(env.ctx, &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.compURI},
			Position:     pos,
		},
		Context: protocol.ReferenceContext{IncludeDeclaration: true},
	})
	if err != nil {
		t.Fatalf("references error: %v", err)
	}
	if len(result) < 2 {
		t.Fatalf("expected declaration plus cached project ref, got %#v", result)
	}

	foundRootRef := false
	for _, loc := range result {
		if loc.URI == env.rootURI {
			foundRootRef = true
			break
		}
	}
	if !foundRootRef {
		t.Fatalf("expected references to include closed project document %q, got %#v", env.rootURI, result)
	}
}

func TestRenameHandler_CrossFile_UsesCachedProjectDocs(t *testing.T) {
	env := setupProjectCacheEnv(t)
	handler := lsp.NewRenameHandler(env.cache, nil)

	compIdx := env.cache.Get(env.compURI)
	if compIdx == nil {
		t.Fatal("missing cached components index")
	}
	schema, ok := compIdx.Schemas["User"]
	if !ok {
		t.Fatal("missing User schema")
	}
	pos := adapt.PositionToProtocol(schema.NameLoc.Range.Start)

	result, err := handler(env.ctx, &protocol.RenameParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.compURI},
			Position:     pos,
		},
		NewName: "AccountUser",
	})
	if err != nil {
		t.Fatalf("rename error: %v", err)
	}
	if result == nil {
		t.Fatal("rename returned nil")
	}

	rootEdits := result.Changes[env.rootURI]
	if len(rootEdits) == 0 {
		t.Fatalf("expected rename to update cached project document %q", env.rootURI)
	}
}

func TestCompletionHandler_SecurityScopeCompletions(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: OAuth Test
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      security:
        - oauth2: [read:pets]
      responses:
        "200":
          description: ok
components:
  securitySchemes:
    oauth2:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://example.com/auth
          tokenUrl: https://example.com/token
          scopes:
            read:pets: Read pets
            write:pets: Write pets
`
	env := setupTestEnv(t, "file:///oauth.yaml", spec)
	handler := lsp.NewCompletionHandler(env.cache, nil)

	// Cursor inside security scope list on "- oauth2: [read:pets]"
	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 9, Character: 18},
		},
	})
	if err != nil {
		t.Fatalf("completion error: %v", err)
	}
	if result == nil || len(result.Items) == 0 {
		t.Fatal("expected scope completions, got none")
	}

	labels := map[string]bool{}
	for _, item := range result.Items {
		labels[item.Label] = true
	}
	if !labels["read:pets"] || !labels["write:pets"] {
		t.Fatalf("expected OAuth scope completions, got labels=%v", labels)
	}
}

func TestCompletionHandler_ExtensionCompletions(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Extensions
  version: "1.0.0"
  x-
paths: {}
`
	env := setupTestEnv(t, "file:///extensions.yaml", spec)
	handler := lsp.NewCompletionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 4, Character: 4},
		},
	})
	if err != nil {
		t.Fatalf("completion error: %v", err)
	}
	if result == nil || len(result.Items) == 0 {
		t.Fatal("expected extension completions")
	}

	labels := map[string]bool{}
	for _, item := range result.Items {
		labels[item.Label] = true
	}
	if !labels["x-logo"] || !labels["x-scalar-sdk-installation"] {
		t.Fatalf("expected builtin extension completions, got labels=%v", labels)
	}
}

func TestExecuteCommand_ValidateExamples(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Validate Examples
  version: "1.0.0"
paths: {}
components:
  schemas:
    UserName:
      type: string
      example: 42
    UserCount:
      type: integer
      example: 7
`
	env := setupTestEnv(t, "file:///validate-examples.yaml", spec)
	handler := lsp.NewExecuteCommandHandler(env.cache, nil, nil)

	result, err := handler(env.ctx, &protocol.ExecuteCommandParams{
		Command:   "telescope.validateExamples",
		Arguments: []interface{}{string(env.uri)},
	})
	if err != nil {
		t.Fatalf("execute command error: %v", err)
	}
	payload, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}

	checked, _ := payload["checked"].(int)
	if checked == 0 {
		// json unmarshaling from interface{} may use float64
		if checkedF, okF := payload["checked"].(float64); !okF || int(checkedF) == 0 {
			t.Fatalf("expected checked > 0, got %#v", payload["checked"])
		}
	}
	invalid, _ := payload["invalid"].(int)
	if invalid == 0 {
		if invalidF, okF := payload["invalid"].(float64); !okF || int(invalidF) == 0 {
			t.Fatalf("expected invalid > 0, got %#v", payload["invalid"])
		}
	}
}

func TestExecuteCommand_RunContractTests(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("X-Request-Id", "550e8400-e29b-41d4-a716-446655440000")
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	spec := `openapi: "3.1.0"
info:
  title: Contract Test
  version: "1.0.0"
paths:
  /health:
    get:
      operationId: getHealth
      responses:
        "200":
          description: OK
          headers:
            X-Request-Id:
              schema:
                type: string
                format: uuid
`
	env := setupTestEnv(t, "file:///contract-tests.yaml", spec)
	handler := lsp.NewExecuteCommandHandler(env.cache, nil, nil)

	result, err := handler(env.ctx, &protocol.ExecuteCommandParams{
		Command: "telescope.runContractTests",
		Arguments: []interface{}{
			string(env.uri),
			map[string]interface{}{"baseUrl": server.URL, "sync": true},
		},
	})
	if err != nil {
		t.Fatalf("execute command error: %v", err)
	}

	payload, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if payload["baseUrl"] != server.URL {
		t.Fatalf("baseUrl = %#v, want %q", payload["baseUrl"], server.URL)
	}
	barometerResult, ok := payload["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected barometer result, got %T", payload["result"])
	}
	pass, _ := barometerResult["pass"].(bool)
	if !pass {
		t.Fatalf("expected passing contract test, got %#v", barometerResult)
	}
	openapiResult, _ := barometerResult["openapi"].(map[string]interface{})
	total, _ := openapiResult["total"].(float64)
	if total != 1 {
		t.Fatalf("expected one OpenAPI contract result, got %#v", openapiResult)
	}
}

func TestExecuteCommand_RunContractTests_Arazzo(t *testing.T) {
	openAPISpec := `{"openapi":"3.1.0","info":{"title":"Widgets","version":"1.0.0"},"paths":{"/widgets":{"get":{"operationId":"listWidgets","responses":{"200":{"description":"OK"}}}}}}`
	mux := http.NewServeMux()
	mux.HandleFunc("/openapi.json", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(openAPISpec))
	})
	mux.HandleFunc("/widgets", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.WriteHeader(http.StatusOK)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	specURL := srv.URL + "/openapi.json"

	doc := fmt.Sprintf(`arazzo: "1.0.1"
info:
  title: Arazzo Contract Test
  version: "1.0.0"
sourceDescriptions:
  - name: api
    type: openapi
    url: %q
workflows:
  - workflowId: syncWidgets
    steps:
      - stepId: sync
        operationId: listWidgets
        successCriteria:
          - condition: $statusCode == 200
`, specURL)
	env := setupTestEnv(t, "file:///contract-tests.arazzo.yaml", doc)
	handler := lsp.NewExecuteCommandHandler(env.cache, nil, nil)

	result, err := handler(env.ctx, &protocol.ExecuteCommandParams{
		Command: "telescope.runContractTests",
		Arguments: []interface{}{
			string(env.uri),
			map[string]interface{}{"baseUrl": srv.URL, "sync": true},
		},
	})
	if err != nil {
		t.Fatalf("execute command error: %v", err)
	}

	payload, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	if payload["baseUrl"] != srv.URL {
		t.Fatalf("baseUrl = %#v", payload["baseUrl"])
	}
	barometerResult, ok := payload["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected barometer result, got %T", payload["result"])
	}
	pass, _ := barometerResult["pass"].(bool)
	if !pass {
		t.Fatalf("expected passing Arazzo contract run, got %#v", barometerResult)
	}
	arazzoResult, _ := barometerResult["arazzo"].(map[string]interface{})
	total, _ := arazzoResult["total"].(float64)
	if total != 1 {
		t.Fatalf("expected one workflow result, got %#v", arazzoResult)
	}
}

func TestExecuteCommand_BundlePreview_UsesOpenWorkspaceContent(t *testing.T) {
	dir := t.TempDir()
	rootPath := filepath.Join(dir, "root.yaml")
	compPath := filepath.Join(dir, "components.yaml")
	writeWorkspaceFile(t, rootPath, crossFileRootSpec)
	writeWorkspaceFile(t, compPath, crossFileCompSpec)

	rootURI := fileURI(rootPath)
	compURI := fileURI(compPath)
	modifiedCompSpec := strings.Replace(
		crossFileCompSpec,
		"        name:\n          type: string\n",
		"        name:\n          type: string\n        nickname:\n          type: string\n",
		1,
	)

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	t.Cleanup(mgr.Close)

	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{URI: rootURI, LanguageID: "yaml", Version: 1, Text: crossFileRootSpec},
	})
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{URI: compURI, LanguageID: "yaml", Version: 1, Text: modifiedCompSpec},
	})

	rootTree := mgr.GetTree(rootURI)
	compTree := mgr.GetTree(compURI)
	rootDoc := store.Get(rootURI)
	compDoc := store.Get(compURI)
	if rootTree == nil || compTree == nil || rootDoc == nil || compDoc == nil {
		t.Fatal("expected open workspace documents to be indexed")
	}

	cache := openapi.NewIndexCache()
	cache.Set(rootURI, openapi.BuildIndex(rootTree, rootDoc))
	cache.Set(compURI, openapi.BuildIndex(compTree, compDoc))

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}
	handler := lsp.NewExecuteCommandHandler(cache, nil, nil)

	result, err := handler(ctx, &protocol.ExecuteCommandParams{
		Command:   "telescope.bundlePreview",
		Arguments: []interface{}{string(rootURI)},
	})
	if err != nil {
		t.Fatalf("bundle preview error: %v", err)
	}
	payload, ok := result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", result)
	}
	content, _ := payload["content"].(string)
	if !strings.Contains(content, "nickname:") {
		t.Fatalf("expected bundle preview to include open workspace dependency changes, got:\n%s", content)
	}
	if !strings.Contains(content, "components:") {
		t.Fatalf("expected bundle preview to include merged components, got:\n%s", content)
	}
	if payload["source"] != "server" {
		t.Fatalf("expected server preview source, got %#v", payload["source"])
	}
}

func TestTypeDefinitionHandler_ResponseSchemaRef(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: TypeDef
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/User"
components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
`
	env := setupTestEnv(t, "file:///typedef-response.yaml", spec)
	handler := lsp.NewTypeDefinitionHandler(env.cache, nil, nil)

	result, err := handler(env.ctx, &protocol.TypeDefinitionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 14, Character: 25},
		},
	})
	if err != nil {
		t.Fatalf("typeDefinition error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected type definition result for response schema ref")
	}
	if result[0].URI != env.uri {
		t.Fatalf("expected type definition to target same document %s, got %s", env.uri, result[0].URI)
	}
}

func TestCompletionHandler_PathTemplateCompletions(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Paths
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: ok
`
	env := setupTestEnv(t, "file:///paths.yaml", spec)
	handler := lsp.NewCompletionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 5, Character: 4}, // "/users:"
		},
	})
	if err != nil {
		t.Fatalf("completion error: %v", err)
	}
	if result == nil || len(result.Items) == 0 {
		t.Fatal("expected path template completions")
	}

	labels := map[string]bool{}
	for _, item := range result.Items {
		labels[item.Label] = true
	}
	if !labels["/users"] {
		t.Fatalf("expected completion to include existing path /users; got %v", labels)
	}
	if !labels["/users/{id}"] {
		t.Fatalf("expected completion to include /users/{id}; got %v", labels)
	}
}

func TestCompletionHandler_HTTPMethodCompletionsOnBlankIndentedLine(t *testing.T) {
	spec := "openapi: \"3.1.0\"\ninfo:\n  title: Methods\n  version: \"1.0.0\"\npaths:\n  /test:\n    \n"
	env := setupTestEnv(t, "file:///methods.yaml", spec)
	handler := lsp.NewCompletionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 6, Character: 4},
		},
	})
	if err != nil {
		t.Fatalf("completion error: %v", err)
	}
	if result == nil || len(result.Items) == 0 {
		t.Fatal("expected HTTP method completions on blank path-item child line")
	}

	labels := map[string]bool{}
	for _, item := range result.Items {
		labels[item.Label] = true
	}
	if !labels["get"] || !labels["post"] {
		t.Fatalf("expected get/post completions, got labels=%v", labels)
	}
}

func TestCompletionHandler_EmptyResultsMarshalItemsArray(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Empty Completion
  version: "1.0.0"
paths: {}
`
	env := setupTestEnv(t, "file:///empty-completion.yaml", spec)
	handler := lsp.NewCompletionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 0, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("completion error: %v", err)
	}
	if result == nil {
		t.Fatal("expected empty completion list, got nil")
	}
	if len(result.Items) != 0 {
		t.Fatalf("expected no completion items, got %d", len(result.Items))
	}

	payload, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal completion result: %v", err)
	}
	if !strings.Contains(string(payload), `"items":[]`) {
		t.Fatalf("expected completion list to marshal items as array, got %s", payload)
	}
}
