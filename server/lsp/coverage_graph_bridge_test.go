package lsp

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/core/graph"
)

func TestGraphBridge_NilSafe_CurrentSnapshot(t *testing.T) {
	b := &GraphBridge{
		graph:   graph.NewWorkspaceGraph(),
		snapMgr: graph.NewSnapshotManager(),
	}
	snap := b.CurrentSnapshot()
	if snap != nil {
		t.Error("CurrentSnapshot should be nil before any build")
	}
}

func TestGraphBridge_BuildSnapshot(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{
		graph:   g,
		snapMgr: graph.NewSnapshotManager(),
	}
	snap := b.BuildSnapshot()
	if snap == nil {
		t.Fatal("BuildSnapshot returned nil")
	}
	if snap.ID == 0 {
		t.Error("snapshot ID should be > 0")
	}
}

func TestGraphBridge_CurrentSnapshot_AfterBuild(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{
		graph:   g,
		snapMgr: graph.NewSnapshotManager(),
	}
	built := b.BuildSnapshot()
	current := b.CurrentSnapshot()
	if current != built {
		t.Error("CurrentSnapshot should return the most recently built snapshot")
	}
}

func TestGraphBridge_SnapshotManager(t *testing.T) {
	sm := graph.NewSnapshotManager()
	b := &GraphBridge{snapMgr: sm}
	if b.SnapshotManager() != sm {
		t.Error("SnapshotManager() should return the stored snapshot manager")
	}
}

func TestGraphBridge_Pipeline_Nil(t *testing.T) {
	b := &GraphBridge{}
	if b.Pipeline() != nil {
		t.Error("Pipeline() should be nil when not set")
	}
}

func TestGraphBridge_SnapshotNode_NilSnapshot(t *testing.T) {
	b := &GraphBridge{
		graph:   graph.NewWorkspaceGraph(),
		snapMgr: graph.NewSnapshotManager(),
	}
	node := b.SnapshotNode("file:///missing.yaml")
	if node != nil {
		t.Error("SnapshotNode should return nil when no snapshot exists")
	}
}

func TestGraphBridge_SnapshotNode_MissingURI(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{
		graph:   g,
		snapMgr: graph.NewSnapshotManager(),
	}
	b.BuildSnapshot()
	node := b.SnapshotNode("file:///nonexistent.yaml")
	if node != nil {
		t.Error("SnapshotNode should return nil for unknown URI")
	}
}

func TestGraphBridge_SnapshotPointerIndex_NilSnapshot(t *testing.T) {
	b := &GraphBridge{
		graph:   graph.NewWorkspaceGraph(),
		snapMgr: graph.NewSnapshotManager(),
	}
	idx := b.SnapshotPointerIndex("file:///test.yaml")
	if idx != nil {
		t.Error("SnapshotPointerIndex should return nil when no snapshot exists")
	}
}

func TestGraphBridge_EdgesFrom_Empty(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	edges := b.EdgesFrom("file:///nowhere.yaml")
	if len(edges) != 0 {
		t.Errorf("expected 0 edges, got %d", len(edges))
	}
}

func TestGraphBridge_FindReferences_Empty(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	locs := b.FindReferences("file:///test.yaml")
	if len(locs) != 0 {
		t.Errorf("expected 0 locations, got %d", len(locs))
	}
}

func TestGraphBridge_Graph_Accessor(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	if b.Graph() != g {
		t.Error("Graph() should return the stored graph")
	}
}

func TestGraphBridge_HasIncomingRefs_Empty(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	if b.HasIncomingRefs("file:///test.yaml") {
		t.Error("HasIncomingRefs should be false for empty graph")
	}
}

func TestGraphBridge_Dependents_Empty(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	deps := b.Dependents("file:///test.yaml")
	if len(deps) != 0 {
		t.Errorf("expected 0 dependents, got %d", len(deps))
	}
}

func TestGraphBridge_Dependencies_Empty(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	deps := b.Dependencies("file:///test.yaml")
	if len(deps) != 0 {
		t.Errorf("expected 0 dependencies, got %d", len(deps))
	}
}

func TestGraphBridge_EdgesTo_Empty(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	edges := b.EdgesTo("file:///test.yaml")
	if len(edges) != 0 {
		t.Errorf("expected 0 edges, got %d", len(edges))
	}
}

func TestGraphBridge_LookupDefinition_NotFound(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	b := &GraphBridge{graph: g}
	_, _, found := b.LookupDefinition("file:///a.yaml", "./b.yaml#/components/schemas/Foo")
	if found {
		t.Error("expected not found for empty graph")
	}
}

func TestGraphResolveRefTarget(t *testing.T) {
	tests := []struct {
		name    string
		baseURI string
		ref     string
		want    string
	}{
		{"empty ref returns base", "file:///a.yaml", "", "file:///a.yaml"},
		{"local ref returns base", "file:///a.yaml", "#/foo", "file:///a.yaml"},
		{"relative file ref", "file:///dir/a.yaml", "b.yaml#/foo", "file:///dir/b.yaml"},
		{"relative file no fragment", "file:///dir/a.yaml", "b.yaml", "file:///dir/b.yaml"},
		{"non-file scheme returns file part", "http://example.com/a", "b.yaml#/x", "b.yaml"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := graphResolveRefTarget(tt.baseURI, tt.ref)
			if got != tt.want {
				t.Errorf("graphResolveRefTarget(%q, %q) = %q, want %q", tt.baseURI, tt.ref, got, tt.want)
			}
		})
	}
}

func TestGraphExtractFragment(t *testing.T) {
	tests := []struct {
		ref  string
		want string
	}{
		{"#/components/schemas/Foo", "/components/schemas/Foo"},
		{"b.yaml#/paths", "/paths"},
		{"no-fragment", ""},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.ref, func(t *testing.T) {
			got := graphExtractFragment(tt.ref)
			if got != tt.want {
				t.Errorf("graphExtractFragment(%q) = %q, want %q", tt.ref, got, tt.want)
			}
		})
	}
}

func TestNormalizeURIStr(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"file:///a.yaml", "file:///a.yaml"},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := normalizeURIStr(tt.input)
			if got != tt.want {
				t.Errorf("normalizeURIStr(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
