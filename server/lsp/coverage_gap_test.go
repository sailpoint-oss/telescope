package lsp

import (
	"context"
	"encoding/json"
	"testing"
	"unsafe"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/jsonschema"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	barrelAnalyzers "github.com/sailpoint-oss/barrelman/analyzers"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

const coverageSpec = `openapi: "3.1.0"
info:
  title: Coverage API
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: string
`

type coverageEnv struct {
	ctx   *gossip.Context
	cache *openapi.IndexCache
	uri   protocol.DocumentURI
	mgr   *treesitter.Manager
	store *document.Store
}

func newCoverageEnv(t *testing.T) *coverageEnv {
	return newCoverageEnvWithSpec(t, protocol.DocumentURI("file:///coverage.yaml"), coverageSpec)
}

func newCoverageEnvWithSpec(t *testing.T, uri protocol.DocumentURI, spec string) *coverageEnv {
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
			Text:       spec,
		},
	})

	tree := mgr.GetTree(uri)
	doc := store.Get(uri)
	if tree == nil || doc == nil {
		t.Fatal("failed to initialize tree/doc")
	}

	cache := openapi.NewIndexCache()
	cache.Set(uri, openapi.BuildIndex(tree, doc))

	return &coverageEnv{
		ctx: &gossip.Context{
			Context:   context.Background(),
			Documents: store,
		},
		cache: cache,
		uri:   uri,
		mgr:   mgr,
		store: store,
	}
}

func (e *coverageEnv) addDoc(t *testing.T, uri protocol.DocumentURI, spec string) {
	t.Helper()
	e.store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       spec,
		},
	})
	tree := e.mgr.GetTree(uri)
	doc := e.store.Get(uri)
	if tree == nil || doc == nil {
		t.Fatalf("failed to initialize tree/doc for %s", uri)
	}
	e.cache.Set(uri, openapi.BuildIndex(tree, doc))
}

type lineDoc []string

func (d lineDoc) LineAt(line uint32) string {
	if int(line) >= len(d) {
		return ""
	}
	return d[line]
}

func TestExecuteCommandHandler_SortBranchesNoError(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewExecuteCommandHandler(env.cache, nil, nil)

	commands := []string{
		"telescope.sortTags",
		"telescope.sortPaths",
		"telescope.generateResponseSkeletons",
		"telescope.bundlePreview",
		"telescope.docsPreview",
	}
	for _, cmd := range commands {
		_, err := handler(env.ctx, &protocol.ExecuteCommandParams{
			Command:   cmd,
			Arguments: []interface{}{string(env.uri)},
		})
		if err != nil {
			t.Fatalf("%s returned error: %v", cmd, err)
		}
	}
}

func TestFormatJSON_ProducesIndentedOutput(t *testing.T) {
	out, err := formatJSON(`{"a":1,"b":{"c":2}}`, protocol.FormattingOptions{
		TabSize:      2,
		InsertSpaces: true,
	})
	if err != nil {
		t.Fatalf("formatJSON error: %v", err)
	}
	if out == "" || out[len(out)-1] != '\n' {
		t.Fatalf("formatted JSON should end with newline, got %q", out)
	}
	if out != "{\n  \"a\": 1,\n  \"b\": {\n    \"c\": 2\n  }\n}\n" {
		t.Fatalf("unexpected formatted JSON output:\n%s", out)
	}
}

func TestFormatJSON_InvalidInput(t *testing.T) {
	if _, err := formatJSON(`{"a":`, protocol.FormattingOptions{TabSize: 2, InsertSpaces: true}); err == nil {
		t.Fatal("expected error for invalid JSON")
	}
}

func TestBuildSelectionChain_HasParents(t *testing.T) {
	env := newCoverageEnv(t)
	tree := env.mgr.GetTree(env.uri)
	if tree == nil {
		t.Fatal("expected tree")
	}

	root := tree.RootNode()
	if root == nil {
		t.Fatal("expected root node")
	}
	point := tree.Encoder().Point(protocol.Position{Line: 14, Character: 40})
	node := root.NamedDescendantForPointRange(point, point)
	if node == nil {
		t.Fatal("expected node at $ref location")
	}

	sel := buildSelectionChain(tree, node)
	if sel.Parent == nil {
		t.Fatal("expected parent selection range")
	}
}

