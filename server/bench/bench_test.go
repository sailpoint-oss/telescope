package bench_test

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/core/classify"
	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/spectral"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

// buildLargeGraph creates a WorkspaceGraph with nodeCount nodes and ~500 edges.
// Nodes are named file:///doc-0.yaml through file:///doc-N.yaml.
// Each node has edges to the next 2-3 nodes (wrapping), simulating $ref patterns.
// The first node is marked as root. Node (nodeCount-1) is a leaf (no outgoing edges)
// referenced by many nodes for invalidation cascade testing.
func buildLargeGraph(nodeCount int) *graph.WorkspaceGraph {
	g := graph.NewWorkspaceGraph()
	hint := graph.ClassificationHint{}

	for i := 0; i < nodeCount; i++ {
		uri := fmt.Sprintf("file:///doc-%d.yaml", i)
		content := []byte(fmt.Sprintf("openapi: 3.1.0\ninfo:\n  title: doc-%d\n  version: 1.0\n", i))
		src := graph.NewSyntheticSource(uri, content, hint)
		g.AddSource(src)
	}

	g.SetRoot("file:///doc-0.yaml", true)

	// Add edges: each node i (0..nodeCount-2) points to (i+1)%N, (i+2)%N, (i+3)%N
	// Node (nodeCount-1) is a leaf with no outgoing edges
	for i := 0; i < nodeCount-1; i++ {
		for j := 1; j <= 3; j++ {
			target := (i + j) % nodeCount
			g.AddEdge(graph.Edge{
				SourceURI: fmt.Sprintf("file:///doc-%d.yaml", i),
				TargetURI: fmt.Sprintf("file:///doc-%d.yaml", target),
				Kind:      graph.EdgeRef,
			})
		}
	}

	// Add extra edges to the leaf so invalidation cascades to many nodes
	leafURI := fmt.Sprintf("file:///doc-%d.yaml", nodeCount-1)
	for i := 0; i < nodeCount/2; i++ {
		if i != nodeCount-1 {
			g.AddEdge(graph.Edge{
				SourceURI: fmt.Sprintf("file:///doc-%d.yaml", i),
				TargetURI: leafURI,
				Kind:      graph.EdgeRef,
			})
		}
	}

	return g
}

// buildGraphWithCycles creates a graph with 2 embedded cycles: A→B→C→A and D→E→D.
func buildGraphWithCycles(nodeCount int) *graph.WorkspaceGraph {
	g := buildLargeGraph(nodeCount)

	// Insert cycle 1: doc-0 -> doc-1 -> doc-2 -> doc-0
	g.AddEdge(graph.Edge{SourceURI: "file:///doc-2.yaml", TargetURI: "file:///doc-0.yaml", Kind: graph.EdgeRef})

	// Insert cycle 2: doc-3 -> doc-4 -> doc-3
	g.AddEdge(graph.Edge{SourceURI: "file:///doc-4.yaml", TargetURI: "file:///doc-3.yaml", Kind: graph.EdgeRef})

	return g
}

func syntheticFiles(count int) []struct {
	name    string
	content string
} {
	var out []struct {
		name    string
		content string
	}
	for i := 0; i < count; i++ {
		switch i % 5 {
		case 0:
			out = append(out, struct {
				name    string
				content string
			}{
				name: fmt.Sprintf("file:///openapi-%d.yaml", i),
				content: fmt.Sprintf(`openapi: "3.1.0"
info:
  title: API %d
  version: "1.0"
paths:
  /users:
    get:
      summary: List users
`, i),
			})
		case 1:
			out = append(out, struct {
				name    string
				content string
			}{
				name: fmt.Sprintf("file:///spec-%d.json", i),
				content: fmt.Sprintf(`{"openapi":"3.0.0","info":{"title":"API %d","version":"1.0"},"paths":{}}`, i),
			})
		case 2:
			out = append(out, struct {
				name    string
				content string
			}{
				name: fmt.Sprintf("file:///config-%d.yaml", i),
				content: fmt.Sprintf(`server:
  port: 8080
logging:
  level: info
`),
			})
		case 3:
			out = append(out, struct {
				name    string
				content string
			}{
				name: fmt.Sprintf("file:///data-%d.json", i),
				content: `{"items":[{"id":1,"name":"foo"}],"total":1}`,
			})
		default:
			out = append(out, struct {
				name    string
				content string
			}{
				name:    fmt.Sprintf("file:///readme-%d.txt", i),
				content: "This is plain text content with no structure.\n",
			})
		}
	}
	return out
}

func BenchmarkGraphBuild(b *testing.B) {
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = buildLargeGraph(300)
	}
}

func BenchmarkGraphInvalidation(b *testing.B) {
	g := buildLargeGraph(300)
	leafURI := "file:///doc-299.yaml"

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = g.Invalidate(leafURI)
	}
}

func BenchmarkGraphCycleDetect(b *testing.B) {
	g := buildGraphWithCycles(300)

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = g.DetectCycles()
	}
}

func BenchmarkClassification(b *testing.B) {
	files := syntheticFiles(100)
	cl := classify.NewFileClassifier()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		for _, f := range files {
			_ = cl.Classify(f.name, []byte(f.content), false)
		}
	}
}

