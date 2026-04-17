package spectral

import (
	"fmt"
	"sync"

	"github.com/vmware-labs/yaml-jsonpath/pkg/yamlpath"
	"gopkg.in/yaml.v3"
)

// jsonPathCache memoizes yamlpath.NewPath results keyed by the source
// expression. yamlpath.Path instances are safe for concurrent Find calls and
// immutable after construction, so sharing them is safe and avoids the parser
// rerun that previously happened for every rule evaluation.
type jsonPathCacheEntry struct {
	path *yamlpath.Path
	err  error
}

var jsonPathCache sync.Map // expr string -> *jsonPathCacheEntry

func cachedJSONPath(expr string) (*yamlpath.Path, error) {
	if cached, ok := jsonPathCache.Load(expr); ok {
		entry := cached.(*jsonPathCacheEntry)
		return entry.path, entry.err
	}
	path, err := yamlpath.NewPath(expr)
	entry := &jsonPathCacheEntry{path: path, err: err}
	actual, _ := jsonPathCache.LoadOrStore(expr, entry)
	return actual.(*jsonPathCacheEntry).path, actual.(*jsonPathCacheEntry).err
}

// EvaluateJSONPath compiles and evaluates a JSONPath expression against a YAML
// node tree. Returns all matching nodes with their source positions preserved.
// The parsed path is cached across calls; evaluation itself still runs per call.
func EvaluateJSONPath(root *yaml.Node, expr string) ([]*yaml.Node, error) {
	path, err := cachedJSONPath(expr)
	if err != nil {
		return nil, fmt.Errorf("invalid JSONPath %q: %w", expr, err)
	}
	results, err := path.Find(root)
	if err != nil {
		return nil, fmt.Errorf("JSONPath evaluation failed for %q: %w", expr, err)
	}
	return results, nil
}

// nodeValue decodes a yaml.Node into a Go value for function evaluation.
func nodeValue(node *yaml.Node) interface{} {
	if node == nil {
		return nil
	}
	switch node.Kind {
	case yaml.ScalarNode:
		return decodeScalar(node)
	case yaml.SequenceNode:
		var items []interface{}
		for _, child := range node.Content {
			items = append(items, nodeValue(child))
		}
		return items
	case yaml.MappingNode:
		m := make(map[string]interface{}, len(node.Content)/2)
		for i := 0; i+1 < len(node.Content); i += 2 {
			key := node.Content[i].Value
			m[key] = nodeValue(node.Content[i+1])
		}
		return m
	case yaml.DocumentNode:
		if len(node.Content) > 0 {
			return nodeValue(node.Content[0])
		}
		return nil
	case yaml.AliasNode:
		return nodeValue(node.Alias)
	}
	return nil
}

func decodeScalar(node *yaml.Node) interface{} {
	var val interface{}
	if err := node.Decode(&val); err != nil {
		return node.Value
	}
	return val
}

// nodeField returns the child node for a named field within a mapping node.
// Returns nil if the field is not found or the node is not a mapping.
func nodeField(node *yaml.Node, field string) *yaml.Node {
	if node == nil {
		return nil
	}
	n := node
	if n.Kind == yaml.DocumentNode && len(n.Content) > 0 {
		n = n.Content[0]
	}
	if n.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(n.Content); i += 2 {
		if n.Content[i].Value == field {
			return n.Content[i+1]
		}
	}
	return nil
}

// nodeHasField reports whether a mapping node contains the named field.
func nodeHasField(node *yaml.Node, field string) bool {
	return nodeField(node, field) != nil
}