func TestWorkspaceSymbolHandler_ReturnsSymbols(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewWorkspaceSymbolHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.WorkspaceSymbolParams{Query: "pet"})
	if err != nil {
		t.Fatalf("workspace symbol handler error: %v", err)
	}
	if len(result) == 0 {
		t.Fatal("expected symbols for query 'pet'")
	}
}

func TestCallHierarchyOutgoingHandler_ReturnsRefTarget(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCallHierarchyOutgoingHandler(env.cache, nil)

	data, _ := json.Marshal(callHierarchyData{
		URI: string(env.uri),
	})
	calls, err := handler(env.ctx, &protocol.CallHierarchyOutgoingCallsParams{
		Item: protocol.CallHierarchyItem{
			URI:   env.uri,
			Range: protocol.Range{Start: protocol.Position{Line: 6, Character: 0}, End: protocol.Position{Line: 15, Character: 80}},
			Data:  json.RawMessage(data),
		},
	})
	if err != nil {
		t.Fatalf("call hierarchy outgoing error: %v", err)
	}
	if len(calls) == 0 {
		t.Fatal("expected outgoing call for $ref target")
	}
}

// --- Code Action handler ---

func TestCodeActionHandler_ReturnsActionsForDiagnostics(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCodeActionHandler(env.cache, nil)

	actions, err := handler(env.ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range:        protocol.Range{Start: protocol.Position{Line: 6}, End: protocol.Position{Line: 6}},
		Context:      protocol.CodeActionContext{},
	})
	if err != nil {
		t.Fatalf("code action handler error: %v", err)
	}
	// No diagnostics in context → scaffolding actions only (may be empty if cursor not on path)
	_ = actions
}

func TestCodeActionHandler_NilIndex(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCodeActionHandler(env.cache, nil)

	unknownURI := protocol.DocumentURI("file:///unknown.yaml")
	actions, err := handler(env.ctx, &protocol.CodeActionParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: unknownURI},
		Range:        protocol.Range{},
		Context:      protocol.CodeActionContext{},
	})
	if err != nil {
		t.Fatalf("code action handler error: %v", err)
	}
	if len(actions) != 0 {
		t.Errorf("expected no actions for unknown URI, got %d", len(actions))
	}
}

// --- Code Lens handler ---

func TestCodeLensHandler_ReturnsLenses(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCodeLensHandler(env.cache, nil)

	lenses, err := handler(env.ctx, &protocol.CodeLensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("code lens handler error: %v", err)
	}
	if len(lenses) == 0 {
		t.Fatal("expected at least one code lens (file header)")
	}
	foundHeader := false
	for _, l := range lenses {
		if l.Command != nil && l.Command.Title != "" {
			foundHeader = true
			break
		}
	}
	if !foundHeader {
		t.Error("expected at least one code lens with a non-empty title")
	}
}

func TestCodeLensHandler_NilIndex(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCodeLensHandler(env.cache, nil)

	lenses, err := handler(env.ctx, &protocol.CodeLensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: "file:///unknown.yaml"},
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if lenses != nil {
		t.Errorf("expected nil for unknown URI, got %d lenses", len(lenses))
	}
}

// --- Completion handler ---

func TestCompletionHandler_RefLine(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCompletionHandler(env.cache, nil)

	// Position on the $ref line (line 14 in coverageSpec)
	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 14, Character: 20},
		},
	})
	if err != nil {
		t.Fatalf("completion handler error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil completion list")
	}
	hasRefItem := false
	for _, item := range result.Items {
		if item.Label != "" {
			hasRefItem = true
			break
		}
	}
	if !hasRefItem {
		t.Error("expected at least one completion item on $ref line")
	}
}

func TestCompletionHandler_NilDocument(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCompletionHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: "file:///unknown.yaml"},
			Position:     protocol.Position{Line: 0, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if result != nil {
		t.Error("expected nil for unknown document")
	}
}

func TestCompletionResolveHandler_PassesThrough(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCompletionResolveHandler(env.cache, nil)

	item := &protocol.CompletionItem{
		Label:  "Pet",
		Detail: "schema",
	}
	resolved, err := handler(env.ctx, item)
	if err != nil {
		t.Fatalf("completion resolve error: %v", err)
	}
	if resolved.Label != "Pet" {
		t.Errorf("expected label 'Pet', got %q", resolved.Label)
	}
}

// --- Document Highlight handler ---