func BenchmarkSnapshotBuild(b *testing.B) {
	g := buildLargeGraph(300)
	// Populate Raw for each node via RawStage (SnapshotManager.Build reads it)
	ctx := context.Background()
	rawStage := graph.RawStage{}
	for _, uri := range g.AllNodes() {
		_ = rawStage.Run(ctx, uri, g)
	}
	mgr := graph.NewSnapshotManager()

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = mgr.Build(g)
	}
}

func BenchmarkFullIndexBuild(b *testing.B) {
	spec := specs.ByName("Plex-API")
	if len(spec.Content) == 0 {
		b.Skip("Plex-API spec not found")
	}
	if spec.Format != openapi.FormatYAML {
		b.Skip("benchmark requires YAML spec")
	}

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	b.Cleanup(mgr.Close)

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
	doc := store.Get(uri)
	if tree == nil || doc == nil {
		b.Fatal("nil tree or document")
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = openapi.BuildIndex(tree, doc)
	}
}

func setupBenchEnv(b *testing.B, spec specs.Spec) *struct {
	store *document.Store
	mgr   *treesitter.Manager
	cache *openapi.IndexCache
	ctx   *gossip.Context
	uri   protocol.DocumentURI
	spec  specs.Spec
} {
	b.Helper()
	if spec.Format != openapi.FormatYAML {
		b.Skip("benchmark requires YAML spec")
	}

	store := document.NewStore()
	lang := tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{".yaml", ".yml"}, LanguageID: "yaml"},
		},
	}, store)
	b.Cleanup(mgr.Close)

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
	doc := store.Get(uri)
	if tree == nil || doc == nil {
		b.Fatal("nil tree or document")
	}

	cache := openapi.NewIndexCache()
	idx := openapi.BuildIndex(tree, doc)
	cache.Set(uri, idx)

	return &struct {
		store *document.Store
		mgr   *treesitter.Manager
		cache *openapi.IndexCache
		ctx   *gossip.Context
		uri   protocol.DocumentURI
		spec  specs.Spec
	}{
		store: store,
		mgr:   mgr,
		cache: cache,
		ctx:   &gossip.Context{Context: context.Background(), Documents: store},
		uri:   uri,
		spec:  spec,
	}
}

func BenchmarkCompletionLatency(b *testing.B) {
	spec := specs.ByName("Plex-API")
	if len(spec.Content) == 0 {
		b.Skip("Plex-API spec not found")
	}

	env := setupBenchEnv(b, spec)
	handler := lsp.NewCompletionHandler(env.cache, nil)
	params := &protocol.CompletionParams{
		TextDocumentPositionParams: protocol.TextDocumentPositionParams{
			TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			Position:     protocol.Position{Line: 5, Character: 10},
		},
	}

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = handler(env.ctx, params)
	}
}

// spectralOASRules returns a representative set of Spectral OAS-style rules
// with Given/Then for benchmarking the spectral engine.
func spectralOASRules() []spectral.Rule {
	return []spectral.Rule{
		{
			ID: "info-contact", Message: "Info object should have a contact field",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.info"},
			Then:     []spectral.FunctionCall{{Field: "contact", Function: "truthy"}},
		},
		{
			ID: "info-description", Message: "Info object should have a description",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.info"},
			Then:     []spectral.FunctionCall{{Field: "description", Function: "truthy"}},
		},
		{
			ID: "operation-description", Message: "Operation should have a description",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.paths.*.*"},
			Then:     []spectral.FunctionCall{{Field: "description", Function: "truthy"}},
		},
		{
			ID: "operation-operationId", Message: "Operation should have an operationId",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.paths.*.*"},
			Then:     []spectral.FunctionCall{{Field: "operationId", Function: "truthy"}},
		},
		{
			ID: "path-keys-no-trailing-slash", Message: "Path should not have a trailing slash",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.paths"},
			Then:     []spectral.FunctionCall{{Function: "pattern", FunctionOptions: map[string]interface{}{"match": "^(?!.*/$)"}}},
		},
		{
			ID: "oas3-api-servers", Message: "OpenAPI 3.x should have servers",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$"},
			Then:     []spectral.FunctionCall{{Field: "servers", Function: "truthy"}},
		},
		{
			ID: "oas3-schema", Message: "Schema should be valid",
			Severity: ctypes.SeverityError,
			Given:    []string{"$.components.schemas[*]"},
			Then:     []spectral.FunctionCall{{Field: "type", Function: "truthy"}},
		},
		{
			ID: "tag-description", Message: "Tag should have a description",
			Severity: ctypes.SeverityWarning,
			Given:    []string{"$.tags[*]"},
			Then:     []spectral.FunctionCall{{Field: "description", Function: "truthy"}},
		},
	}
}

func BenchmarkSpectralRuleset(b *testing.B) {
	spec := specs.ByName("test-valid")
	if len(spec.Content) == 0 {
		b.Skip("test-valid spec not found")
	}

	rules := spectralOASRules()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	engine := spectral.NewEngine(rules, logger)
	content := spec.Content

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = engine.Execute(content)
	}
}
