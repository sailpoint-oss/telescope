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

func TestCodeLensHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewCodeLensHandler(env.cache)

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
		if lens.Command != nil && lens.Command.Command == "editor.action.showReferences" {
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
	handler := lsp.NewPrepareCallHierarchyHandler(env.cache)

	// Position on "Pet" schema name in components
	idx := env.cache.Get(env.uri)
	var petNamePos protocol.Position
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNamePos = schema.NameLoc.Range.Start
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
	handler := lsp.NewPrepareCallHierarchyHandler(env.cache)

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
	prepareHandler := lsp.NewPrepareCallHierarchyHandler(env.cache)
	incomingHandler := lsp.NewCallHierarchyIncomingHandler(env.cache)

	// First prepare to get a valid CallHierarchyItem for Pet
	idx := env.cache.Get(env.uri)
	var petNamePos protocol.Position
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNamePos = schema.NameLoc.Range.Start
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
	handler := lsp.NewSemanticTokensHandler(env.cache)

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

func TestDocumentSymbolHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewSymbolHandler(env.cache)

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
	handler := lsp.NewReferencesHandler(env.cache)

	// Position on "Pet" schema name
	idx := env.cache.Get(env.uri)
	var petNamePos protocol.Position
	if schema, ok := idx.Schemas["Pet"]; ok {
		petNamePos = schema.NameLoc.Range.Start
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
	handler := lsp.NewReferencesHandler(env.cache)

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
	handler := lsp.NewInlayHintHandler(env.cache)

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
	handler := lsp.NewInlayHintHandler(env.cache)

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

func TestFoldingRangeHandler(t *testing.T) {
	env := setupTestEnv(t, "file:///test.yaml", testSpec)
	handler := lsp.NewFoldingRangeHandler(env.cache)

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