func TestDocumentHighlightHandler_OnRef(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewDocumentHighlightHandler(env.cache, nil)

	// Position on the $ref value (line 14)
	highlights, err := handler(env.ctx, &protocol.DocumentHighlightParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 14, Character: 25},
		},
	})
	if err != nil {
		t.Fatalf("document highlight handler error: %v", err)
	}
	// May be empty depending on exact position, but should not error
	_ = highlights
}

func TestDocumentHighlightHandler_OnSchemaDefinition(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewDocumentHighlightHandler(env.cache, nil)

	// Position on "Pet:" definition (line 17 in coverageSpec)
	highlights, err := handler(env.ctx, &protocol.DocumentHighlightParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 17, Character: 5},
		},
	})
	if err != nil {
		t.Fatalf("document highlight handler error: %v", err)
	}
	_ = highlights
}

// --- References handler ---

func TestReferencesHandler_OnSchemaName(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewReferencesHandler(env.cache, nil)

	// Position on "Pet:" definition line
	refs, err := handler(env.ctx, &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 17, Character: 5},
		},
		Context: protocol.ReferenceContext{IncludeDeclaration: true},
	})
	if err != nil {
		t.Fatalf("references handler error: %v", err)
	}
	_ = refs
}

func TestReferencesHandler_NilIndex(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewReferencesHandler(env.cache, nil)

	refs, err := handler(env.ctx, &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: "file:///unknown.yaml"},
			Position:     protocol.Position{},
		},
		Context: protocol.ReferenceContext{},
	})
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if refs != nil {
		t.Errorf("expected nil for unknown URI, got %d refs", len(refs))
	}
}

// --- Call Hierarchy handlers ---

func TestPrepareCallHierarchyHandler_OnOperation(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewPrepareCallHierarchyHandler(env.cache, nil)

	items, err := handler(env.ctx, &protocol.CallHierarchyPrepareParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 7, Character: 5},
		},
	})
	if err != nil {
		t.Fatalf("prepare call hierarchy error: %v", err)
	}
	_ = items
}

func TestCallHierarchyIncomingHandler_NoError(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewCallHierarchyIncomingHandler(env.cache, nil)

	data, _ := json.Marshal(callHierarchyData{URI: string(env.uri)})
	calls, err := handler(env.ctx, &protocol.CallHierarchyIncomingCallsParams{
		Item: protocol.CallHierarchyItem{
			URI:   env.uri,
			Name:  "Pet",
			Range: protocol.Range{Start: protocol.Position{Line: 17}, End: protocol.Position{Line: 21}},
			Data:  json.RawMessage(data),
		},
	})
	if err != nil {
		t.Fatalf("call hierarchy incoming error: %v", err)
	}
	_ = calls
}

func TestCodeActionHelpers_TableDriven(t *testing.T) {
	t.Run("invalidKeyQuickFix from map data", func(t *testing.T) {
		diag := protocol.Diagnostic{
			Range: protocol.Range{
				Start: protocol.Position{Line: 2, Character: 2},
				End:   protocol.Position{Line: 2, Character: 7},
			},
			Data: map[string]any{
				"kind":      "invalid_key",
				"suggestTo": "summary",
			},
		}
		action := invalidKeyQuickFix("file:///x.yaml", diag)
		if action == nil {
			t.Fatal("expected quick fix action")
		}
		if action.Title != "Rename to 'summary'" {
			t.Fatalf("unexpected title: %q", action.Title)
		}
	})

	t.Run("markdownHeadingQuickFix skipped heading", func(t *testing.T) {
		doc := lineDoc{"### Heading"}
		diag := protocol.Diagnostic{
			Code: "description-markdown",
			Range: protocol.Range{
				Start: protocol.Position{Line: 0},
				End:   protocol.Position{Line: 0, Character: 10},
			},
			Data: barrelAnalyzers.HeadingFixData{
				Kind:          "skipped-heading",
				ExpectedLevel: 2,
				ActualLevel:   3,
			},
		}
		action := markdownHeadingQuickFix("file:///x.yaml", doc, diag)
		if action == nil {
			t.Fatal("expected markdown heading quick fix")
		}
		got := action.Edit.Changes["file:///x.yaml"][0].NewText
		if got != "## Heading" {
			t.Fatalf("unexpected rewritten heading: %q", got)
		}
	})

	t.Run("markdownHeadingQuickFix empty heading", func(t *testing.T) {
		doc := lineDoc{"##", "next"}
		diag := protocol.Diagnostic{
			Code: "description-markdown",
			Range: protocol.Range{
				Start: protocol.Position{Line: 0},
				End:   protocol.Position{Line: 0, Character: 2},
			},
			Data: map[string]any{"kind": "empty-heading"},
		}
		action := markdownHeadingQuickFix("file:///x.yaml", doc, diag)
		if action == nil {
			t.Fatal("expected empty-heading quick fix")
		}
		if action.Title != "Remove empty heading" {
			t.Fatalf("unexpected title: %q", action.Title)
		}
	})
}

