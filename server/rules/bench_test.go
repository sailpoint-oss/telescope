package rules_test

import (
	"context"
	"fmt"
	"log/slog"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_yaml "github.com/tree-sitter-grammars/tree-sitter-yaml/bindings/go"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

func benchYAMLLang() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
}

type rulesBenchEnv struct {
	store *document.Store
	mgr   *treesitter.Manager
	tree  *treesitter.Tree
	idx   *openapi.Index
	doc   *document.Document
	uri   protocol.DocumentURI
}

func setupRulesEnv(b *testing.B, spec specs.Spec) *rulesBenchEnv {
	b.Helper()

	if spec.Format != openapi.FormatYAML {
		b.Skip("rule benchmarks only support YAML specs")
	}

	store := document.NewStore()
	lang := benchYAMLLang()
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

	idx := openapi.BuildIndex(tree, doc)

	return &rulesBenchEnv{
		store: store,
		mgr:   mgr,
		tree:  tree,
		idx:   idx,
		doc:   doc,
		uri:   uri,
	}
}

func makeDiff(isFullReparse bool) *treesitter.TreeDiff {
	return &treesitter.TreeDiff{IsFullReparse: isFullReparse}
}

func makeAnalysisCtx(env *rulesBenchEnv, lang *tree_sitter.Language) *treesitter.AnalysisContext {
	return &treesitter.AnalysisContext{
		Context:  context.Background(),
		Tree:     env.tree,
		Diff:     makeDiff(true),
		Language: lang,
		UserData: env.idx,
	}
}

// -- Analyzer Run function benchmarks (direct invocation) --

func BenchmarkAnalyzer_UnresolvedRef(b *testing.B) {
	analyzer := treesitter.Analyzer{
		Scope:         treesitter.ScopeFile,
		InterestKinds: []string{"block_mapping_pair", "flow_pair", "pair"},
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx, _ := ctx.UserData.(*openapi.Index)
			if idx == nil || !idx.IsOpenAPI() {
				return nil
			}
			var diags []protocol.Diagnostic
			for target, usages := range idx.Refs {
				if _, err := idx.Resolve(target); err != nil {
					for _, usage := range usages {
						diags = append(diags, protocol.Diagnostic{
							Range:   adapt.RangeToProtocol(usage.Loc.Range),
							Message: fmt.Sprintf("Cannot resolve $ref: %s", target),
						})
					}
				}
			}
			return diags
		},
	}

	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupRulesEnv(b, spec)
			ctx := makeAnalysisCtx(env, benchYAMLLang())

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = analyzer.Run(ctx)
			}
		})
	}
}

func BenchmarkAnalyzer_Naming(b *testing.B) {
	analyzer := treesitter.Analyzer{
		Scope:         treesitter.ScopeFile,
		InterestKinds: []string{"block_mapping_pair"},
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx, _ := ctx.UserData.(*openapi.Index)
			if idx == nil || !idx.IsOpenAPI() {
				return nil
			}
			var diags []protocol.Diagnostic
			for name, schema := range idx.Schemas {
				if len(name) > 0 && name[0] >= 'a' && name[0] <= 'z' {
					diags = append(diags, protocol.Diagnostic{
						Range:   adapt.RangeToProtocol(schema.NameLoc.Range),
						Message: fmt.Sprintf("Schema name '%s' should start with uppercase", name),
					})
				}
			}
			return diags
		},
	}

	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupRulesEnv(b, spec)
			ctx := makeAnalysisCtx(env, benchYAMLLang())

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = analyzer.Run(ctx)
			}
		})
	}
}

func BenchmarkAnalyzer_Documentation(b *testing.B) {
	analyzer := treesitter.Analyzer{
		Scope:         treesitter.ScopeFile,
		InterestKinds: []string{"block_mapping_pair"},
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx, _ := ctx.UserData.(*openapi.Index)
			if idx == nil || !idx.IsOpenAPI() {
				return nil
			}
			var diags []protocol.Diagnostic
			for _, opRef := range idx.Operations {
				op := opRef.Operation
				if op.Description.Text == "" {
					diags = append(diags, protocol.Diagnostic{
						Range:   adapt.RangeToProtocol(op.Loc.Range),
						Message: "Operation missing description",
					})
				}
			}
			return diags
		},
	}

	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupRulesEnv(b, spec)
			ctx := makeAnalysisCtx(env, benchYAMLLang())

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = analyzer.Run(ctx)
			}
		})
	}
}

func BenchmarkAnalyzer_Paths(b *testing.B) {
	analyzer := treesitter.Analyzer{
		Scope:         treesitter.ScopeFile,
		InterestKinds: []string{"block_mapping_pair"},
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx, _ := ctx.UserData.(*openapi.Index)
			if idx == nil || !idx.IsOpenAPI() {
				return nil
			}
			var diags []protocol.Diagnostic
			for path, item := range idx.Document.Paths {
				if len(path) > 1 && path[len(path)-1] == '/' {
					diags = append(diags, protocol.Diagnostic{
						Range:   adapt.RangeToProtocol(item.PathLoc.Range),
						Message: fmt.Sprintf("Path '%s' has trailing slash", path),
					})
				}
			}
			return diags
		},
	}

	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupRulesEnv(b, spec)
			ctx := makeAnalysisCtx(env, benchYAMLLang())

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = analyzer.Run(ctx)
			}
		})
	}
}

