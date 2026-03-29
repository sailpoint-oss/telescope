package lsp

import (
	"context"
	"encoding/json"
	"testing"
	"unsafe"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
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
}

func newCoverageEnv(t *testing.T) *coverageEnv {
	t.Helper()

	uri := protocol.DocumentURI("file:///coverage.yaml")
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
			Text:       coverageSpec,
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
	}
}

func TestExecuteCommandHandler_SortBranchesNoError(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewExecuteCommandHandler(env.cache, nil, nil)

	commands := []string{
		"telescope.sortTags",
		"telescope.sortPaths",
		"telescope.generateResponseSkeletons",
		"telescope.bundlePreview",
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