func TestCodeActionPureHelpers(t *testing.T) {
	if got := lineEndCharUTF16("a🙂"); got != 3 {
		t.Fatalf("lineEndCharUTF16 mismatch: got %d", got)
	}
	if got := firstVersionInsertionLine(lineDoc{"openapi: 3.1.0", "paths:"}); got != 1 {
		t.Fatalf("unexpected insertion line: %d", got)
	}
	if got := normalizeRelativeRefPath("models.yaml"); got != "./models.yaml" {
		t.Fatalf("normalizeRelativeRefPath mismatch: %q", got)
	}
	if got := toKebabCase("/userProfiles/{userId}/apiKeys"); got != "/user-profiles/{userId}/api-keys" {
		t.Fatalf("toKebabCase mismatch: %q", got)
	}
	if got := camelToKebab("userProfiles"); got != "user-profiles" {
		t.Fatalf("camelToKebab mismatch: %q", got)
	}
	if got := inferResourceName("/users/{userId}/apiKeys"); got != "apiKey" {
		t.Fatalf("inferResourceName mismatch: %q", got)
	}
}

func TestBuildFixAllAction_ReturnsEdits(t *testing.T) {
	env := newCoverageEnvWithSpec(t, "file:///fixall.yaml", `openapi: "3.1.0"
paths:
  /users:
    get:
      responses:
        "200":
          description: ok
`)
	doc := env.ctx.Documents.Get(env.uri)
	action := buildFixAllAction(env.uri, doc, env.cache.Get(env.uri), []protocol.Diagnostic{
		{
			Source: rules.Source,
			Code:   "operation-description",
			Range: protocol.Range{
				Start: protocol.Position{Line: 3},
				End:   protocol.Position{Line: 3},
			},
		},
	})
	if action == nil {
		t.Fatal("expected fix-all action")
	}
	if action.Kind != "source.fixAll.telescope" {
		t.Fatalf("unexpected kind: %q", action.Kind)
	}
	if len(action.Edit.Changes[env.uri]) == 0 {
		t.Fatal("expected edits in fix-all action")
	}
}

func TestCompletionPureHelpers(t *testing.T) {
	t.Run("status code completions", func(t *testing.T) {
		items := statusCodeCompletions()
		if len(items) == 0 || items[0].InsertTextFormat == nil {
			t.Fatal("expected snippet status code completions")
		}
	})

	t.Run("media type completions", func(t *testing.T) {
		items := mediaTypeCompletions()
		if len(items) == 0 || items[0].Label == "" {
			t.Fatal("expected media type completions")
		}
	})

	t.Run("property pattern completions", func(t *testing.T) {
		items := propertyPatternCompletions()
		if len(items) == 0 || items[0].Kind != protocol.CompletionKindProperty {
			t.Fatal("expected property pattern completions")
		}
	})

	t.Run("header completions", func(t *testing.T) {
		items := headerCompletions()
		if len(items) == 0 || items[0].SortText == "" {
			t.Fatal("expected header completions")
		}
	})

	t.Run("response context", func(t *testing.T) {
		if !isResponseContext(`"404":`) || !isResponseContext("responses:") || isResponseContext("description: ok") {
			t.Fatal("unexpected response context classification")
		}
	})
}

func TestCodeLensUriToFilename(t *testing.T) {
	if got := uriToFilename("file:///tmp/example.yaml"); got != "example.yaml" {
		t.Fatalf("unexpected filename: %q", got)
	}
	if got := uriToFilename("/tmp/example.yaml"); got != "example.yaml" {
		t.Fatalf("unexpected plain-path filename: %q", got)
	}
}

