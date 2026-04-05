package graph

import (
	"context"
	"testing"

	navigator "github.com/sailpoint-oss/navigator"
	navgraph "github.com/sailpoint-oss/navigator/graph"
)

type stubSource struct {
	uri     string
	content []byte
}

func (s *stubSource) URI() string { return s.uri }
func (s *stubSource) Read(_ context.Context) ([]byte, int64, error) {
	return s.content, 1, nil
}
func (s *stubSource) Watch(_ context.Context, _ func(string, navigator.WatchEvent)) func() {
	return func() {}
}
func (s *stubSource) Hint() navigator.ClassificationHint {
	return navigator.ClassificationHint{}
}

func TestHasIncomingRefs_NoEdges(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(&stubSource{uri: "file:///a.yaml"})
	if g.HasIncomingRefs("file:///a.yaml") {
		t.Error("expected no incoming refs for isolated node")
	}
}

func TestHasIncomingRefs_WithRef(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(&stubSource{uri: "file:///root.yaml"})
	g.AddSource(&stubSource{uri: "file:///schema.yaml"})
	g.AddEdge(Edge{
		SourceURI: "file:///root.yaml",
		TargetURI: "file:///schema.yaml",
		Kind:      EdgeRef,
	})
	if !g.HasIncomingRefs("file:///schema.yaml") {
		t.Error("expected incoming refs for $ref target")
	}
	if g.HasIncomingRefs("file:///root.yaml") {
		t.Error("root should have no incoming refs")
	}
}

func TestHasIncomingRefs_AfterEdgeRemoval(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(&stubSource{uri: "file:///root.yaml"})
	g.AddSource(&stubSource{uri: "file:///schema.yaml"})
	g.AddEdge(Edge{
		SourceURI: "file:///root.yaml",
		TargetURI: "file:///schema.yaml",
		Kind:      EdgeRef,
	})
	g.RemoveEdgesFrom("file:///root.yaml")
	if g.HasIncomingRefs("file:///schema.yaml") {
		t.Error("expected no incoming refs after edge removal")
	}
}

func TestHasIncomingRefs_MultipleRefs(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(&stubSource{uri: "file:///root1.yaml"})
	g.AddSource(&stubSource{uri: "file:///root2.yaml"})
	g.AddSource(&stubSource{uri: "file:///shared.yaml"})

	g.AddEdge(Edge{SourceURI: "file:///root1.yaml", TargetURI: "file:///shared.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///root2.yaml", TargetURI: "file:///shared.yaml", Kind: EdgeRef})

	if !g.HasIncomingRefs("file:///shared.yaml") {
		t.Error("shared schema should have incoming refs from both roots")
	}
	g.RemoveEdgesFrom("file:///root1.yaml")
	if !g.HasIncomingRefs("file:///shared.yaml") {
		t.Error("shared schema should still have incoming refs from root2")
	}
	g.RemoveEdgesFrom("file:///root2.yaml")
	if g.HasIncomingRefs("file:///shared.yaml") {
		t.Error("shared schema should have no refs after all edges removed")
	}
}

func TestHasIncomingRefs_NonExistentURI(t *testing.T) {
	g := NewWorkspaceGraph()
	if g.HasIncomingRefs("file:///does-not-exist.yaml") {
		t.Error("non-existent URI should not have incoming refs")
	}
}

func TestHasIncomingRefs_AfterSourceRemoval(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(&stubSource{uri: "file:///root.yaml"})
	g.AddSource(&stubSource{uri: "file:///schema.yaml"})
	g.AddEdge(Edge{
		SourceURI: "file:///root.yaml",
		TargetURI: "file:///schema.yaml",
		Kind:      EdgeRef,
	})
	g.RemoveSource("file:///root.yaml")
	if g.HasIncomingRefs("file:///schema.yaml") {
		t.Error("incoming refs should be cleaned up when source is removed")
	}
}

func TestAddEdge_CreatesReverseIndex(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(&stubSource{uri: "file:///a.yaml"})
	g.AddSource(&stubSource{uri: "file:///b.yaml"})
	g.AddEdge(Edge{
		SourceURI: "file:///a.yaml",
		TargetURI: "file:///b.yaml",
		Kind:      navgraph.EdgeRef,
	})
	edges := g.EdgesTo("file:///b.yaml")
	if len(edges) != 1 {
		t.Fatalf("expected 1 incoming edge, got %d", len(edges))
	}
	if edges[0].SourceURI != "file:///a.yaml" {
		t.Errorf("expected source=a.yaml, got %s", edges[0].SourceURI)
	}
}

func TestInvalidate_Cascades(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(&stubSource{uri: "file:///root.yaml"})
	g.AddSource(&stubSource{uri: "file:///mid.yaml"})
	g.AddSource(&stubSource{uri: "file:///leaf.yaml"})

	g.AddEdge(Edge{SourceURI: "file:///root.yaml", TargetURI: "file:///mid.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///mid.yaml", TargetURI: "file:///leaf.yaml", Kind: EdgeRef})

	g.SetStageResult("file:///root.yaml", StageRaw, &StageResult{Stage: StageRaw})

	affected := g.Invalidate("file:///leaf.yaml")
	if len(affected) != 3 {
		t.Errorf("expected 3 affected nodes from leaf invalidation, got %d: %v", len(affected), affected)
	}

	result := g.StageResult("file:///root.yaml", StageRaw)
	if result != nil {
		t.Error("root stage result should be dirty after cascade invalidation")
	}
}
