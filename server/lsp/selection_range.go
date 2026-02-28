package lsp

import (
	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewSelectionRangeHandler builds nested selection ranges by walking up the
// tree-sitter AST from the cursor position through parent nodes.
func NewSelectionRangeHandler(cache *openapi.IndexCache) gossip.SelectionRangeHandler {
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

		results := make([]protocol.SelectionRange, len(params.Positions))

		for i, pos := range params.Positions {
			point := tree_sitter.Point{
				Row:    uint(pos.Line),
				Column: uint(pos.Character),
			}

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

			results[i] = buildSelectionChain(node)
		}

		return results, nil
	}
}

func buildSelectionChain(node *tree_sitter.Node) protocol.SelectionRange {
	r := nodeToRange(node)
	result := protocol.SelectionRange{Range: r}

	current := &result
	parent := node.Parent()
	for parent != nil {
		parentRange := nodeToRange(parent)
		// Only add a new level if the range actually expands
		if parentRange != current.Range {
			newLevel := &protocol.SelectionRange{Range: parentRange}
			current.Parent = newLevel
			current = newLevel
		}
		parent = parent.Parent()
	}

	return result
}

func nodeToRange(node *tree_sitter.Node) protocol.Range {
	start := node.StartPosition()
	end := node.EndPosition()
	return protocol.Range{
		Start: protocol.Position{Line: uint32(start.Row), Character: uint32(start.Column)},
		End:   protocol.Position{Line: uint32(end.Row), Character: uint32(end.Column)},
	}
}