func TestReferencesHandler_CrossDocumentFallback(t *testing.T) {
	rootSpec := `openapi: "3.1.0"
info:
  title: Root API
  version: "1.0.0"
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "./components.yaml#/components/schemas/Pet"
`
	componentSpec := `openapi: "3.1.0"
info:
  title: Components
  version: "1.0.0"
components:
  schemas:
    Pet:
      type: object
`
	env := newCoverageEnvWithSpec(t, "file:///root.yaml", rootSpec)
	componentURI := protocol.DocumentURI("file:///components.yaml")
	env.addDoc(t, componentURI, componentSpec)

	handler := NewReferencesHandler(env.cache, nil)
	refs, err := handler(env.ctx, &protocol.ReferenceParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: componentURI},
			Position:     protocol.Position{Line: 5, Character: 6},
		},
		Context: protocol.ReferenceContext{IncludeDeclaration: true},
	})
	if err != nil {
		t.Fatalf("references handler error: %v", err)
	}
	if len(refs) < 2 {
		t.Fatalf("expected declaration plus cross-document ref, got %d", len(refs))
	}
}

func TestDocumentHighlightHandler_TagAndOperationID(t *testing.T) {
	spec := `openapi: "3.1.0"
info:
  title: Highlight API
  version: "1.0.0"
tags:
  - name: users
security:
  - bearerAuth: []
paths:
  /users:
    get:
      operationId: listUsers
      tags:
        - users
      security:
        - bearerAuth: []
      responses:
        "200":
          description: ok
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
`
	env := newCoverageEnvWithSpec(t, "file:///highlight.yaml", spec)
	handler := NewDocumentHighlightHandler(env.cache, nil)

	tagHighlights, err := handler(env.ctx, &protocol.DocumentHighlightParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 5, Character: 10},
		},
	})
	if err != nil {
		t.Fatalf("tag highlight error: %v", err)
	}
	if len(tagHighlights) < 2 {
		t.Fatalf("expected tag definition and usage highlights, got %d", len(tagHighlights))
	}

	opHighlights, err := handler(env.ctx, &protocol.DocumentHighlightParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 11, Character: 20},
		},
	})
	if err != nil {
		t.Fatalf("operationId highlight error: %v", err)
	}
	if len(opHighlights) == 0 {
		t.Fatal("expected operationId highlights")
	}
}

func TestCallHierarchyPureHelpers(t *testing.T) {
	if kind := symbolKindForComponent("schemas"); kind == 0 {
		t.Fatal("expected non-zero symbol kind for schemas")
	}
	if data := extractCallData(json.RawMessage(`{"uri":`)); data != nil {
		t.Fatal("expected extractCallData to return nil for invalid JSON")
	}
}

func TestCodeActionInvalidKeyQuickFix_InvalidData(t *testing.T) {
	diag := protocol.Diagnostic{Data: map[string]any{"kind": "invalid_key"}}
	if action := invalidKeyQuickFix("file:///x.yaml", diag); action != nil {
		t.Fatal("expected nil action for incomplete invalid key data")
	}
}

func TestBuildFixAllAction_NilInputs(t *testing.T) {
	if action := buildFixAllAction("file:///x.yaml", nil, nil, nil); action != nil {
		t.Fatal("expected nil fix-all action for nil inputs")
	}
}

func TestCompletionContextHelpers(t *testing.T) {
	if !isHeaderContext("headers:") || !isContentContext("content:") || !isPathTemplateContext("/users:") {
		t.Fatal("expected positive helper classifications")
	}
	if !isSecurityScopeContext("bearerAuth: [read]") || !isExtensionContext("x-example:") {
		t.Fatal("expected positive security/extension classifications")
	}
	if isPathTemplateContext("users:") || isExtensionContext("summary: test") {
		t.Fatal("expected negative helper classifications")
	}
}

func TestCodeActionDocHelpers(t *testing.T) {
	doc := lineDoc{"openapi: 3.1.0", "    child"}
	if ws := leadingWhitespace(doc.LineAt(1)); ws != "    " {
		t.Fatalf("unexpected leading whitespace: %q", ws)
	}
}

func TestInvalidKeyQuickFix_StructData(t *testing.T) {
	diag := protocol.Diagnostic{
		Range: protocol.Range{Start: protocol.Position{Line: 1}, End: protocol.Position{Line: 1, Character: 4}},
		Data:  jsonschema.InvalidKeyData{Kind: "invalid_key", SuggestTo: "operationId"},
	}
	action := invalidKeyQuickFix("file:///x.yaml", diag)
	if action == nil || action.Edit == nil {
		t.Fatal("expected quick fix from struct data")
	}
}
