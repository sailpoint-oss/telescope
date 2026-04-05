package openapi

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip/treesitter"
)

// Ensure tree_sitter import is used.
var _ *tree_sitter.Node

// ClassifyResult holds the result of classifying a document.
type ClassifyResult struct {
	DocType       DocType
	Version       Version
	VersionString string
	Format        FileFormat
}

// Classify determines the OpenAPI version and document type from a tree-sitter tree.
func Classify(tree *treesitter.Tree, uri string) ClassifyResult {
	format := FormatFromURI(uri)
	result := ClassifyResult{
		DocType: DocTypeUnknown,
		Format:  format,
	}

	if tree == nil || tree.RootNode() == nil {
		return result
	}

	parser := NewParser(tree, format)
	doc := parser.Parse()

	result.DocType = doc.DocType
	result.Version = doc.ParsedVersion
	result.VersionString = doc.Version

	return result
}

// IsOpenAPIFile performs a lightweight check to determine if a tree represents
// an OpenAPI document by looking for the openapi or swagger key at the root.
func IsOpenAPIFile(tree *treesitter.Tree, uri string) bool {
	format := FormatFromURI(uri)
	if tree == nil || tree.RootNode() == nil {
		return false
	}

	root := tree.RootNode()
	parser := &Parser{tree: tree, format: format}

	var mappingNode = root
	switch format {
	case FormatYAML:
		mappingNode = parser.findYAMLRoot(root)
	case FormatJSON:
		mappingNode = parser.findJSONRoot(root)
	}

	if mappingNode == nil {
		return false
	}

	found := false
	parser.walkMapping(mappingNode, func(key, value *tree_sitter.Node) {
		k := unquote(parser.nodeText(key))
		if k == "openapi" || k == "swagger" {
			found = true
		}
	})

	return found
}
