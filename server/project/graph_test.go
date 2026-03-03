package project

import (
	"sort"
	"testing"
)

func TestFileGraph_AddEdge(t *testing.T) {
	g := NewFileGraph()
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///b.yaml", RefValue: "./b.yaml"})
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///c.yaml", RefValue: "./c.yaml"})
	g.AddEdge(RefEdge{FromURI: "file:///b.yaml", ToURI: "file:///c.yaml", RefValue: "./c.yaml"})

	deps := g.DependenciesOf("file:///a.yaml")
	sort.Strings(deps)
	if len(deps) != 2 || deps[0] != "file:///b.yaml" || deps[1] != "file:///c.yaml" {
		t.Errorf("DependenciesOf(a) = %v, want [b, c]", deps)
	}

	rdeps := g.DependentsOf("file:///c.yaml")
	sort.Strings(rdeps)
	if len(rdeps) != 2 || rdeps[0] != "file:///a.yaml" || rdeps[1] != "file:///b.yaml" {
		t.Errorf("DependentsOf(c) = %v, want [a, b]", rdeps)
	}
}

func TestFileGraph_RemoveEdgesFrom(t *testing.T) {
	g := NewFileGraph()
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///b.yaml"})
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///c.yaml"})
	g.AddEdge(RefEdge{FromURI: "file:///b.yaml", ToURI: "file:///c.yaml"})

	g.RemoveEdgesFrom("file:///a.yaml")

	if deps := g.DependenciesOf("file:///a.yaml"); len(deps) != 0 {
		t.Errorf("expected no deps for a after removal, got %v", deps)
	}

	rdeps := g.DependentsOf("file:///c.yaml")
	if len(rdeps) != 1 || rdeps[0] != "file:///b.yaml" {
		t.Errorf("DependentsOf(c) = %v, want [b]", rdeps)
	}
}

func TestFileGraph_TransitiveDependents(t *testing.T) {
	// c <- b <- a (a refs b, b refs c)
	g := NewFileGraph()
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///b.yaml"})
	g.AddEdge(RefEdge{FromURI: "file:///b.yaml", ToURI: "file:///c.yaml"})

	td := g.TransitiveDependentsOf("file:///c.yaml")
	sort.Strings(td)
	if len(td) != 2 || td[0] != "file:///a.yaml" || td[1] != "file:///b.yaml" {
		t.Errorf("TransitiveDependentsOf(c) = %v, want [a, b]", td)
	}
}

func TestFileGraph_TransitiveDependencies(t *testing.T) {
	g := NewFileGraph()
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///b.yaml"})
	g.AddEdge(RefEdge{FromURI: "file:///b.yaml", ToURI: "file:///c.yaml"})

	td := g.TransitiveDependenciesOf("file:///a.yaml")
	sort.Strings(td)
	if len(td) != 2 || td[0] != "file:///b.yaml" || td[1] != "file:///c.yaml" {
		t.Errorf("TransitiveDependenciesOf(a) = %v, want [b, c]", td)
	}
}

func TestFileGraph_AllURIs(t *testing.T) {
	g := NewFileGraph()
	g.AddEdge(RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///b.yaml"})

	uris := g.AllURIs()
	sort.Strings(uris)
	if len(uris) != 2 || uris[0] != "file:///a.yaml" || uris[1] != "file:///b.yaml" {
		t.Errorf("AllURIs = %v, want [a, b]", uris)
	}
}

func TestFileGraph_EdgesFrom(t *testing.T) {
	g := NewFileGraph()
	e := RefEdge{FromURI: "file:///a.yaml", ToURI: "file:///b.yaml", RefValue: "./b.yaml#/Foo"}
	g.AddEdge(e)

	edges := g.EdgesFrom("file:///a.yaml")
	if len(edges) != 1 || edges[0].RefValue != "./b.yaml#/Foo" {
		t.Errorf("EdgesFrom(a) = %v, want 1 edge with RefValue ./b.yaml#/Foo", edges)
	}
}
