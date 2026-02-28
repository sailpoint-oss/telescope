package lsp_test

import (
	"context"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/openapi"
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
	handler := lsp.NewRenameHandler(env.cache)

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

func TestRenameHandler_Schema(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewRenameHandler(env.cache)

	// Position on "Pet" schema name in components
	idx := env.cache.Get(env.uri)
	var petNameRange protocol.Range
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNameRange = schema.NameLoc.Range
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
	handler := lsp.NewPrepareRenameHandler(env.cache)

	tests := []struct {
		name     string
		pos      protocol.Position
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
	handler := lsp.NewCompletionHandler(env.cache)

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
	handler := lsp.NewCodeActionHandler(env.cache)

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

func TestDocumentLinkHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewDocumentLinkHandler(env.cache)

	result, err := handler(env.ctx, &protocol.DocumentLinkParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("document link error: %v", err)
	}
	if len(result) == 0 {
		t.Error("expected document links for $ref in spec")
	}
	for _, link := range result {
		if link.Target == nil {
			t.Error("link has nil target")
		}
		if link.Tooltip == "" {
			t.Error("link has empty tooltip")
		}
	}
}

func TestFormattingHandler_YAML(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewFormattingHandler(env.cache)

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
	// YAML formatting may return nil if no changes needed
	_ = result
}

func TestHoverHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewHoverHandler(env.cache)

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
	handler := lsp.NewDefinitionHandler(env.cache)

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

func TestNilIndex(t *testing.T) {
	store := document.NewStore()
	cache := openapi.NewIndexCache()
	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}
	uri := protocol.DocumentURI("file:///nonexistent.yaml")

	hoverHandler := lsp.NewHoverHandler(cache)
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

	completionHandler := lsp.NewCompletionHandler(cache)
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
