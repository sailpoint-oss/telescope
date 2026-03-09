package graph

import (
	"context"
	"testing"
)

func TestPipelineRunner_DefaultStages(t *testing.T) {
	runner, err := NewPipelineRunner(DefaultStages(), nil)
	if err != nil {
		t.Fatal(err)
	}

	stages := runner.Stages()
	if len(stages) != 6 {
		t.Fatalf("expected 6 stages, got %d: %v", len(stages), stages)
	}

	// Verify topological order: raw < parse < lint < bind < validate < analyze
	stageIdx := make(map[StageName]int)
	for i, s := range stages {
		stageIdx[s] = i
	}
	deps := map[StageName]StageName{
		StageParse:    StageRaw,
		StageLint:     StageParse,
		StageBind:     StageLint,
		StageValidate: StageBind,
		StageAnalyze:  StageValidate,
	}
	for stage, dep := range deps {
		if stageIdx[stage] <= stageIdx[dep] {
			t.Errorf("stage %s (idx %d) should come after %s (idx %d)", stage, stageIdx[stage], dep, stageIdx[dep])
		}
	}
}

func TestPipelineRunner_RunAll(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///test.yaml", []byte("openapi: 3.1.0"), ClassificationHint{IsOpenAPI: true}))

	runner, err := NewPipelineRunner(DefaultStages(), nil)
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	if err := runner.RunAll(ctx, "file:///test.yaml", g); err != nil {
		t.Fatal(err)
	}

	// All stages should have results
	for _, stage := range runner.Stages() {
		if r := g.StageResult("file:///test.yaml", stage); r == nil {
			t.Errorf("stage %s has no result", stage)
		}
	}
}

func TestPipelineRunner_Caching(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///cached.yaml", []byte("test"), ClassificationHint{}))

	runner, err := NewPipelineRunner(DefaultStages(), nil)
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	if err := runner.RunAll(ctx, "file:///cached.yaml", g); err != nil {
		t.Fatal(err)
	}

	// Running again should use cached results (no error since stages are still valid)
	if err := runner.RunAll(ctx, "file:///cached.yaml", g); err != nil {
		t.Fatal(err)
	}
}

func TestPipelineRunner_RunThrough(t *testing.T) {
	g := NewWorkspaceGraph()
	g.AddSource(NewSyntheticSource("file:///partial.yaml", []byte("test"), ClassificationHint{}))

	runner, err := NewPipelineRunner(DefaultStages(), nil)
	if err != nil {
		t.Fatal(err)
	}

	ctx := context.Background()
	if err := runner.RunThrough(ctx, "file:///partial.yaml", g, StageLint); err != nil {
		t.Fatal(err)
	}

	// Stages up to Lint should have results
	for _, stage := range []StageName{StageRaw, StageParse, StageLint} {
		if r := g.StageResult("file:///partial.yaml", stage); r == nil {
			t.Errorf("stage %s has no result", stage)
		}
	}

	// Later stages should NOT have results
	for _, stage := range []StageName{StageBind, StageValidate, StageAnalyze} {
		if r := g.StageResult("file:///partial.yaml", stage); r != nil {
			t.Errorf("stage %s should not have result yet", stage)
		}
	}
}

func TestPipelineRunner_CyclicDependency(t *testing.T) {
	cyclic1 := &testStage{name: "a", deps: []StageName{"b"}}
	cyclic2 := &testStage{name: "b", deps: []StageName{"a"}}

	_, err := NewPipelineRunner([]Stage{cyclic1, cyclic2}, nil)
	if err == nil {
		t.Error("expected error for cyclic stage dependencies")
	}
}

type testStage struct {
	name StageName
	deps []StageName
}

func (s *testStage) Name() StageName        { return s.name }
func (s *testStage) DependsOn() []StageName { return s.deps }
func (s *testStage) Run(_ context.Context, uri string, g *WorkspaceGraph) error {
	g.SetStageResult(uri, s.name, &StageResult{Data: "ok", Version: 1})
	return nil
}
