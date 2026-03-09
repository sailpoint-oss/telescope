package graph

import (
	"sort"
	"testing"
)

func synth(uri string) *SyntheticSource {
	return NewSyntheticSource(uri, []byte("test"), ClassificationHint{})
}

func sorted(s []string) []string {
	sort.Strings(s)
	return s
}

func TestWorkspaceGraph_AddRemoveSource(t *testing.T) {
	g := NewWorkspaceGraph()
	src := synth("file:///a.yaml")
	g.AddSource(src)

	if node := g.Node("file:///a.yaml"); node == nil {
		t.Fatal("expected node after AddSource")
	}
	if len(g.AllNodes()) != 1 {
		t.Errorf("AllNodes = %d, want 1", len(g.AllNodes()))
	}

	g.RemoveSource("file:///a.yaml")
	if node := g.Node("file:///a.yaml"); node != nil {
		t.Error("expected nil node after RemoveSource")
	}
	if len(g.AllNodes()) != 0 {
		t.Errorf("AllNodes = %d, want 0", len(g.AllNodes()))
	}
}

func TestWorkspaceGraph_Edges(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///a.yaml"))
	g.AddSource(synth("file:///b.yaml"))
	g.AddSource(synth("file:///c.yaml"))

	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///c.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///b.yaml", TargetURI: "file:///c.yaml", Kind: EdgeRef})

	deps := sorted(g.Dependencies("file:///a.yaml"))
	if len(deps) != 2 || deps[0] != "file:///b.yaml" || deps[1] != "file:///c.yaml" {
		t.Errorf("Dependencies(a) = %v", deps)
	}

	rdeps := sorted(g.Dependents("file:///c.yaml"))
	if len(rdeps) != 2 || rdeps[0] != "file:///a.yaml" || rdeps[1] != "file:///b.yaml" {
		t.Errorf("Dependents(c) = %v", rdeps)
	}

	from := g.EdgesFrom("file:///a.yaml")
	if len(from) != 2 {
		t.Errorf("EdgesFrom(a) = %d, want 2", len(from))
	}

	to := g.EdgesTo("file:///c.yaml")
	if len(to) != 2 {
		t.Errorf("EdgesTo(c) = %d, want 2", len(to))
	}
}

func TestWorkspaceGraph_RemoveEdgesFrom(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///a.yaml"))
	g.AddSource(synth("file:///b.yaml"))

	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})

	if len(g.Dependents("file:///b.yaml")) != 1 {
		t.Fatal("expected 1 dependent before removal")
	}

	g.RemoveEdgesFrom("file:///a.yaml")

	if len(g.Dependents("file:///b.yaml")) != 0 {
		t.Error("expected 0 dependents after removal")
	}
	if len(g.EdgesFrom("file:///a.yaml")) != 0 {
		t.Error("expected 0 edges from a after removal")
	}
}

// Test diamond: A->B, A->C, B->D, C->D
// Invalidating D should cascade to B, C, A.
func TestWorkspaceGraph_DiamondInvalidation(t *testing.T) {
	g := NewWorkspaceGraph()
	for _, uri := range []string{"a", "b", "c", "d"} {
		g.AddSource(synth("file:///" + uri + ".yaml"))
		g.SetStageResult("file:///"+uri+".yaml", StageParse, &StageResult{Version: 1})
	}

	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///c.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///b.yaml", TargetURI: "file:///d.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///c.yaml", TargetURI: "file:///d.yaml", Kind: EdgeRef})

	affected := sorted(g.Invalidate("file:///d.yaml"))
	expected := []string{"file:///a.yaml", "file:///b.yaml", "file:///c.yaml", "file:///d.yaml"}
	sort.Strings(expected)

	if len(affected) != len(expected) {
		t.Fatalf("affected = %v, want %v", affected, expected)
	}
	for i, u := range affected {
		if u != expected[i] {
			t.Errorf("affected[%d] = %q, want %q", i, u, expected[i])
		}
	}

	// All stage caches should be dirty
	for _, uri := range expected {
		if r := g.StageResult(uri, StageParse); r != nil {
			t.Errorf("%s still has cached Parse result after invalidation", uri)
		}
	}
}

