package openapi_test

import (
	"fmt"
	"strings"
	"testing"
	"unsafe"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	ts_json "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi_json"
	ts_yaml "github.com/sailpoint-oss/tree-sitter-openapi/bindings/go/openapi"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

func benchYAMLLang() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_yaml.Language()))
}

func benchJSONLang() *tree_sitter.Language {
	return tree_sitter.NewLanguage(unsafe.Pointer(ts_json.Language()))
}

func benchSetup(b *testing.B, spec specs.Spec) (*treesitter.Manager, *document.Store) {
	b.Helper()
	store := document.NewStore()
	var lang *tree_sitter.Language
	var ext string
	if spec.Format == openapi.FormatJSON {
		lang = benchJSONLang()
		ext = ".json"
	} else {
		lang = benchYAMLLang()
		ext = ".yaml"
	}
	mgr := treesitter.NewManager(treesitter.Config{
		Matchers: []treesitter.LanguageMatcher{
			{Language: lang, Extensions: []string{ext}, LanguageID: spec.LanguageID()},
		},
	}, store)
	b.Cleanup(mgr.Close)
	return mgr, store
}

func benchOpen(b *testing.B, store *document.Store, mgr *treesitter.Manager, spec specs.Spec) (protocol.DocumentURI, *treesitter.Tree) {
	b.Helper()
	uri := protocol.DocumentURI(spec.URI())
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: spec.LanguageID(),
			Version:    1,
			Text:       string(spec.Content),
		},
	})
	tree := mgr.GetTree(uri)
	if tree == nil {
		b.Fatal("nil tree for spec:", spec.Name)
	}
	return uri, tree
}

// BenchmarkParse measures parsing a tree-sitter tree into a typed OpenAPI Document.
func BenchmarkParse(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			mgr, store := benchSetup(b, spec)
			_, tree := benchOpen(b, store, mgr, spec)

			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				p := openapi.NewParser(tree, spec.Format)
				doc := p.Parse()
				if doc == nil {
					b.Fatal("Parse returned nil")
				}
			}
		})
	}
}

// BenchmarkBuildIndex measures full index construction (parse + index + ref collection).
func BenchmarkBuildIndex(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			mgr, store := benchSetup(b, spec)
			uri, tree := benchOpen(b, store, mgr, spec)

			doc := store.Get(uri)
			if doc == nil {
				b.Fatal("nil document")
			}

			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				idx := openapi.BuildIndex(tree, doc)
				if idx == nil {
					b.Fatal("BuildIndex returned nil")
				}
			}
		})
	}
}

// BenchmarkClassify measures the cost of classifying a document's version and type.
func BenchmarkClassify(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			mgr, store := benchSetup(b, spec)
			_, tree := benchOpen(b, store, mgr, spec)

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				result := openapi.Classify(tree, spec.Name+".yaml")
				_ = result
			}
		})
	}
}

// BenchmarkResolveRef measures the cost of resolving $ref strings against an index.
func BenchmarkResolveRef(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			mgr, store := benchSetup(b, spec)
			uri, tree := benchOpen(b, store, mgr, spec)

			doc := store.Get(uri)
			idx := openapi.BuildIndex(tree, doc)

			var refTargets []string
			for target := range idx.Refs {
				refTargets = append(refTargets, target)
			}
			for name := range idx.Schemas {
				refTargets = append(refTargets, "#/components/schemas/"+name)
			}
			if len(refTargets) == 0 {
				b.Skip("no refs in spec")
			}

			b.ReportAllocs()
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				target := refTargets[i%len(refTargets)]
				_, _ = idx.Resolve(target)
			}
		})
	}
}

// BenchmarkIncrementalReindex measures the cost of rebuilding the index after
// a small incremental edit.
func BenchmarkIncrementalReindex(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		if spec.Format == openapi.FormatJSON {
			continue
		}
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			mgr, store := benchSetup(b, spec)
			uri, _ := benchOpen(b, store, mgr, spec)

			midLine := uint32(spec.Lines / 2)
			editRange := protocol.Range{
				Start: protocol.Position{Line: midLine, Character: 0},
				End:   protocol.Position{Line: midLine + 1, Character: 0},
			}
			editText := "  x-edited: true\n"

			origLines := strings.Split(string(spec.Content), "\n")
			revertText := ""
			if int(midLine) < len(origLines) {
				revertText = origLines[midLine] + "\n"
			}
			revertRange := protocol.Range{
				Start: editRange.Start,
				End:   protocol.Position{Line: midLine + 1, Character: 0},
			}

			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				store.Change(&protocol.DidChangeTextDocumentParams{
					TextDocument: protocol.VersionedTextDocumentIdentifier{
						TextDocumentIdentifier: protocol.TextDocumentIdentifier{URI: uri},
						Version:                int32(i*2 + 2),
					},
					ContentChanges: []protocol.TextDocumentContentChangeEvent{
						{Range: &editRange, Text: editText},
					},
				})

				tree := mgr.GetTree(uri)
				doc := store.Get(uri)
				idx := openapi.BuildIndex(tree, doc)
				_ = idx

				store.Change(&protocol.DidChangeTextDocumentParams{
					TextDocument: protocol.VersionedTextDocumentIdentifier{
						TextDocumentIdentifier: protocol.TextDocumentIdentifier{URI: uri},
						Version:                int32(i*2 + 3),
					},
					ContentChanges: []protocol.TextDocumentContentChangeEvent{
						{Range: &revertRange, Text: revertText},
					},
				})
			}
		})
	}
}

