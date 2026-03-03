package project

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestExtractExternalRefs(t *testing.T) {
	idx := &openapi.Index{
		AllRefs: []openapi.RefUsage{
			{Target: "#/components/schemas/Foo"},                // local -- should be skipped
			{Target: "./schemas/user.yaml#/User"},               // external
			{Target: "../common/error.yaml#/components/schemas/Error"}, // external
			{Target: ""},                                        // empty -- should be skipped
		},
		Refs: make(map[string][]openapi.RefUsage),
	}

	sourceURI := "file:///workspace/api.yaml"
	edges := ExtractExternalRefs(sourceURI, idx)

	if len(edges) != 2 {
		t.Fatalf("expected 2 external edges, got %d: %+v", len(edges), edges)
	}

	if edges[0].ToURI != "file:///workspace/schemas/user.yaml" {
		t.Errorf("edge[0].ToURI = %q, want file:///workspace/schemas/user.yaml", edges[0].ToURI)
	}
	if edges[0].ToPointer != "/User" {
		t.Errorf("edge[0].ToPointer = %q, want /User", edges[0].ToPointer)
	}
	if edges[1].ToURI != "file:///common/error.yaml" {
		t.Errorf("edge[1].ToURI = %q, want file:///common/error.yaml", edges[1].ToURI)
	}
}

func TestResolveRelativeURI(t *testing.T) {
	tests := []struct {
		base    string
		rel     string
		want    string
	}{
		{"file:///workspace/api.yaml", "./schemas/user.yaml", "file:///workspace/schemas/user.yaml"},
		{"file:///workspace/api.yaml", "../common/error.yaml", "file:///common/error.yaml"},
		{"file:///workspace/api.yaml", "https://example.com/schema.json", ""},
		{"file:///workspace/api.yaml", "", ""},
	}

	for _, tt := range tests {
		got := resolveRelativeURI(tt.base, tt.rel)
		if got != tt.want {
			t.Errorf("resolveRelativeURI(%q, %q) = %q, want %q", tt.base, tt.rel, got, tt.want)
		}
	}
}

func TestCollectExternalRefTargets(t *testing.T) {
	idx := &openapi.Index{
		AllRefs: []openapi.RefUsage{
			{Target: "./schemas/user.yaml#/User"},
			{Target: "./schemas/user.yaml#/Address"}, // same file, different pointer
			{Target: "./schemas/pet.yaml"},
		},
		Refs: make(map[string][]openapi.RefUsage),
	}

	targets := CollectExternalRefTargets("file:///workspace/api.yaml", idx)
	if len(targets) != 2 {
		t.Fatalf("expected 2 unique targets, got %d: %v", len(targets), targets)
	}
}

func TestUpdateGraphFromIndex(t *testing.T) {
	g := NewFileGraph()
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///old.yaml"})

	idx := &openapi.Index{
		AllRefs: []openapi.RefUsage{
			{Target: "./new.yaml#/Foo"},
		},
		Refs: make(map[string][]openapi.RefUsage),
	}

	UpdateGraphFromIndex(g, "file:///a.yaml", idx)

	deps := g.DependenciesOf("file:///a.yaml")
	if len(deps) != 1 || deps[0] != "file:///new.yaml" {
		t.Errorf("after update, deps = %v, want [file:///new.yaml]", deps)
	}

	oldRdeps := g.DependentsOf("file:///old.yaml")
	if len(oldRdeps) != 0 {
		t.Errorf("old.yaml should have no rdeps, got %v", oldRdeps)
	}
}
