package checks

import (
	"fmt"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var duplicateKeysMeta = rules.RuleMeta{
	ID:          "duplicate-keys",
	Description: "Reports duplicate mapping keys in YAML/JSON objects.",
	Severity:    protocol.SeverityError,
	Category:    rules.CategorySyntax,
	Recommended: true,
	HowToFix:    "Remove or rename the duplicate key.",
	DocURL:      rules.DocBaseURL + "duplicate-keys",
}

func registerDuplicateKeys(s *gossip.Server) {
	s.Analyze("duplicate-keys", treesitter.Analyzer{
		Scope:         treesitter.ScopeFile,
		InterestKinds: []string{"block_mapping", "flow_mapping", "object"},
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			root := ctx.Tree.RootNode()
			if root == nil {
				return nil
			}
			var diags []protocol.Diagnostic
			walkForDuplicates(root, ctx.Tree, &diags)
			return diags
		},
	})
}

func walkForDuplicates(node *tree_sitter.Node, tree *treesitter.Tree, diags *[]protocol.Diagnostic) {
	if node == nil {
		return
	}

	kind := node.Kind()
	if kind == "block_mapping" || kind == "flow_mapping" || kind == "object" {
		seen := make(map[string]protocol.Range)
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			ck := child.Kind()
			if ck == "block_mapping_pair" || ck == "flow_pair" || ck == "pair" {
				keyNode := child.ChildByFieldName("key")
				if keyNode == nil {
					continue
				}
				keyText := unquoteKey(tree.NodeText(keyNode))
				keyRange := treesitter.NodeRange(keyNode)

				if firstRange, exists := seen[keyText]; exists {
					*diags = append(*diags, protocol.Diagnostic{
						Range:    keyRange,
						Severity: protocol.SeverityError,
						Source:   rules.Source,
						Code:     "duplicate-keys",
						CodeDescription: &protocol.CodeDescription{
							Href: protocol.URI(duplicateKeysMeta.DocURL),
						},
						Message: fmt.Sprintf(
							"Duplicate key '%s' (first defined at line %d)",
							keyText, firstRange.Start.Line+1,
						),
					})
				} else {
					seen[keyText] = keyRange
				}
			}
		}
	}

	for i := uint(0); i < node.ChildCount(); i++ {
		child := node.Child(i)
		if child != nil {
			walkForDuplicates(child, tree, diags)
		}
	}
}

func unquoteKey(s string) string {
	if len(s) >= 2 {
		if (s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'') {
			return s[1 : len(s)-1]
		}
	}
	return s
}
