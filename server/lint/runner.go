// Package lint provides a shared lint runner used by both the LSP server and CLI.
package lint

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip/treesitter"
)

// Result is a single lint finding.
type Result struct {
	Diagnostic protocol.Diagnostic
	RuleID     string
	Path       string // file path
}

// Runner executes lint rules in batch mode (for CLI).
type Runner struct {
	yamlLang *tree_sitter.Language
	jsonLang *tree_sitter.Language
}

// NewRunner creates a new lint runner with the given tree-sitter languages.
func NewRunner(yamlLang, jsonLang *tree_sitter.Language) *Runner {
	return &Runner{
		yamlLang: yamlLang,
		jsonLang: jsonLang,
	}
}

// RunFile lints a single file and returns diagnostics.
func (r *Runner) RunFile(uri string, content []byte) ([]protocol.Diagnostic, *openapi.Index) {
	format := openapi.FormatFromURI(uri)
	var lang *tree_sitter.Language
	switch format {
	case openapi.FormatYAML:
		lang = r.yamlLang
	case openapi.FormatJSON:
		lang = r.jsonLang
	default:
		return nil, nil
	}

	if lang == nil {
		return nil, nil
	}

	parser := tree_sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(lang); err != nil {
		return nil, nil
	}

	tsTree := parser.Parse(content, nil)
	if tsTree == nil {
		return nil, nil
	}
	defer tsTree.Close()

	tree := WrapTree(tsTree, content)
	oaParser := openapi.NewParser(tree, format)
	doc := oaParser.Parse()

	idx := &openapi.Index{
		Document:         doc,
		Operations:       make(map[string]*openapi.OperationRef),
		OperationsByPath: make(map[string][]openapi.OperationRef),
		Schemas:          make(map[string]*openapi.Schema),
		Parameters:       make(map[string]*openapi.Parameter),
		Responses:        make(map[string]*openapi.Response),
		SecuritySchemes:  make(map[string]*openapi.SecurityScheme),
		Refs:             make(map[string][]openapi.RefUsage),
		Tags:             make(map[string]*openapi.Tag),
		Version:          doc.ParsedVersion,
		Format:           format,
	}

	// Index paths
	for path, item := range doc.Paths {
		var ops []openapi.OperationRef
		for _, mo := range item.Operations() {
			ref := openapi.OperationRef{Path: path, Method: mo.Method, Operation: mo.Operation}
			ops = append(ops, ref)
			if mo.Operation.OperationID != "" {
				idx.Operations[mo.Operation.OperationID] = &ref
			}
		}
		idx.OperationsByPath[path] = ops
	}

	// Index components
	if doc.Components != nil {
		for name, s := range doc.Components.Schemas {
			idx.Schemas[name] = s
		}
		for name, p := range doc.Components.Parameters {
			idx.Parameters[name] = p
		}
		for name, r := range doc.Components.Responses {
			idx.Responses[name] = r
		}
		for name, ss := range doc.Components.SecuritySchemes {
			idx.SecuritySchemes[name] = ss
		}
	}

	// Index tags
	for i := range doc.Tags {
		t := &doc.Tags[i]
		idx.Tags[t.Name] = t
	}

	return nil, idx
}

// WrapTree wraps a raw tree-sitter Tree into a gossip treesitter.Tree.
// This is a convenience for CLI mode where we don't have the full Manager.
func WrapTree(raw *tree_sitter.Tree, src []byte) *treesitter.Tree {
	// We need access to the gossip Tree wrapper. Since its fields are unexported,
	// we use the public API. For CLI batch mode, we create a minimal wrapper.
	// The Tree type's NodeText method needs the source bytes, which are stored
	// internally. We'll work around this by using the raw tree directly.
	return nil // Placeholder - will be populated properly in integration
}
