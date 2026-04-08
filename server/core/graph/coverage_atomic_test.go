package graph

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"time"

	navigator "github.com/sailpoint-oss/navigator"
)

func covSyntheticSource(uri string) *SyntheticSource {
	return NewSyntheticSource(uri, []byte("content"), ClassificationHint{})
}

func buildChainGraph() *WorkspaceGraph {
	g := NewWorkspaceGraph()
	for _, u := range []string{"A", "B", "C"} {
		g.AddSource(covSyntheticSource(u))
	}
	g.AddEdge(Edge{SourceURI: "A", TargetURI: "B", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "B", TargetURI: "C", Kind: EdgeRef})
	return g
}

func buildDiamondGraph() *WorkspaceGraph {
	g := NewWorkspaceGraph()
	for _, u := range []string{"A", "B", "C", "D"} {
		g.AddSource(covSyntheticSource(u))
	}
	g.AddEdge(Edge{SourceURI: "A", TargetURI: "B", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "A", TargetURI: "C", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "B", TargetURI: "D", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "C", TargetURI: "D", Kind: EdgeRef})
	return g
}

func buildCycleGraph() *WorkspaceGraph {
	g := NewWorkspaceGraph()
	for _, u := range []string{"A", "B", "C"} {
		g.AddSource(covSyntheticSource(u))
	}
	g.AddEdge(Edge{SourceURI: "A", TargetURI: "B", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "B", TargetURI: "C", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "C", TargetURI: "A", Kind: EdgeRef})
	return g
}

func sortedStrings(s []string) []string {
	out := make([]string, len(s))
	copy(out, s)
	sort.Strings(out)
	return out
}

func stringsEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// --- Dependents ---

func TestDependents_Chain(t *testing.T) {
	g := buildChainGraph()

	if got := sortedStrings(g.Dependents("B")); !stringsEqual(got, []string{"A"}) {
		t.Errorf("Dependents(B) = %v, want [A]", got)
	}
	if got := sortedStrings(g.Dependents("C")); !stringsEqual(got, []string{"B"}) {
		t.Errorf("Dependents(C) = %v, want [B]", got)
	}
	if got := g.Dependents("A"); len(got) != 0 {
		t.Errorf("Dependents(A) = %v, want []", got)
	}
}

func TestDependents_Diamond(t *testing.T) {
	g := buildDiamondGraph()
	got := sortedStrings(g.Dependents("D"))
	if !stringsEqual(got, []string{"B", "C"}) {
		t.Errorf("Dependents(D) = %v, want [B C]", got)
	}
}

func TestDependents_UnknownURI(t *testing.T) {
	g := buildChainGraph()
	if got := g.Dependents("MISSING"); len(got) != 0 {
		t.Errorf("Dependents(MISSING) = %v, want []", got)
	}
}

func TestDependents_DeduplicatesMultipleEdges(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("X"))
	g.AddSource(covSyntheticSource("Y"))
	g.AddEdge(Edge{SourceURI: "X", TargetURI: "Y", Kind: EdgeRef})
	g.AddEdge(Edge{SourceURI: "X", TargetURI: "Y", Kind: EdgePathRef})

	got := g.Dependents("Y")
	if len(got) != 1 || got[0] != "X" {
		t.Errorf("Dependents(Y) = %v, want [X] (deduplicated)", got)
	}
}

// --- Dependencies ---

func TestDependencies_Chain(t *testing.T) {
	g := buildChainGraph()

	if got := sortedStrings(g.Dependencies("A")); !stringsEqual(got, []string{"B"}) {
		t.Errorf("Dependencies(A) = %v, want [B]", got)
	}
	if got := sortedStrings(g.Dependencies("B")); !stringsEqual(got, []string{"C"}) {
		t.Errorf("Dependencies(B) = %v, want [C]", got)
	}
	if got := g.Dependencies("C"); len(got) != 0 {
		t.Errorf("Dependencies(C) = %v, want []", got)
	}
}

func TestDependencies_Diamond(t *testing.T) {
	g := buildDiamondGraph()
	got := sortedStrings(g.Dependencies("A"))
	if !stringsEqual(got, []string{"B", "C"}) {
		t.Errorf("Dependencies(A) = %v, want [B C]", got)
	}
}

func TestDependencies_UnknownURI(t *testing.T) {
	g := buildChainGraph()
	if got := g.Dependencies("MISSING"); len(got) != 0 {
		t.Errorf("Dependencies(MISSING) = %v, want []", got)
	}
}