func BenchmarkAnalyzer_Security(b *testing.B) {
	analyzer := treesitter.Analyzer{
		Scope:         treesitter.ScopeFile,
		InterestKinds: []string{"block_mapping_pair"},
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx, _ := ctx.UserData.(*openapi.Index)
			if idx == nil || !idx.IsOpenAPI() {
				return nil
			}
			var diags []protocol.Diagnostic
			for name, scheme := range idx.SecuritySchemes {
				if scheme.Type == "apiKey" && scheme.In == "query" {
					diags = append(diags, protocol.Diagnostic{
						Range:   adapt.RangeToProtocol(scheme.Loc.Range),
						Message: fmt.Sprintf("Security scheme '%s' uses API key in query", name),
					})
				}
			}
			return diags
		},
	}

	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupRulesEnv(b, spec)
			ctx := makeAnalysisCtx(env, benchYAMLLang())

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = analyzer.Run(ctx)
			}
		})
	}
}

// BenchmarkAllAnalyzers benchmarks running all analyzer categories in sequence,
// simulating the full diagnostic pass on file open.
func BenchmarkAllAnalyzers(b *testing.B) {
	allAnalyzers := []struct {
		name string
		run  func(idx *openapi.Index) []protocol.Diagnostic
	}{
		{"refs", func(idx *openapi.Index) []protocol.Diagnostic {
			var diags []protocol.Diagnostic
			for target, usages := range idx.Refs {
				if _, err := idx.Resolve(target); err != nil {
					for _, u := range usages {
						diags = append(diags, protocol.Diagnostic{Range: adapt.RangeToProtocol(u.Loc.Range), Message: "unresolved"})
					}
				}
			}
			return diags
		}},
		{"naming", func(idx *openapi.Index) []protocol.Diagnostic {
			var diags []protocol.Diagnostic
			for name, s := range idx.Schemas {
				if len(name) > 0 && name[0] >= 'a' && name[0] <= 'z' {
					diags = append(diags, protocol.Diagnostic{Range: adapt.RangeToProtocol(s.NameLoc.Range), Message: "naming"})
				}
			}
			return diags
		}},
		{"docs", func(idx *openapi.Index) []protocol.Diagnostic {
			var diags []protocol.Diagnostic
			for _, op := range idx.Operations {
				if op.Operation.Description.Text == "" {
					diags = append(diags, protocol.Diagnostic{Range: adapt.RangeToProtocol(op.Operation.Loc.Range), Message: "docs"})
				}
			}
			return diags
		}},
		{"paths", func(idx *openapi.Index) []protocol.Diagnostic {
			var diags []protocol.Diagnostic
			for path, item := range idx.Document.Paths {
				if len(path) > 1 && path[len(path)-1] == '/' {
					diags = append(diags, protocol.Diagnostic{Range: adapt.RangeToProtocol(item.PathLoc.Range), Message: "path"})
				}
			}
			return diags
		}},
		{"security", func(idx *openapi.Index) []protocol.Diagnostic {
			var diags []protocol.Diagnostic
			for _, scheme := range idx.SecuritySchemes {
				if scheme.Type == "apiKey" && scheme.In == "query" {
					diags = append(diags, protocol.Diagnostic{Range: adapt.RangeToProtocol(scheme.Loc.Range), Message: "sec"})
				}
			}
			return diags
		}},
		{"servers", func(idx *openapi.Index) []protocol.Diagnostic {
			var diags []protocol.Diagnostic
			if idx.Document != nil && len(idx.Document.Servers) == 0 {
				diags = append(diags, protocol.Diagnostic{Message: "no servers"})
			}
			return diags
		}},
	}

	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			env := setupRulesEnv(b, spec)

			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				var total int
				for _, a := range allAnalyzers {
					diags := a.run(env.idx)
					total += len(diags)
				}
				_ = total
			}
		})
	}
}

// BenchmarkFullDiagnosticPipeline benchmarks the end-to-end diagnostic cycle:
// server init, document open, tree parse, index build, and all rules.
func BenchmarkFullDiagnosticPipeline(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		if spec.Format != openapi.FormatYAML {
			continue
		}
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			for i := 0; i < b.N; i++ {
				store := document.NewStore()
				lang := benchYAMLLang()
				mgr := treesitter.NewManager(treesitter.Config{
					Matchers: []treesitter.LanguageMatcher{
						{Language: lang, Extensions: []string{".yaml"}, LanguageID: "yaml"},
					},
				}, store)

				engine := treesitter.NewDiagnosticEngine(mgr, store, slog.New(slog.NewTextHandler(devNull{}, nil)))
				engine.SetPublish(func(_ context.Context, _ *protocol.PublishDiagnosticsParams) error {
					return nil
				})

				uri := protocol.DocumentURI(fmt.Sprintf("file:///bench%d.yaml", i))
				store.Open(&protocol.DidOpenTextDocumentParams{
					TextDocument: protocol.TextDocumentItem{
						URI: uri, LanguageID: "yaml", Version: 1, Text: string(spec.Content),
					},
				})

				tree := mgr.GetTree(uri)
				doc := store.Get(uri)
				idx := openapi.BuildIndex(tree, doc)
				_ = idx

				mgr.Close()
			}
		})
	}
}

type devNull struct{}

func (devNull) Write(p []byte) (int, error) { return len(p), nil }
