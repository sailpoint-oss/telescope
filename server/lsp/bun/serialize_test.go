package bun

import (
	"testing"

	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/core/parser"
)

func TestPointersFromContent_IncludesOperationAndPathPointers(t *testing.T) {
	const uri = "file:///test-missing-summary.yaml"
	const content = `openapi: "3.0.0"
info:
  title: Missing Summary Test
  version: "1.0.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: Success
`

	pointers := PointersFromContent(content, uri)
	if len(pointers) == 0 {
		t.Fatal("expected pointer extraction from content")
	}
	if _, ok := pointers["/paths/~1users/get"]; !ok {
		t.Fatalf("expected operation pointer, got %v", pointers)
	}
	if _, ok := pointers["/paths/~1users"]; !ok {
		t.Fatalf("expected path item pointer, got %v", pointers)
	}
}

func TestSerializeDocNilNodeAndYAML(t *testing.T) {
	const uri = "file:///svc/openapi.yaml"
	got := SerializeDoc(uri, nil, nil)
	if got.URI != uri || got.AST != nil || got.RawText != "" {
		t.Fatalf("nil node: %+v", got)
	}

	raw := []byte(`openapi: "3.0.0"
info:
  title: T
  version: "1.0"
paths: {}
`)
	node := &graph.GraphNode{Raw: raw}
	got = SerializeDoc(uri, node, nil)
	if got.Format != "yaml" || got.Version != "3.0.0" || got.RawText == "" {
		t.Fatalf("yaml doc: format=%q version=%q", got.Format, got.Version)
	}
	if len(got.AST) == 0 {
		t.Fatal("expected AST map")
	}
}

func TestSerializeDocJSONSuffix(t *testing.T) {
	uri := "file:///svc/openapi.json"
	raw := []byte(`{"openapi":"3.1.0","info":{"title":"T","version":"1"},"paths":{}}`)
	node := &graph.GraphNode{Raw: []byte(raw)}
	got := SerializeDoc(uri, node, nil)
	if got.Format != "json" || got.Version != "3.1.0" {
		t.Fatalf("json doc: %+v", got)
	}
}

func TestSerializeDocUsesSnapshotPointerIndex(t *testing.T) {
	const uri = "file:///svc/spec.yaml"
	raw := []byte(`openapi: "3.0.0"
info:
  title: T
  version: "1.0"
paths: {}
`)
	node := &graph.GraphNode{Raw: []byte(raw)}
	pi := parser.NewPointerIndex()
	pi.Set("/openapi", navigator.Range{Start: navigator.Position{Line: 0, Character: 0}, End: navigator.Position{Line: 0, Character: 1}})
	snap := &graph.Snapshot{
		PointerIndices: map[string]*parser.PointerIndex{uri: pi},
	}
	got := SerializeDoc(uri, node, snap)
	if len(got.Pointers) != 1 {
		t.Fatalf("expected snapshot pointers, got %v", got.Pointers)
	}
}

func TestSerializeIndexNilAndCrossFile(t *testing.T) {
	if idx := SerializeIndex(nil); len(idx.OperationIDs)+len(idx.Tags)+len(idx.ComponentRefs) != 0 {
		t.Fatalf("nil snapshot index: %+v", idx)
	}

	const uri = "file:///svc/api.yaml"
	yaml := []byte(`openapi: "3.0.0"
info:
  title: Svc
  version: "1.0"
tags:
  - name: Alpha
paths:
  /items:
    get:
      operationId: listItems
      responses:
        "200":
          description: ok
components:
  schemas:
    Item:
      type: object
`)
	snap := &graph.Snapshot{
		Nodes: map[string]graph.SnapshotNode{
			uri: {URI: uri, Raw: yaml},
		},
	}
	idx := SerializeIndex(snap)
	if _, ok := idx.OperationIDs["listItems"]; !ok {
		t.Fatalf("missing operationId: %+v", idx.OperationIDs)
	}
	if _, ok := idx.Tags["Alpha"]; !ok {
		t.Fatalf("missing tag: %+v", idx.Tags)
	}
	ref := "#/components/schemas/Item"
	if _, ok := idx.ComponentRefs[ref]; !ok {
		t.Fatalf("missing component ref %q: %+v", ref, idx.ComponentRefs)
	}
}

func TestSerializeRawContentInvalid(t *testing.T) {
	if _, err := SerializeRawContent([]byte("{"), "json"); err == nil {
		t.Fatal("expected json error")
	}
	if _, err := SerializeRawContent([]byte("|\n\t"), "yaml"); err == nil {
		t.Fatal("expected yaml error")
	}
}
