package lsp_test

import (
	"context"
	"fmt"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/lsp"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

type benchEnv struct {
	store *document.Store
	mgr   *treesitter.Manager
	cache *openapi.IndexCache
	ctx   *gossip.Context
	uri   protocol.DocumentURI
	spec  specs.Spec
}

func setupBenchEnv(b *testing.B, spec specs.Spec) *benchEnv {
	b.Helper()

	if spec.Format != openapi.FormatYAML {
		b.Skip("LSP benchmarks only support YAML specs")
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
	if tree == nil {
		b.Fatal("nil tree")
	}

	doc := store.Get(uri)
	if doc == nil {
		b.Fatal("nil document")
	}

	cache := openapi.NewIndexCache()
	idx := openapi.BuildIndex(tree, doc)
	cache.Set(uri, idx)

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}

	return &benchEnv{
		store: store,
		mgr:   mgr,
		cache: cache,
		ctx:   ctx,
		uri:   uri,
		spec:  spec,
	}
}

func BenchmarkHover(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewHoverHandler(env.cache, nil)
			params := &protocol.HoverParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     protocol.Position{Line: 3, Character: 5},
				},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkCompletion(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
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
		})
	}
}

func BenchmarkDefinition(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewDefinitionHandler(env.cache, nil, nil)
			params := &protocol.DefinitionParams{
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
		})
	}
}

func BenchmarkReferences(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewReferencesHandler(env.cache, nil)
			params := &protocol.ReferenceParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     protocol.Position{Line: 3, Character: 5},
				},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkDocumentSymbol(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewSymbolHandler(env.cache, nil)
			params := &protocol.DocumentSymbolParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkCodeAction(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewCodeActionHandler(env.cache, nil)
			params := &protocol.CodeActionParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
				Range: protocol.Range{
					Start: protocol.Position{Line: 0, Character: 0},
					End:   protocol.Position{Line: 10, Character: 0},
				},
				Context: protocol.CodeActionContext{
					Diagnostics: []protocol.Diagnostic{
						{
							Range:   protocol.Range{Start: protocol.Position{Line: 5}, End: protocol.Position{Line: 5, Character: 20}},
							Message: "test diagnostic",
							Source:  "telescope",
							Code:    "unresolved-ref",
						},
					},
				},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkFoldingRange(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewFoldingRangeHandler(env.cache, nil)
			params := &protocol.FoldingRangeParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkCodeLens(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewCodeLensHandler(env.cache, nil)
			params := &protocol.CodeLensParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkInlayHints(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewInlayHintHandler(env.cache, nil)
			params := &protocol.InlayHintParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
				Range: protocol.Range{
					Start: protocol.Position{Line: 0, Character: 0},
					End:   protocol.Position{Line: uint32(spec.Lines), Character: 0},
				},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkSemanticTokens(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewSemanticTokensHandler(env.cache, nil, nil)
			params := &protocol.SemanticTokensParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkRename(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewRenameHandler(env.cache, nil)
			params := &protocol.RenameParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     protocol.Position{Line: 3, Character: 5},
				},
				NewName: "newName",
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkPrepareRename(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewPrepareRenameHandler(env.cache, nil)
			params := &protocol.PrepareRenameParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     protocol.Position{Line: 3, Character: 5},
				},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkFormatting(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewFormattingHandler(env.cache, nil)
			params := &protocol.DocumentFormattingParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
				Options: protocol.FormattingOptions{
					TabSize:      2,
					InsertSpaces: true,
				},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkDocumentLinks(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewDocumentLinkHandler(env.cache, nil)
			params := &protocol.DocumentLinkParams{
				TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkDocumentHighlight(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewDocumentHighlightHandler(env.cache, nil)
			params := &protocol.DocumentHighlightParams{
				TextDocumentPositionParams: protocol.TextDocumentPositionParams{
					TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
					Position:     protocol.Position{Line: 3, Character: 5},
				},
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_, _ = handler(env.ctx, params)
			}
		})
	}
}

func BenchmarkTypeDefinition(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupBenchEnv(b, spec)
			handler := lsp.NewTypeDefinitionHandler(env.cache, nil, nil)
			params := &protocol.TypeDefinitionParams{
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
		})
	}
}
