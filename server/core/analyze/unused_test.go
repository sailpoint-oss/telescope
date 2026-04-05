package analyze

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func TestFindUnusedComponents_AllUsed(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///api.yaml", []byte(""), graph.ClassificationHint{}))

	g.AddEdge(graph.Edge{
		SourceURI:     "file:///api.yaml",
		SourcePointer: "/paths/~1pets/get/responses/200/content/application~1json/schema/$ref",
		TargetURI:     "file:///api.yaml",
		TargetPointer: "/components/schemas/Pet",
		Kind:          graph.EdgeRef,
		RefValue:      "#/components/schemas/Pet",
	})

	components := map[string][]ComponentEntry{
		"file:///api.yaml": {
			{Kind: "schemas", Name: "Pet", Range: ctypes.Range{}},
		},
	}

	unused := FindUnusedComponents(g, components)
	if len(unused) != 0 {
		t.Errorf("expected 0 unused, got %d", len(unused))
	}
}

func TestFindUnusedComponents_Unreferenced(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///api.yaml", []byte(""), graph.ClassificationHint{}))

	components := map[string][]ComponentEntry{
		"file:///api.yaml": {
			{Kind: "schemas", Name: "Pet", Range: ctypes.Range{}},
			{Kind: "schemas", Name: "Error", Range: ctypes.Range{}},
		},
	}

	// Only Pet is referenced
	g.AddEdge(graph.Edge{
		SourceURI:     "file:///api.yaml",
		SourcePointer: "/paths/~1pets/get/responses/200/content/application~1json/schema/$ref",
		TargetURI:     "file:///api.yaml",
		TargetPointer: "/components/schemas/Pet",
		Kind:          graph.EdgeRef,
		RefValue:      "#/components/schemas/Pet",
	})

	unused := FindUnusedComponents(g, components)
	if len(unused) != 1 {
		t.Fatalf("expected 1 unused, got %d", len(unused))
	}
	if unused[0].Name != "Error" {
		t.Errorf("expected Error to be unused, got %s", unused[0].Name)
	}
}

func TestFindUnusedComponents_Suppressed(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///api.yaml", []byte(""), graph.ClassificationHint{}))

	components := map[string][]ComponentEntry{
		"file:///api.yaml": {
			{Kind: "schemas", Name: "Pet", Range: ctypes.Range{}, Suppressed: true},
		},
	}

	unused := FindUnusedComponents(g, components)
	if len(unused) != 0 {
		t.Errorf("expected 0 unused (suppressed), got %d", len(unused))
	}
}

func TestFindUnusedComponents_CrossFile(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///api.yaml", []byte(""), graph.ClassificationHint{}))
	g.AddSource(graph.NewSyntheticSource("file:///models.yaml", []byte(""), graph.ClassificationHint{}))

	g.AddEdge(graph.Edge{
		SourceURI:     "file:///api.yaml",
		SourcePointer: "/paths/~1pets/get/responses/200/content/application~1json/schema/$ref",
		TargetURI:     "file:///models.yaml",
		TargetPointer: "/components/schemas/Pet",
		Kind:          graph.EdgeRef,
		RefValue:      "./models.yaml#/components/schemas/Pet",
	})

	components := map[string][]ComponentEntry{
		"file:///models.yaml": {
			{Kind: "schemas", Name: "Pet", Range: ctypes.Range{}},
		},
	}

	unused := FindUnusedComponents(g, components)
	if len(unused) != 0 {
		t.Errorf("expected 0 unused (cross-file ref), got %d", len(unused))
	}
}

func TestUnusedToDiagnostics(t *testing.T) {
	unused := []UnusedResult{
		{URI: "file:///api.yaml", Component: "schemas/Pet", Kind: "schemas", Name: "Pet"},
		{URI: "file:///api.yaml", Component: "responses/NotFound", Kind: "responses", Name: "NotFound"},
	}
	diags := UnusedToDiagnostics(unused)
	if len(diags["file:///api.yaml"]) != 2 {
		t.Errorf("expected 2 diagnostics, got %d", len(diags["file:///api.yaml"]))
	}
	if diags["file:///api.yaml"][0].Code != "unused-component" {
		t.Errorf("expected code 'unused-component', got %s", diags["file:///api.yaml"][0].Code)
	}
}
