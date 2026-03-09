package parser

import (
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func pos(line, char uint32) ctypes.Position {
	return ctypes.Position{Line: line, Character: char}
}

func rng(sl, sc, el, ec uint32) ctypes.Range {
	return ctypes.Range{Start: pos(sl, sc), End: pos(el, ec)}
}

func TestSemanticNode_Get(t *testing.T) {
	root := &SemanticNode{
		Kind: NodeMapping,
		Children: map[string]*SemanticNode{
			"foo": {Kind: NodeScalar, Value: "bar", Key: "foo"},
			"baz": {Kind: NodeScalar, Value: 42, Key: "baz"},
		},
	}

	if got := root.Get("foo"); got == nil || got.StringValue() != "bar" {
		t.Errorf("Get(\"foo\") = %v, want scalar \"bar\"", got)
	}
	if got := root.Get("baz"); got == nil {
		t.Errorf("Get(\"baz\") = nil, want scalar 42")
	}
	if got := root.Get("missing"); got != nil {
		t.Errorf("Get(\"missing\") = %v, want nil", got)
	}

	// Non-mapping returns nil
	scalar := &SemanticNode{Kind: NodeScalar, Value: "x"}
	if got := scalar.Get("key"); got != nil {
		t.Errorf("scalar.Get(\"key\") = %v, want nil", got)
	}
}

func TestSemanticNode_Index(t *testing.T) {
	root := &SemanticNode{
		Kind: NodeSequence,
		Items: []*SemanticNode{
			{Kind: NodeScalar, Value: "a"},
			{Kind: NodeScalar, Value: "b"},
		},
	}

	if got := root.Index(0); got == nil || got.StringValue() != "a" {
		t.Errorf("Index(0) = %v, want \"a\"", got)
	}
	if got := root.Index(1); got == nil || got.StringValue() != "b" {
		t.Errorf("Index(1) = %v, want \"b\"", got)
	}
	if got := root.Index(-1); got != nil {
		t.Errorf("Index(-1) = %v, want nil", got)
	}
	if got := root.Index(2); got != nil {
		t.Errorf("Index(2) = %v, want nil", got)
	}

	// Non-sequence returns nil
	scalar := &SemanticNode{Kind: NodeScalar, Value: "x"}
	if got := scalar.Index(0); got != nil {
		t.Errorf("scalar.Index(0) = %v, want nil", got)
	}
}

func TestSemanticNode_StringValue(t *testing.T) {
	if got := (&SemanticNode{Kind: NodeScalar, Value: "hello"}).StringValue(); got != "hello" {
		t.Errorf("StringValue() = %q, want \"hello\"", got)
	}
	if got := (&SemanticNode{Kind: NodeScalar, Value: 42}).StringValue(); got != "" {
		t.Errorf("non-string scalar StringValue() = %q, want \"\"", got)
	}
	if got := (&SemanticNode{Kind: NodeMapping}).StringValue(); got != "" {
		t.Errorf("mapping StringValue() = %q, want \"\"", got)
	}
	if got := (*SemanticNode)(nil).StringValue(); got != "" {
		t.Errorf("nil StringValue() = %q, want \"\"", got)
	}
}

func TestSemanticNode_Walk(t *testing.T) {
	root := &SemanticNode{
		Kind: NodeMapping,
		Range: rng(0, 0, 5, 10),
		Children: map[string]*SemanticNode{
			"a": {
				Kind: NodeScalar,
				Value: "x",
				Range: rng(1, 2, 1, 3),
			},
			"b": {
				Kind: NodeSequence,
				Range: rng(2, 0, 4, 5),
				Items: []*SemanticNode{
					{Kind: NodeScalar, Value: "y", Range: rng(3, 2, 3, 3)},
				},
			},
		},
	}

	var visited []string
	root.Walk(func(path string, node *SemanticNode) {
		visited = append(visited, path)
	})

	want := []string{"", "/a", "/b", "/b/0"}
	if len(visited) != len(want) {
		t.Errorf("Walk visited %d nodes, want %d: %v", len(visited), len(want), visited)
	}
	seen := make(map[string]bool)
	for _, p := range visited {
		seen[p] = true
	}
	for _, p := range want {
		if !seen[p] {
			t.Errorf("Walk did not visit %q", p)
		}
	}
}

func TestBuildPointerIndex(t *testing.T) {
	root := &SemanticNode{
		Kind:  NodeMapping,
		Range: rng(0, 0, 10, 0),
		Children: map[string]*SemanticNode{
			"paths": {
				Kind:  NodeMapping,
				Range: rng(1, 0, 9, 0),
				Children: map[string]*SemanticNode{
					"/users": {
						Kind:  NodeMapping,
						Range: rng(2, 0, 6, 0),
						Children: map[string]*SemanticNode{
							"get": {
								Kind:  NodeMapping,
								Range: rng(3, 2, 5, 10),
								Children: map[string]*SemanticNode{
									"summary": {
										Kind:  NodeScalar,
										Value: "List users",
										Range: rng(4, 4, 4, 15),
									},
								},
							},
						},
					},
				},
			},
		},
	}

	idx := BuildPointerIndex(root)

	tests := []struct {
		pointer string
		line    uint32
	}{
		{"", 0},
		{"/paths", 1},
		{"/paths/~1users", 2},
		{"/paths/~1users/get", 3},
		{"/paths/~1users/get/summary", 4},
	}
	for _, tt := range tests {
		r, ok := idx.Get(tt.pointer)
		if !ok {
			t.Errorf("Get(%q) = _, false, want range at line %d", tt.pointer, tt.line)
			continue
		}
		if r.Start.Line != tt.line {
			t.Errorf("Get(%q).Start.Line = %d, want %d", tt.pointer, r.Start.Line, tt.line)
		}
	}

	all := idx.All()
	if len(all) != 5 {
		t.Errorf("All() has %d entries, want 5", len(all))
	}
}
