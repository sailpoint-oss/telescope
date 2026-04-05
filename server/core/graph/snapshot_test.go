package graph

import (
	"sync"
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func TestSnapshotManager_BuildProducesCorrectNodeData(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///a.yaml", []byte("openapi: 3.1"), ClassificationHint{}))
	g.SetRoot("file:///a.yaml", true)
	g.SetStageResult("file:///a.yaml", StageRaw, &StageResult{Data: "raw-data", Version: 1})
	g.SetStageResult("file:///a.yaml", StageParse, &StageResult{Data: "parsed-data", Version: 1})

	// Manually set Raw and Version on the node (pipeline would do this)
	if node := g.Node("file:///a.yaml"); node != nil {
		node.Raw = []byte("openapi: 3.1")
		node.Version = 1
		node.Diagnostics = []ctypes.Diagnostic{
			{Message: "test diagnostic"},
		}
	}

	m := NewSnapshotManager()
	snap := m.Build(g)

	if snap == nil {
		t.Fatal("Build returned nil snapshot")
	}
	if snap.ID != 1 {
		t.Errorf("snap.ID = %d, want 1", snap.ID)
	}

	node, ok := snap.Nodes["file:///a.yaml"]
	if !ok {
		t.Fatal("expected node file:///a.yaml in snapshot")
	}
	if node.URI != "file:///a.yaml" {
		t.Errorf("node.URI = %q, want file:///a.yaml", node.URI)
	}
	if node.Version != 1 {
		t.Errorf("node.Version = %d, want 1", node.Version)
	}
	if string(node.Raw) != "openapi: 3.1" {
		t.Errorf("node.Raw = %q, want openapi: 3.1", node.Raw)
	}
	if node.StageResults[StageRaw] != "raw-data" {
		t.Errorf("StageResults[raw] = %v, want raw-data", node.StageResults[StageRaw])
	}
	if node.StageResults[StageParse] != "parsed-data" {
		t.Errorf("StageResults[parse] = %v, want parsed-data", node.StageResults[StageParse])
	}

	diags := snap.Diagnostics["file:///a.yaml"]
	if len(diags) != 1 || diags[0].Message != "test diagnostic" {
		t.Errorf("Diagnostics = %v, want [{Message: test diagnostic}]", diags)
	}

	if len(snap.Roots) != 1 || snap.Roots[0] != "file:///a.yaml" {
		t.Errorf("Roots = %v, want [file:///a.yaml]", snap.Roots)
	}
}

func TestSnapshotManager_CurrentReturnsLatest(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///a.yaml", []byte("a"), ClassificationHint{}))

	m := NewSnapshotManager()
	if m.Current() != nil {
		t.Error("Current() should be nil before first Build")
	}

	snap1 := m.Build(g)
	if m.Current() != snap1 {
		t.Error("Current() should return first snapshot after Build")
	}

	g.AddSource(NewSyntheticSource("file:///b.yaml", []byte("b"), ClassificationHint{}))
	snap2 := m.Build(g)
	if m.Current() != snap2 {
		t.Error("Current() should return second snapshot after second Build")
	}
	if snap1 == snap2 {
		t.Error("snap1 and snap2 should be different instances")
	}
}

func TestSnapshotManager_MultipleBuildsProduceIncreasingIDs(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///a.yaml", []byte("a"), ClassificationHint{}))

	m := NewSnapshotManager()
	var ids []uint64
	for i := 0; i < 5; i++ {
		snap := m.Build(g)
		ids = append(ids, snap.ID)
	}

	for i := 1; i < len(ids); i++ {
		if ids[i] != ids[i-1]+1 {
			t.Errorf("IDs not monotonic: ids[%d]=%d, ids[%d]=%d", i-1, ids[i-1], i, ids[i])
		}
	}
}

func TestSnapshotManager_OnSnapshotCallbackFires(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///a.yaml", []byte("a"), ClassificationHint{}))

	m := NewSnapshotManager()
	var received *Snapshot
	m.OnSnapshot(func(s *Snapshot) {
		received = s
	})

	snap := m.Build(g)
	if received != snap {
		t.Error("OnSnapshot callback should receive the new snapshot")
	}
	if received.ID != snap.ID {
		t.Errorf("callback received snapshot with ID %d, want %d", received.ID, snap.ID)
	}
}

func TestSnapshotManager_ConcurrentReadsSafe(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///a.yaml", []byte("a"), ClassificationHint{}))

	m := NewSnapshotManager()
	m.Build(g)

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				snap := m.Current()
				if snap != nil {
					_ = snap.Nodes
					_ = snap.Diagnostics
					_ = snap.Roots
				}
			}
		}()
	}
	wg.Wait()
}