// --- TransitiveDependencies ---

func TestTransitiveDependencies_Chain(t *testing.T) {
	g := buildChainGraph()

	got := sortedStrings(g.TransitiveDependencies("A"))
	if !stringsEqual(got, []string{"B", "C"}) {
		t.Errorf("TransitiveDependencies(A) = %v, want [B C]", got)
	}

	got = sortedStrings(g.TransitiveDependencies("B"))
	if !stringsEqual(got, []string{"C"}) {
		t.Errorf("TransitiveDependencies(B) = %v, want [C]", got)
	}

	if got := g.TransitiveDependencies("C"); len(got) != 0 {
		t.Errorf("TransitiveDependencies(C) = %v, want []", got)
	}
}

func TestTransitiveDependencies_Diamond(t *testing.T) {
	g := buildDiamondGraph()
	got := sortedStrings(g.TransitiveDependencies("A"))
	if !stringsEqual(got, []string{"B", "C", "D"}) {
		t.Errorf("TransitiveDependencies(A) = %v, want [B C D]", got)
	}
}

func TestTransitiveDependencies_WithCycle(t *testing.T) {
	g := buildCycleGraph()
	got := sortedStrings(g.TransitiveDependencies("A"))
	if !stringsEqual(got, []string{"B", "C"}) {
		t.Errorf("TransitiveDependencies(A) in cycle = %v, want [B C]", got)
	}
}

// --- TransitiveDependents ---

func TestTransitiveDependents_Chain(t *testing.T) {
	g := buildChainGraph()

	got := sortedStrings(g.TransitiveDependents("C"))
	if !stringsEqual(got, []string{"A", "B"}) {
		t.Errorf("TransitiveDependents(C) = %v, want [A B]", got)
	}

	got = sortedStrings(g.TransitiveDependents("B"))
	if !stringsEqual(got, []string{"A"}) {
		t.Errorf("TransitiveDependents(B) = %v, want [A]", got)
	}

	if got := g.TransitiveDependents("A"); len(got) != 0 {
		t.Errorf("TransitiveDependents(A) = %v, want []", got)
	}
}

func TestTransitiveDependents_Diamond(t *testing.T) {
	g := buildDiamondGraph()
	got := sortedStrings(g.TransitiveDependents("D"))
	if !stringsEqual(got, []string{"A", "B", "C"}) {
		t.Errorf("TransitiveDependents(D) = %v, want [A B C]", got)
	}
}

func TestTransitiveDependents_WithCycle(t *testing.T) {
	g := buildCycleGraph()
	got := sortedStrings(g.TransitiveDependents("A"))
	if !stringsEqual(got, []string{"B", "C"}) {
		t.Errorf("TransitiveDependents(A) in cycle = %v, want [B C]", got)
	}
}

// --- DetectCycles ---

func TestDetectCycles_NoCycle(t *testing.T) {
	g := buildChainGraph()
	if cycles := g.DetectCycles(); len(cycles) != 0 {
		t.Errorf("expected no cycles, got %v", cycles)
	}
}

func TestDetectCycles_DiamondNoCycle(t *testing.T) {
	g := buildDiamondGraph()
	if cycles := g.DetectCycles(); len(cycles) != 0 {
		t.Errorf("expected no cycles in diamond, got %v", cycles)
	}
}

func TestDetectCycles_SimpleCycle(t *testing.T) {
	g := buildCycleGraph()
	cycles := g.DetectCycles()
	if len(cycles) == 0 {
		t.Fatal("expected at least one cycle, got none")
	}

	found := false
	for _, cycle := range cycles {
		members := make(map[string]bool)
		for _, u := range cycle {
			members[u] = true
		}
		if members["A"] && members["B"] && members["C"] && len(cycle) == 3 {
			found = true
		}
	}
	if !found {
		t.Errorf("expected cycle containing {A,B,C}; got %v", cycles)
	}
}

func TestDetectCycles_SelfLoop(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("X"))
	g.AddEdge(Edge{SourceURI: "X", TargetURI: "X", Kind: EdgeRef})

	cycles := g.DetectCycles()
	if len(cycles) == 0 {
		t.Fatal("expected cycle for self-loop")
	}
}

func TestDetectCycles_EmptyGraph(t *testing.T) {
	g := NewWorkspaceGraph()
	if cycles := g.DetectCycles(); len(cycles) != 0 {
		t.Errorf("expected no cycles in empty graph, got %v", cycles)
	}
}