// BenchmarkGenerated benchmarks parsing and indexing on synthetically generated
// OpenAPI specs at different scales.
func BenchmarkGenerated(b *testing.B) {
	sizes := []struct {
		name   string
		paths  int
		schema int
	}{
		{"10paths", 10, 2},
		{"100paths", 100, 2},
		{"500paths", 500, 2},
	}

	for _, sz := range sizes {
		src := genOpenAPIYAML(sz.paths, sz.schema)
		b.Run("Parse/"+sz.name, func(b *testing.B) {
			store := document.NewStore()
			mgr := treesitter.NewManager(treesitter.Config{
				Matchers: []treesitter.LanguageMatcher{
					{Language: benchYAMLLang(), Extensions: []string{".yaml"}, LanguageID: "yaml"},
				},
			}, store)
			b.Cleanup(mgr.Close)

			uri := protocol.DocumentURI("file:///gen.yaml")
			store.Open(&protocol.DidOpenTextDocumentParams{
				TextDocument: protocol.TextDocumentItem{
					URI: uri, LanguageID: "yaml", Version: 1, Text: src,
				},
			})
			tree := mgr.GetTree(uri)
			if tree == nil {
				b.Fatal("nil tree")
			}

			b.ReportAllocs()
			b.SetBytes(int64(len(src)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				p := openapi.NewParser(tree, openapi.FormatYAML)
				_ = p.Parse()
			}
		})

		b.Run("BuildIndex/"+sz.name, func(b *testing.B) {
			store := document.NewStore()
			mgr := treesitter.NewManager(treesitter.Config{
				Matchers: []treesitter.LanguageMatcher{
					{Language: benchYAMLLang(), Extensions: []string{".yaml"}, LanguageID: "yaml"},
				},
			}, store)
			b.Cleanup(mgr.Close)

			uri := protocol.DocumentURI("file:///gen.yaml")
			store.Open(&protocol.DidOpenTextDocumentParams{
				TextDocument: protocol.TextDocumentItem{
					URI: uri, LanguageID: "yaml", Version: 1, Text: src,
				},
			})
			tree := mgr.GetTree(uri)
			doc := store.Get(uri)

			b.ReportAllocs()
			b.SetBytes(int64(len(src)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				_ = openapi.BuildIndex(tree, doc)
			}
		})
	}
}

// genOpenAPIYAML generates a synthetic OpenAPI YAML spec with the given number
// of path endpoints and schemas per path.
func genOpenAPIYAML(paths, schemasPerPath int) string {
	var b strings.Builder
	b.WriteString("openapi: \"3.1.0\"\ninfo:\n  title: Generated API\n  version: \"1.0.0\"\n")
	b.WriteString("servers:\n  - url: https://api.example.com/v1\n")
	b.WriteString("paths:\n")

	for i := 0; i < paths; i++ {
		fmt.Fprintf(&b, "  /resource%d:\n", i)
		fmt.Fprintf(&b, "    get:\n")
		fmt.Fprintf(&b, "      operationId: getResource%d\n", i)
		fmt.Fprintf(&b, "      summary: Get resource %d\n", i)
		fmt.Fprintf(&b, "      tags:\n        - resources\n")
		fmt.Fprintf(&b, "      responses:\n")
		fmt.Fprintf(&b, "        \"200\":\n")
		fmt.Fprintf(&b, "          description: OK\n")
		fmt.Fprintf(&b, "          content:\n")
		fmt.Fprintf(&b, "            application/json:\n")
		fmt.Fprintf(&b, "              schema:\n")
		fmt.Fprintf(&b, "                $ref: \"#/components/schemas/Resource%d\"\n", i)
		fmt.Fprintf(&b, "    post:\n")
		fmt.Fprintf(&b, "      operationId: createResource%d\n", i)
		fmt.Fprintf(&b, "      summary: Create resource %d\n", i)
		fmt.Fprintf(&b, "      tags:\n        - resources\n")
		fmt.Fprintf(&b, "      requestBody:\n")
		fmt.Fprintf(&b, "        required: true\n")
		fmt.Fprintf(&b, "        content:\n")
		fmt.Fprintf(&b, "          application/json:\n")
		fmt.Fprintf(&b, "            schema:\n")
		fmt.Fprintf(&b, "              $ref: \"#/components/schemas/Resource%dInput\"\n", i)
		fmt.Fprintf(&b, "      responses:\n")
		fmt.Fprintf(&b, "        \"201\":\n")
		fmt.Fprintf(&b, "          description: Created\n")
	}

	b.WriteString("components:\n  schemas:\n")
	for i := 0; i < paths; i++ {
		for j := 0; j < schemasPerPath; j++ {
			suffix := ""
			if j == 1 {
				suffix = "Input"
			}
			fmt.Fprintf(&b, "    Resource%d%s:\n", i, suffix)
			fmt.Fprintf(&b, "      type: object\n")
			fmt.Fprintf(&b, "      description: Resource %d %s schema\n", i, suffix)
			fmt.Fprintf(&b, "      required:\n        - id\n        - name\n")
			fmt.Fprintf(&b, "      properties:\n")
			fmt.Fprintf(&b, "        id:\n          type: string\n          format: uuid\n")
			fmt.Fprintf(&b, "        name:\n          type: string\n          maxLength: 200\n")
			fmt.Fprintf(&b, "        description:\n          type: string\n")
			fmt.Fprintf(&b, "        status:\n          type: string\n          enum:\n            - active\n            - inactive\n")
		}
	}

	b.WriteString("tags:\n  - name: resources\n    description: Resource operations\n")
	return b.String()
}
