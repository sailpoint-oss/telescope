package spectral

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func parseDoc(t *testing.T, input string) *yaml.Node {
	t.Helper()
	var doc yaml.Node
	if err := yaml.Unmarshal([]byte(input), &doc); err != nil {
		t.Fatalf("failed to parse YAML: %v", err)
	}
	return &doc
}

func TestEvaluateJSONPath(t *testing.T) {
	doc := parseDoc(t, `
openapi: "3.0.0"
info:
  title: Test API
  version: "1.0"
  contact:
    name: Test
paths:
  /pets:
    get:
      summary: List pets
  /users:
    get:
      summary: List users
`)

	t.Run("root property access", func(t *testing.T) {
		nodes, err := EvaluateJSONPath(doc, "$.info")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(nodes) != 1 {
			t.Fatalf("expected 1 node, got %d", len(nodes))
		}
		if nodes[0].Kind != yaml.MappingNode {
			t.Errorf("expected mapping node, got kind %d", nodes[0].Kind)
		}
	})

	t.Run("nested property access", func(t *testing.T) {
		nodes, err := EvaluateJSONPath(doc, "$.info.title")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(nodes) != 1 {
			t.Fatalf("expected 1 node, got %d", len(nodes))
		}
		if nodes[0].Value != "Test API" {
			t.Errorf("expected 'Test API', got %q", nodes[0].Value)
		}
	})

	t.Run("wildcard access on paths", func(t *testing.T) {
		nodes, err := EvaluateJSONPath(doc, "$.paths.*")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(nodes) != 2 {
			t.Errorf("expected 2 path items, got %d", len(nodes))
		}
	})

	t.Run("invalid expression returns error", func(t *testing.T) {
		_, err := EvaluateJSONPath(doc, "$[invalid")
		if err == nil {
			t.Error("expected error for invalid JSONPath")
		}
	})
}

func TestNodeValue(t *testing.T) {
	t.Run("scalar string", func(t *testing.T) {
		node := &yaml.Node{Kind: yaml.ScalarNode, Value: "hello", Tag: "!!str"}
		val := nodeValue(node)
		if s, ok := val.(string); !ok || s != "hello" {
			t.Errorf("expected 'hello', got %v", val)
		}
	})

	t.Run("scalar int", func(t *testing.T) {
		node := &yaml.Node{Kind: yaml.ScalarNode, Value: "42", Tag: "!!int"}
		val := nodeValue(node)
		if n, ok := val.(int); !ok || n != 42 {
			t.Errorf("expected 42, got %v (%T)", val, val)
		}
	})

	t.Run("nil node", func(t *testing.T) {
		val := nodeValue(nil)
		if val != nil {
			t.Errorf("expected nil, got %v", val)
		}
	})
}

func TestNodeField(t *testing.T) {
	doc := parseDoc(t, `
name: hello
version: "1.0"
`)
	root := doc.Content[0]

	t.Run("existing field", func(t *testing.T) {
		node := nodeField(root, "name")
		if node == nil {
			t.Fatal("expected non-nil node for 'name'")
		}
		if node.Value != "hello" {
			t.Errorf("expected 'hello', got %q", node.Value)
		}
	})

	t.Run("missing field", func(t *testing.T) {
		node := nodeField(root, "description")
		if node != nil {
			t.Error("expected nil for missing field")
		}
	})

	t.Run("nil node", func(t *testing.T) {
		node := nodeField(nil, "name")
		if node != nil {
			t.Error("expected nil for nil input")
		}
	})
}
