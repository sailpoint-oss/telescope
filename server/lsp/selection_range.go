package lsp

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
	tree_sitter "github.com/tree-sitter/go-tree-sitter"
)

// NewSelectionRangeHandler builds nested selection ranges by walking up the
// tree-sitter AST from the cursor position through parent nodes.
func NewSelectionRangeHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.SelectionRangeHandler {
	return func(ctx *gossip.Context, params *protocol.SelectionRangeParams) ([]protocol.SelectionRange, error) {
		uri := params.TextDocument.URI
		tsManager := ctx.Server().TreeSitter()
		if tsManager == nil {
			return nil, nil
		}

		tree := tsManager.GetTree(uri)
		if tree == nil {
			return nil, nil
		}

		root := tree.RootNode()
		if root == nil {
			return nil, nil
		}

		enc := tree.Encoder()
		results := make([]protocol.SelectionRange, len(params.Positions))

		for i, pos := range params.Positions {
			point := enc.Point(pos)

			node := root.NamedDescendantForPointRange(point, point)
			if node == nil {
				node = root.DescendantForPointRange(point, point)
			}
			if node == nil {
				results[i] = protocol.SelectionRange{
					Range: protocol.Range{Start: pos, End: pos},
				}
				continue
			}

			results[i] = buildSelectionChain(tree, node)
		}

		return results, nil
	}
}

func buildSelectionChain(tree *treesitter.Tree, node *tree_sitter.Node) protocol.SelectionRange {
	r := tree.NodeRange(node)
	result := protocol.SelectionRange{Range: r}

	current := &result
	parent := node.Parent()
	for parent != nil {
		parentRange := tree.NodeRange(parent)
		if parentRange != current.Range {
			newLevel := &protocol.SelectionRange{Range: parentRange}
			current.Parent = newLevel
			current = newLevel
		}
		parent = parent.Parent()
	}

	return result
}
