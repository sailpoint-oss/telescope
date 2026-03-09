package observe

import (
	"encoding/hex"
	"regexp"
	"sync"
	"testing"
	"time"

	"github.com/sailpoint-oss/telescope/server/core/graph"
)

func TestTraceAttr(t *testing.T) {
	attr := TraceAttr()
	if attr.Key != "trace_id" {
		t.Errorf("TraceAttr().Key = %q, want trace_id", attr.Key)
	}
	val, ok := attr.Value.Any().(string)
	if !ok {
		t.Fatal("TraceAttr().Value is not a string")
	}
	decoded, err := hex.DecodeString(val)
	if err != nil {
		t.Errorf("trace_id %q is not valid hex: %v", val, err)
	}
	if len(decoded) != 16 {
		t.Errorf("trace_id decodes to %d bytes, want 16", len(decoded))
	}
	re := regexp.MustCompile(`^[0-9a-f]{32}$`)
	if !re.MatchString(val) {
		t.Errorf("trace_id %q does not match expected hex format", val)
	}
}

func TestCollectGraphInfo(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///a.yaml", []byte("test"), graph.ClassificationHint{}))
	g.AddSource(graph.NewSyntheticSource("file:///b.yaml", []byte("test"), graph.ClassificationHint{}))
	g.AddEdge(graph.Edge{SourceURI: "file:///a.yaml", TargetURI: "file:///b.yaml", Kind: graph.EdgeRef})
	g.SetRoot("file:///a.yaml", true)

	info := CollectGraphInfo(g, nil)
	if info.NodeCount != 2 {
		t.Errorf("NodeCount = %d, want 2", info.NodeCount)
	}
	if info.EdgeCount != 1 {
		t.Errorf("EdgeCount = %d, want 1", info.EdgeCount)
	}
	if info.RootCount != 1 {
		t.Errorf("RootCount = %d, want 1", info.RootCount)
	}
	if info.StageDurations == nil {
		t.Error("StageDurations should be non-nil")
	}
	if info.MemoryUsageMB < 0 {
		t.Errorf("MemoryUsageMB = %f, want >= 0", info.MemoryUsageMB)
	}
	if info.SnapshotVersion != 0 {
		t.Errorf("SnapshotVersion = %d, want 0 when snap is nil", info.SnapshotVersion)
	}

	g.SetStageResult("file:///a.yaml", graph.StageParse, &graph.StageResult{Data: "x", Version: 1})
	g.Invalidate("file:///a.yaml")
	info2 := CollectGraphInfo(g, nil)
	if info2.DirtyNodeCount < 1 {
		t.Errorf("DirtyNodeCount = %d, want >= 1 after invalidation", info2.DirtyNodeCount)
	}
}

func TestCollectGraphInfo_WithSnapshot(t *testing.T) {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource("file:///a.yaml", []byte("test"), graph.ClassificationHint{}))
	snapMgr := graph.NewSnapshotManager()
	snap := snapMgr.Build(g)

	info := CollectGraphInfo(g, snap)
	if info.SnapshotVersion != int64(snap.ID) {
		t.Errorf("SnapshotVersion = %d, want %d", info.SnapshotVersion, snap.ID)
	}
}

func TestCollectGraphInfo_NilGraph(t *testing.T) {
	info := CollectGraphInfo(nil, nil)
	if info.NodeCount != 0 || info.EdgeCount != 0 || info.RootCount != 0 {
		t.Errorf("CollectGraphInfo(nil) should return zero counts, got %+v", info)
	}
}

func TestRulePerfTracker(t *testing.T) {
	tracker := NewRulePerfTracker()

	tracker.Record("rule-a", 10*time.Millisecond, 2)
	tracker.Record("rule-b", 5*time.Millisecond, 0)
	tracker.Record("rule-a", 15*time.Millisecond, 3)

	perf := tracker.Collect()
	if len(perf.Rules) != 2 {
		t.Errorf("len(Rules) = %d, want 2", len(perf.Rules))
	}
	var ruleA, ruleB *RuleTiming
	for i := range perf.Rules {
		switch perf.Rules[i].RuleID {
		case "rule-a":
			ruleA = &perf.Rules[i]
		case "rule-b":
			ruleB = &perf.Rules[i]
		}
	}
	if ruleA == nil || ruleA.Duration != 25 || ruleA.Count != 5 {
		t.Errorf("rule-a: got Duration=%d Count=%d, want 25, 5", ruleA.Duration, ruleA.Count)
	}
	if ruleB == nil || ruleB.Duration != 5 || ruleB.Count != 0 {
		t.Errorf("rule-b: got Duration=%d Count=%d, want 5, 0", ruleB.Duration, ruleB.Count)
	}

	tracker.Reset()
	perf2 := tracker.Collect()
	if len(perf2.Rules) != 0 {
		t.Errorf("after Reset, len(Rules) = %d, want 0", len(perf2.Rules))
	}
}

func TestRulePerfTracker_Concurrent(t *testing.T) {
	tracker := NewRulePerfTracker()
	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				tracker.Record("concurrent-rule", time.Millisecond, 1)
			}
		}()
	}
	wg.Wait()

	perf := tracker.Collect()
	if len(perf.Rules) != 1 {
		t.Fatalf("len(Rules) = %d, want 1", len(perf.Rules))
	}
	rt := perf.Rules[0]
	if rt.RuleID != "concurrent-rule" {
		t.Errorf("RuleID = %q, want concurrent-rule", rt.RuleID)
	}
	if rt.Duration != 1000 {
		t.Errorf("Duration = %d, want 1000 (10*100*1ms)", rt.Duration)
	}
	if rt.Count != 1000 {
		t.Errorf("Count = %d, want 1000", rt.Count)
	}
}
