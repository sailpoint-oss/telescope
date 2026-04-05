package analyze

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/core/graph"
)

func TestBundlePreview_SingleRoot(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///api.yaml", []byte("root"), graph.ClassificationHint{}))

	result := BundlePreview(g, BundleOptions{RootURI: "file:///api.yaml"})
	if result.RootURI != "file:///api.yaml" {
		t.Errorf("expected root URI file:///api.yaml, got %s", result.RootURI)
	}
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}
}

func TestBundlePreview_WithDependencies(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///api.yaml", []byte("root"), graph.ClassificationHint{}))
	g.AddSource(graph.NewSyntheticSource("file:///models.yaml", []byte("models"), graph.ClassificationHint{}))
	g.AddSource(graph.NewSyntheticSource("file:///errors.yaml", []byte("errors"), graph.ClassificationHint{}))

	g.AddEdge(graph.Edge{
		SourceURI: "file:///api.yaml",
		TargetURI: "file:///models.yaml",
		Kind:      graph.EdgeRef,
		RefValue:  "./models.yaml#/Pet",
	})
	g.AddEdge(graph.Edge{
		SourceURI: "file:///api.yaml",
		TargetURI: "file:///errors.yaml",
		Kind:      graph.EdgeRef,
		RefValue:  "./errors.yaml#/Error",
	})

	result := BundlePreview(g, BundleOptions{RootURI: "file:///api.yaml"})
	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got %v", result.Errors)
	}
}

func TestBundlePreview_MissingRoot(t *testing.T) {
	g := graph.NewWorkspaceGraph()

	result := BundlePreview(g, BundleOptions{RootURI: "file:///missing.yaml"})
	if len(result.Errors) == 0 {
		t.Error("expected error for missing root")
	}
}

func TestBundlePreview_NilGraph(t *testing.T) {
	result := BundlePreview(nil, BundleOptions{RootURI: "file:///api.yaml"})
	if len(result.Errors) == 0 {
		t.Error("expected error for nil graph")
	}
}

func TestDependencyOrder_Linear(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("a", []byte(""), graph.ClassificationHint{}))
	g.AddSource(graph.NewSyntheticSource("b", []byte(""), graph.ClassificationHint{}))
	g.AddSource(graph.NewSyntheticSource("c", []byte(""), graph.ClassificationHint{}))

	g.AddEdge(graph.Edge{SourceURI: "a", TargetURI: "b", Kind: graph.EdgeRef})
	g.AddEdge(graph.Edge{SourceURI: "b", TargetURI: "c", Kind: graph.EdgeRef})

	order := DependencyOrder(g, "a")
	if len(order) != 3 {
		t.Fatalf("expected 3 URIs, got %d", len(order))
	}
	if order[0] != "a" {
		t.Errorf("expected root first, got %s", order[0])
	}
}

func TestDependencyOrder_NilGraph(t *testing.T) {
	order := DependencyOrder(nil, "a")
	if order != nil {
		t.Error("expected nil for nil graph")
	}
}
