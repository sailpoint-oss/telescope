package parser

import (
	"encoding/json"
	"fmt"

	sitter "github.com/tree-sitter/go-tree-sitter"
	"gopkg.in/yaml.v3"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// Parser wraps tree-sitter YAML and JSON grammars for incremental parsing.
type Parser struct {
	yamlParser *sitter.Parser
	jsonParser *sitter.Parser
}

// NewParser creates a new parser with the given YAML and JSON languages.
func NewParser(yamlLang *sitter.Language, jsonLang *sitter.Language) *Parser {
	p := &Parser{}
	if yamlLang != nil {
		p.yamlParser = sitter.NewParser()
		p.yamlParser.SetLanguage(yamlLang)
	}
	if jsonLang != nil {
		p.jsonParser = sitter.NewParser()
		p.jsonParser.SetLanguage(jsonLang)
	}
	return p
}

// Parse performs a full parse of the content.
func (p *Parser) Parse(content []byte, format string) (*sitter.Tree, error) {
	parser := p.parserForFormat(format)
	if parser == nil {
		return nil, fmt.Errorf("no parser for format %q", format)
	}
	tree := parser.Parse(content, nil)
	if tree == nil {
		return nil, fmt.Errorf("parse returned nil tree")
	}
	return tree, nil
}

// IncrementalParse performs an incremental reparse after an edit.
func (p *Parser) IncrementalParse(oldTree *sitter.Tree, content []byte, format string) (*sitter.Tree, error) {
	parser := p.parserForFormat(format)
	if parser == nil {
		return nil, fmt.Errorf("no parser for format %q", format)
	}
	tree := parser.Parse(content, oldTree)
	if tree == nil {
		return nil, fmt.Errorf("incremental parse returned nil tree")
	}
	return tree, nil
}

// Close releases parser resources.
func (p *Parser) Close() {
	if p.yamlParser != nil {
		p.yamlParser.Close()
	}
	if p.jsonParser != nil {
		p.jsonParser.Close()
	}
}

func (p *Parser) parserForFormat(format string) *sitter.Parser {
	switch format {
	case "json":
		return p.jsonParser
	default:
		return p.yamlParser
	}
}

// ASTBuilder converts a tree-sitter CST into a SemanticNode IR tree.
type ASTBuilder struct {
	source  []byte
	anchors map[string]*SemanticNode
}

// BuildFromCST creates a SemanticNode tree from a tree-sitter root node.
func BuildFromCST(root *sitter.Node, source []byte) (*SemanticNode, error) {
	b := &ASTBuilder{
		source:  source,
		anchors: make(map[string]*SemanticNode),
	}
	return b.build(root), nil
}

func (b *ASTBuilder) build(node *sitter.Node) *SemanticNode {
	if node == nil {
		return nil
	}

	r := nodeRange(node)

	switch node.Kind() {
	case "stream", "document":
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			k := child.Kind()
			if k == "block_node" || k == "flow_node" || k == "block_mapping" || k == "flow_mapping" || k == "block_sequence" || k == "flow_sequence" || k == "document" {
				result := b.build(child)
				if result != nil && result.CST == nil {
					result.CST = node
				}
				return result
			}
		}
		return &SemanticNode{Kind: NodeNull, Range: r, CST: node}

	case "block_node", "flow_node":
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			k := child.Kind()
			if k == "anchor" {
				continue
			}
			if k == "tag" {
				continue
			}
			result := b.build(child)
			if result != nil {
				if result.CST == nil {
					result.CST = node
				}
				return result
			}
		}
		return &SemanticNode{Kind: NodeNull, Range: r, CST: node}

	case "block_mapping", "flow_mapping":
		n := &SemanticNode{Kind: NodeMapping, Range: r, Children: make(map[string]*SemanticNode), CST: node}
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil || (child.Kind() != "block_mapping_pair" && child.Kind() != "flow_pair") {
				continue
			}
			key := child.ChildByFieldName("key")
			val := child.ChildByFieldName("value")
			if key == nil {
				continue
			}
			keyStr := b.nodeText(key)
			if keyStr == "" {
				continue
			}
			var valNode *SemanticNode
			if val != nil {
				valNode = b.build(val)
			}
			if valNode == nil {
				valNode = &SemanticNode{Kind: NodeNull, Range: nodeRange(key), CST: key}
			}
			valNode.Key = keyStr
			n.Children[keyStr] = valNode
		}
		return n

	case "block_sequence", "flow_sequence":
		n := &SemanticNode{Kind: NodeSequence, Range: r, CST: node}
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			k := child.Kind()
			if k == "block_sequence_item" || k == "flow_node" || k == "block_node" {
				var item *SemanticNode
				if k == "block_sequence_item" {
					for j := uint(0); j < child.ChildCount(); j++ {
						inner := child.Child(j)
						if inner != nil && inner.Kind() != "-" {
							item = b.build(inner)
							break
						}
					}
				} else {
					item = b.build(child)
				}
				if item == nil {
					item = &SemanticNode{Kind: NodeNull, Range: nodeRange(child), CST: child}
				}
				n.Items = append(n.Items, item)
			}
		}
		return n

	case "plain_scalar", "double_quote_scalar", "single_quote_scalar",
		"string_scalar", "integer_scalar", "float_scalar", "boolean_scalar",
		"null_scalar":
		text := b.nodeText(node)
		return &SemanticNode{Kind: NodeScalar, Value: parseScalarValue(text), Range: r, CST: node}

	case "block_scalar":
		text := b.nodeText(node)
		return &SemanticNode{Kind: NodeScalar, Value: text, Range: r, CST: node}

	case "alias":
		name := b.nodeText(node)
		if len(name) > 1 && name[0] == '*' {
			name = name[1:]
		}
		if anchor, ok := b.anchors[name]; ok {
			return anchor
		}
		return &SemanticNode{Kind: NodeNull, Range: r, Alias: name, CST: node}

	default:
		for i := uint(0); i < node.ChildCount(); i++ {
			child := node.Child(i)
			if child == nil {
				continue
			}
			result := b.build(child)
			if result != nil && result.Kind != NodeNull {
				if result.CST == nil {
					result.CST = node
				}
				return result
			}
		}
		return &SemanticNode{Kind: NodeNull, Range: r, CST: node}
	}
}