// --- PipelineRunner.RunStage ---

type covStage struct {
	name    StageName
	deps    []StageName
	runFunc func(ctx context.Context, uri string, g *WorkspaceGraph) error
}

func (s covStage) Name() StageName        { return s.name }
func (s covStage) DependsOn() []StageName { return s.deps }
func (s covStage) Run(ctx context.Context, uri string, g *WorkspaceGraph) error {
	if s.runFunc != nil {
		return s.runFunc(ctx, uri, g)
	}
	return nil
}

func TestRunStage_ExecutesNamedStage(t *testing.T) {
	var ran bool
	stages := []Stage{
		covStage{name: "alpha", runFunc: func(_ context.Context, _ string, _ *WorkspaceGraph) error {
			ran = true
			return nil
		}},
	}
	runner, err := NewPipelineRunner(stages, nil)
	if err != nil {
		t.Fatal(err)
	}

	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("test"))

	if err := runner.RunStage(context.Background(), "test", g, "alpha"); err != nil {
		t.Fatalf("RunStage: %v", err)
	}
	if !ran {
		t.Error("stage was not executed")
	}
}

func TestRunStage_UnknownStageReturnsError(t *testing.T) {
	runner, err := NewPipelineRunner([]Stage{covStage{name: "only"}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := runner.RunStage(context.Background(), "x", NewWorkspaceGraph(), "missing"); err == nil {
		t.Error("expected error for unknown stage name")
	}
}

func TestRunStage_PropagatesRunError(t *testing.T) {
	stages := []Stage{
		covStage{name: "fail", runFunc: func(_ context.Context, _ string, _ *WorkspaceGraph) error {
			return fmt.Errorf("boom")
		}},
	}
	runner, err := NewPipelineRunner(stages, nil)
	if err != nil {
		t.Fatal(err)
	}

	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("x"))
	if err := runner.RunStage(context.Background(), "x", g, "fail"); err == nil {
		t.Error("expected propagated error")
	}
}

func TestRunStage_SkipsOtherStages(t *testing.T) {
	var firstRan, secondRan bool
	stages := []Stage{
		covStage{name: "first", runFunc: func(_ context.Context, _ string, _ *WorkspaceGraph) error {
			firstRan = true
			return nil
		}},
		covStage{name: "second", deps: []StageName{"first"}, runFunc: func(_ context.Context, _ string, _ *WorkspaceGraph) error {
			secondRan = true
			return nil
		}},
	}
	runner, err := NewPipelineRunner(stages, nil)
	if err != nil {
		t.Fatal(err)
	}

	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("u"))

	if err := runner.RunStage(context.Background(), "u", g, "second"); err != nil {
		t.Fatal(err)
	}
	if firstRan {
		t.Error("RunStage should only run the named stage, not its dependencies")
	}
	if !secondRan {
		t.Error("RunStage should have run the named stage")
	}
}

// --- SnapshotManager.Enqueue / BuildNext ---

func TestSnapshotManager_EnqueueAndBuildNext(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("file://a.yaml"))
	g.AddSource(covSyntheticSource("file://b.yaml"))

	mgr := NewSnapshotManager()
	mgr.Enqueue("file://a.yaml")
	mgr.Enqueue("file://b.yaml")

	snap := mgr.BuildNext(context.Background(), g, nil)
	if snap == nil {
		t.Fatal("expected non-nil snapshot")
	}
	if snap.ID == 0 {
		t.Error("expected snapshot ID > 0")
	}
	if len(snap.Nodes) != 2 {
		t.Errorf("expected 2 nodes, got %d", len(snap.Nodes))
	}
}

func TestSnapshotManager_BuildNextClearsQueue(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("file://x.yaml"))

	mgr := NewSnapshotManager()
	mgr.Enqueue("file://x.yaml")
	snap1 := mgr.BuildNext(context.Background(), g, nil)

	snap2 := mgr.BuildNext(context.Background(), g, nil)
	if snap2.ID <= snap1.ID {
		t.Error("expected strictly increasing snapshot IDs")
	}
}

func TestSnapshotManager_BuildNextRunsPipeline(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("file://a.yaml"))

	var ran bool
	stages := []Stage{
		covStage{name: "s", runFunc: func(_ context.Context, uri string, g *WorkspaceGraph) error {
			ran = true
			g.SetStageResult(uri, "s", &StageResult{Stage: "s", Version: 1})
			return nil
		}},
	}
	runner, err := NewPipelineRunner(stages, nil)
	if err != nil {
		t.Fatal(err)
	}

	mgr := NewSnapshotManager()
	mgr.Enqueue("file://a.yaml")
	mgr.BuildNext(context.Background(), g, runner)
	if !ran {
		t.Error("expected pipeline stage to execute for enqueued URI")
	}
}

