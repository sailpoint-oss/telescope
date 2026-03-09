package parser

import (
	"strconv"

	sitter "github.com/tree-sitter/go-tree-sitter"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

type NodeKind int

const (
	NodeMapping  NodeKind = iota
	NodeSequence
	NodeScalar
	NodeNull
)

type SemanticNode struct {
	Kind     NodeKind
	Value    any              // Go native value for scalars
	Range    ctypes.Range     // source range from tree-sitter
	Key      string           // for mapping entries: the key name
	Children map[string]*SemanticNode // for mappings: key -> child
	Items    []*SemanticNode          // for sequences: ordered items
	Tag      string           // YAML tag if present
	Anchor   string           // YAML anchor if present
	Alias    string           // YAML alias reference if present
	CST      *sitter.Node     // retained for cheap re-queries against the tree-sitter CST
}

// Get retrieves a child by key for mapping nodes. Returns nil for non-mappings.
func (n *SemanticNode) Get(key string) *SemanticNode {
	if n == nil || n.Kind != NodeMapping || n.Children == nil {
		return nil
	}
	return n.Children[key]
}

// Index retrieves an item by index for sequence nodes. Returns nil if out of range.
func (n *SemanticNode) Index(i int) *SemanticNode {
	if n == nil || n.Kind != NodeSequence || n.Items == nil {
		return nil
	}
	if i < 0 || i >= len(n.Items) {
		return nil
	}
	return n.Items[i]
}

// StringValue returns the string value of a scalar node, or empty string.
func (n *SemanticNode) StringValue() string {
	if n == nil || n.Kind != NodeScalar {
		return ""
	}
	if s, ok := n.Value.(string); ok {
		return s
	}
	return ""
}

// Walk calls fn for every node in the tree depth-first.
func (n *SemanticNode) Walk(fn func(path string, node *SemanticNode)) {
	if n == nil {
		return
	}
	var walk func(path string, node *SemanticNode)
	walk = func(path string, node *SemanticNode) {
		if node == nil {
			return
		}
		fn(path, node)
		switch node.Kind {
		case NodeMapping:
			for k, child := range node.Children {
				childPath := path + "/" + escapePointerSegment(k)
				walk(childPath, child)
			}
		case NodeSequence:
			for i, item := range node.Items {
				childPath := path + "/" + strconv.Itoa(i)
				walk(childPath, item)
			}
		}
	}
	walk("", n)
}

// escapePointerSegment escapes a JSON pointer segment per RFC 6901.
func escapePointerSegment(s string) string {
	if s == "" {
		return ""
	}
	var b []byte
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch c {
		case '~':
			b = append(b, '~', '0')
		case '/':
			b = append(b, '~', '1')
		default:
			b = append(b, c)
		}
	}
	return string(b)
}
