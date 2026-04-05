package sdk

import (
	"context"
	"testing"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func TestWorkspace_NewAndClose(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatal(err)
	}
	if err := ws.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspace_AddAndAnalyze(t *testing.T) {
	ws, err := New(WithBuiltinRules(true))
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()

	src := graph.NewSyntheticSource(
		"file:///test-api.yaml",
		[]byte(`openapi: "3.1.0"
info:
  title: Test API
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      responses:
        "200":
          description: OK`),
		graph.ClassificationHint{IsOpenAPI: true},
	)
	ws.AddSource(src)

	ctx := context.Background()
	result, err := ws.Analyze(ctx)
	if err != nil {
		t.Fatal(err)
	}

	if result.NodeCount != 1 {
		t.Errorf("NodeCount = %d, want 1", result.NodeCount)
	}
	if result.Duration < 0 {
		t.Error("expected non-negative duration")
	}
	if result.SnapshotID == 0 {
		t.Error("expected non-zero snapshot ID")
	}
}

func TestWorkspace_AnalyzeURI(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()

	src := graph.NewSyntheticSource(
		"file:///single.yaml",
		[]byte("openapi: 3.1.0"),
		graph.ClassificationHint{IsOpenAPI: true},
	)
	ws.AddSource(src)

	ctx := context.Background()
	diags, err := ws.AnalyzeURI(ctx, "file:///single.yaml")
	if err != nil {
		t.Fatal(err)
	}
	// With default pipeline stages (placeholders), no diagnostics are generated
	_ = diags
}

func TestWorkspace_RemoveSource(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()

	src := graph.NewSyntheticSource("file:///remove.yaml", []byte("test"), graph.ClassificationHint{})
	ws.AddSource(src)
	ws.RemoveSource("file:///remove.yaml")

	nodes := ws.Graph().AllNodes()
	if len(nodes) != 0 {
		t.Errorf("expected 0 nodes after removal, got %d", len(nodes))
	}
}

func TestWorkspace_Graph(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()

	ws.AddSource(graph.NewSyntheticSource("file:///a.yaml", []byte("a"), graph.ClassificationHint{}))
	ws.AddSource(graph.NewSyntheticSource("file:///b.yaml", []byte("b"), graph.ClassificationHint{}))

	g := ws.Graph()
	nodes := g.AllNodes()
	if len(nodes) != 2 {
		t.Errorf("expected 2 nodes, got %d", len(nodes))
	}
}

func TestWorkspace_Snapshot(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatal(err)
	}
	defer ws.Close()

	ws.AddSource(graph.NewSyntheticSource("file:///snap.yaml", []byte("test"), graph.ClassificationHint{}))

	if ws.Snapshot() != nil {
		t.Error("expected nil snapshot before analyze")
	}

	ctx := context.Background()
	_, err = ws.Analyze(ctx)
	if err != nil {
		t.Fatal(err)
	}

	snap := ws.Snapshot()
	if snap == nil {
		t.Fatal("expected non-nil snapshot after analyze")
	}
	if snap.ID == 0 {
		t.Error("expected non-zero snapshot ID")
	}
}

func TestAnalysisResult_HasErrors(t *testing.T) {
	result := &AnalysisResult{
		Diagnostics: map[string][]ctypes.Diagnostic{},
	}
	if result.HasErrors() {
		t.Error("empty result should not have errors")
	}
	if result.TotalDiagnostics() != 0 {
		t.Errorf("TotalDiagnostics = %d, want 0", result.TotalDiagnostics())
	}
}