func (b *ASTBuilder) nodeText(node *sitter.Node) string {
	start := node.StartByte()
	end := node.EndByte()
	if start >= uint(len(b.source)) || end > uint(len(b.source)) {
		return ""
	}
	text := string(b.source[start:end])
	// Strip quotes from quoted scalars
	if len(text) >= 2 && (text[0] == '"' || text[0] == '\'') && text[len(text)-1] == text[0] {
		text = text[1 : len(text)-1]
	}
	return text
}

func nodeRange(node *sitter.Node) ctypes.Range {
	start := node.StartPosition()
	end := node.EndPosition()
	return ctypes.Range{
		Start: ctypes.Position{Line: uint32(start.Row), Character: uint32(start.Column)},
		End:   ctypes.Position{Line: uint32(end.Row), Character: uint32(end.Column)},
	}
}

func parseScalarValue(text string) any {
	switch text {
	case "true", "True", "TRUE":
		return true
	case "false", "False", "FALSE":
		return false
	case "null", "Null", "NULL", "~":
		return nil
	}
	return text
}

// BuildFromRaw creates a SemanticNode from raw YAML/JSON bytes without tree-sitter.
// This fallback uses gopkg.in/yaml.v3 to produce a basic semantic tree.
func BuildFromRaw(content []byte, format string) *SemanticNode {
	var data any
	switch format {
	case "json":
		if err := json.Unmarshal(content, &data); err != nil {
			return &SemanticNode{Kind: NodeNull}
		}
	default:
		if err := yaml.Unmarshal(content, &data); err != nil {
			return &SemanticNode{Kind: NodeNull}
		}
	}
	return goValueToNode(data)
}

func goValueToNode(v any) *SemanticNode {
	if v == nil {
		return &SemanticNode{Kind: NodeNull}
	}
	switch val := v.(type) {
	case map[string]any:
		node := &SemanticNode{Kind: NodeMapping, Children: make(map[string]*SemanticNode)}
		for k, child := range val {
			cn := goValueToNode(child)
			cn.Key = k
			node.Children[k] = cn
		}
		return node
	case []any:
		node := &SemanticNode{Kind: NodeSequence}
		for _, item := range val {
			node.Items = append(node.Items, goValueToNode(item))
		}
		return node
	default:
		return &SemanticNode{Kind: NodeScalar, Value: val}
	}
}