func TestSnapshotManager_BuildNextRespectsCancel(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("file://a.yaml"))
	g.AddSource(covSyntheticSource("file://b.yaml"))

	var count int
	stages := []Stage{
		covStage{name: "slow", runFunc: func(_ context.Context, uri string, g *WorkspaceGraph) error {
			count++
			g.SetStageResult(uri, "slow", &StageResult{Stage: "slow", Version: 1})
			return nil
		}},
	}
	runner, err := NewPipelineRunner(stages, nil)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	mgr := NewSnapshotManager()
	mgr.Enqueue("file://a.yaml")
	mgr.Enqueue("file://b.yaml")
	mgr.BuildNext(ctx, g, runner)
}

func TestSnapshotManager_EnqueueDeduplicates(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(covSyntheticSource("file://a.yaml"))

	var count int
	stages := []Stage{
		covStage{name: "cnt", runFunc: func(_ context.Context, uri string, g *WorkspaceGraph) error {
			count++
			g.SetStageResult(uri, "cnt", &StageResult{Stage: "cnt", Version: 1})
			return nil
		}},
	}
	runner, err := NewPipelineRunner(stages, nil)
	if err != nil {
		t.Fatal(err)
	}

	mgr := NewSnapshotManager()
	mgr.Enqueue("file://a.yaml")
	mgr.Enqueue("file://a.yaml")
	mgr.Enqueue("file://a.yaml")
	mgr.BuildNext(context.Background(), g, runner)

	if count != 1 {
		t.Errorf("expected stage to run once (dedup), ran %d times", count)
	}
}

// --- FilesystemSource.Watch ---

func TestFilesystemSource_WatchDetectsWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "watch.yaml")
	if err := os.WriteFile(path, []byte("v1"), 0644); err != nil {
		t.Fatal(err)
	}

	src := NewFilesystemSource(path, ClassificationHint{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	events := make(chan navigator.WatchEvent, 10)
	cleanup := src.Watch(ctx, func(_ string, ev navigator.WatchEvent) {
		events <- ev
	})
	defer cleanup()

	time.Sleep(100 * time.Millisecond)
	os.WriteFile(path, []byte("v2"), 0644)

	select {
	case ev := <-events:
		if ev != navigator.WatchModify && ev != navigator.WatchCreate {
			t.Errorf("expected modify/create event, got %d", ev)
		}
	case <-time.After(2 * time.Second):
		t.Error("timed out waiting for watch event")
	}
}

func TestFilesystemSource_WatchNilCallbackReturnsNoop(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nil.yaml")
	os.WriteFile(path, []byte("x"), 0644)

	src := NewFilesystemSource(path, ClassificationHint{})
	cleanup := src.Watch(context.Background(), nil)
	cleanup()
}

func TestFilesystemSource_WatchCancelStops(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "cancel.yaml")
	os.WriteFile(path, []byte("x"), 0644)

	src := NewFilesystemSource(path, ClassificationHint{})
	ctx, cancel := context.WithCancel(context.Background())

	events := make(chan navigator.WatchEvent, 10)
	cleanup := src.Watch(ctx, func(_ string, ev navigator.WatchEvent) {
		events <- ev
	})

	cancel()
	time.Sleep(50 * time.Millisecond)
	cleanup()
}

func TestFilesystemSource_WatchContextCancel(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "ctx.yaml")
	os.WriteFile(path, []byte("x"), 0644)

	src := NewFilesystemSource(path, ClassificationHint{})
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	cleanup := src.Watch(ctx, func(_ string, _ navigator.WatchEvent) {})
	time.Sleep(100 * time.Millisecond)
	cleanup()
}

// --- FilesystemSource.Hint ---

func TestFilesystemSource_HintReturnsProvided(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "hint.yaml")
	os.WriteFile(path, []byte("x"), 0644)

	hint := ClassificationHint{IsOpenAPI: true, OpenAPIVersion: "3.1.0", IsFragment: true}
	src := NewFilesystemSource(path, hint)

	got := src.Hint()
	if !got.IsOpenAPI || got.OpenAPIVersion != "3.1.0" || !got.IsFragment {
		t.Errorf("Hint() = %+v, want %+v", got, hint)
	}
}