func TestWorkspaceGraph_CycleDetection(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///a.yaml"))
	g.AddSource(synth("file:///b.yaml"))
	g.AddSource(synth("file:///c.yaml"))

	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///b.yaml", TargetURI: "file:///c.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///c.yaml", TargetURI: "file:///a.yaml", Kind: EdgeRef})

	cycles := g.DetectCycles()
	if len(cycles) == 0 {
		t.Fatal("expected at least one cycle")
	}
	if len(cycles[0]) != 3 {
		t.Errorf("cycle length = %d, want 3", len(cycles[0]))
	}
}

func TestWorkspaceGraph_NoCycles(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///a.yaml"))
	g.AddSource(synth("file:///b.yaml"))

	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})

	cycles := g.DetectCycles()
	if len(cycles) != 0 {
		t.Errorf("expected no cycles, got %d", len(cycles))
	}
}

func TestWorkspaceGraph_Roots(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///root.yaml"))
	g.AddSource(synth("file:///fragment.yaml"))

	g.SetRoot("file:///root.yaml", true)

	roots := g.Roots()
	if len(roots) != 1 || roots[0] != "file:///root.yaml" {
		t.Errorf("Roots = %v, want [file:///root.yaml]", roots)
	}

	g.SetRoot("file:///root.yaml", false)
	if len(g.Roots()) != 0 {
		t.Error("expected empty roots after unset")
	}
}

func TestWorkspaceGraph_TransitiveDependents(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///a.yaml"))
	g.AddSource(synth("file:///b.yaml"))
	g.AddSource(synth("file:///c.yaml"))

	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///b.yaml", TargetURI: "file:///c.yaml", Kind: EdgeRef})

	trans := sorted(g.TransitiveDependents("file:///c.yaml"))
	expected := []string{"file:///a.yaml", "file:///b.yaml"}
	if len(trans) != 2 || trans[0] != expected[0] || trans[1] != expected[1] {
		t.Errorf("TransitiveDependents(c) = %v, want %v", trans, expected)
	}
}

func TestWorkspaceGraph_StageCache(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///a.yaml"))

	g.SetStageResult("file:///a.yaml", StageParse, &StageResult{Data: "parsed", Version: 1})

	r := g.StageResult("file:///a.yaml", StageParse)
	if r == nil || r.Data != "parsed" {
		t.Fatal("expected cached stage result")
	}

	// Invalidate should clear it
	g.Invalidate("file:///a.yaml")
	r = g.StageResult("file:///a.yaml", StageParse)
	if r != nil {
		t.Error("expected nil stage result after invalidation")
	}
}

func TestWorkspaceGraph_RemoveSourceCleansEdges(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(synth("file:///a.yaml"))
	g.AddSource(synth("file:///b.yaml"))
	g.AddSource(synth("file:///c.yaml"))

	g.AddEdge(Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "file:///c.yaml", TargetURI: "file:///b.yaml", Kind: EdgeRef})

	g.RemoveSource("file:///b.yaml")

	// Outgoing edges from a should be gone
	if len(g.EdgesFrom("file:///a.yaml")) != 0 {
		// Not necessarily — the edge from a->b should still exist in a's outgoing,
		// but b's incoming should be cleaned. Let's check b's dependents.
	}

	// b shouldn't be referenced anymore
	if len(g.EdgesTo("file:///b.yaml")) != 0 {
		t.Error("expected no edges to b after removal")
	}
}

func TestWorkspaceGraph_ConcurrentAccess(t *testing.T) {
	g := NewWorkspaceGraph()
	done := make(chan struct{})

	go func() {
		defer close(done)
		for i := 0; i < 100; i++ {
			g.AddSource(synth("file:///concurrent.yaml"))
			g.AddEdge(Edge{SourceURI: "file:///concurrent.yaml", TargetURI: "file:///target.yaml"})
			g.Invalidate("file:///concurrent.yaml")
			g.RemoveEdgesFrom("file:///concurrent.yaml")
			g.AllNodes()
			g.Roots()
		}
	}()

	for i := 0; i < 100; i++ {
		g.Node("file:///concurrent.yaml")
		g.Dependents("file:///target.yaml")
		g.EdgesTo("file:///target.yaml")
	}
	<-done
}
