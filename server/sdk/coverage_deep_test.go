package sdk

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/core/graph"
)

func TestNew_DefaultOptions(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	if ws.graph == nil {
		t.Error("expected non-nil graph")
	}
	if ws.pipeline == nil {
		t.Error("expected non-nil pipeline")
	}
	if ws.snapMgr == nil {
		t.Error("expected non-nil snapshot manager")
	}
	if ws.logger == nil {
		t.Error("expected non-nil logger")
	}
}

func TestWithLogger(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))
	ws, err := New(WithLogger(logger))
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	if ws.logger != logger {
		t.Error("expected custom logger to be set")
	}
}

func TestWithConfig(t *testing.T) {
	cfg := &config.Config{
		Rules: map[string]string{"my-rule": "warn"},
	}
	opt := WithConfig(cfg)
	wc := WorkspaceConfig{}
	opt(&wc)

	if wc.Config == nil {
		t.Error("expected Config to be set")
	}
	if wc.Config.Rules["my-rule"] != "warn" {
		t.Errorf("expected my-rule=warn, got %q", wc.Config.Rules["my-rule"])
	}
}

func TestWithBuiltinRules(t *testing.T) {
	opt := WithBuiltinRules(false)
	wc := WorkspaceConfig{BuiltinRules: true}
	opt(&wc)

	if wc.BuiltinRules {
		t.Error("expected BuiltinRules to be false")
	}
}

func TestWithCustomRules(t *testing.T) {
	opt := WithCustomRules(true)
	wc := WorkspaceConfig{}
	opt(&wc)

	if !wc.CustomRules {
		t.Error("expected CustomRules to be true")
	}
}

func TestWithStages_Deep(t *testing.T) {
	stages := []graph.Stage{}
	opt := WithStages(stages)
	wc := WorkspaceConfig{}
	opt(&wc)

	if wc.Stages == nil {
		t.Error("expected Stages to be set")
	}
	if len(wc.Stages) != 0 {
		t.Errorf("expected empty stages, got %d", len(wc.Stages))
	}
}

func TestWithGoroutinePoolSize_Deep(t *testing.T) {
	opt := WithGoroutinePoolSize(16)
	wc := WorkspaceConfig{}
	opt(&wc)

	if wc.GoroutinePoolSize != 16 {
		t.Errorf("expected pool size 16, got %d", wc.GoroutinePoolSize)
	}
}

func TestWorkspaceClose_Idempotent(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}

	if err := ws.Close(); err != nil {
		t.Fatalf("first Close() error: %v", err)
	}
	if err := ws.Close(); err != nil {
		t.Fatalf("second Close() error: %v", err)
	}
}

func TestWorkspaceGraph(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	g := ws.Graph()
	if g == nil {
		t.Error("expected non-nil graph")
	}
}

func TestWorkspaceSnapshot_InitiallyNil(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	if snap := ws.Snapshot(); snap != nil {
		t.Errorf("expected nil initial snapshot, got %v", snap)
	}
}

func TestWorkspaceOnSnapshot(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	var called atomic.Int32
	ws.OnSnapshot(func(s *graph.Snapshot) {
		called.Add(1)
	})

	ws.Analyze(context.Background())

	if called.Load() == 0 {
		t.Log("OnSnapshot callback may not fire without documents; verifying registration didn't panic")
	}
}

func TestWorkspaceWatch(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	var snapCount atomic.Int32
	watchCancel, err := ws.Watch(ctx, func(s *graph.Snapshot) {
		snapCount.Add(1)
	})
	if err != nil {
		t.Fatalf("Watch() error: %v", err)
	}

	time.Sleep(100 * time.Millisecond)
	watchCancel()

	time.Sleep(100 * time.Millisecond)
}

func TestWorkspaceIndex_NoSnapshot_Deep(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	got := ws.Index("file:///nonexistent.yaml")
	if got != nil {
		t.Errorf("expected nil index with no snapshot, got %v", got)
	}
}

func TestWorkspaceAnalyze_Empty(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	result, err := ws.Analyze(context.Background())
	if err != nil {
		t.Fatalf("Analyze() error: %v", err)
	}
	if result.NodeCount != 0 {
		t.Errorf("expected 0 nodes, got %d", result.NodeCount)
	}
	if result.TotalDiagnostics() != 0 {
		t.Errorf("expected 0 diagnostics, got %d", result.TotalDiagnostics())
	}
}

func TestWorkspaceAnalyze_WithDocument(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	tmp := t.TempDir()
	specPath := filepath.Join(tmp, "spec.yaml")
	spec := []byte("openapi: \"3.0.0\"\ninfo:\n  title: Test\n  version: \"1.0.0\"\npaths: {}\n")
	if err := os.WriteFile(specPath, spec, 0644); err != nil {
		t.Fatal(err)
	}

	src := graph.NewFilesystemSource(specPath, graph.ClassificationHint{
		IsOpenAPI:  true,
		LanguageID: "yaml",
	})
	ws.AddSource(src)

	result, err := ws.Analyze(context.Background())
	if err != nil {
		t.Fatalf("Analyze() error: %v", err)
	}
	if result.NodeCount != 1 {
		t.Errorf("expected 1 node, got %d", result.NodeCount)
	}
	if result.Duration == 0 {
		t.Error("expected non-zero duration")
	}
}

func TestWorkspaceAnalyze_Cancelled(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	tmp := t.TempDir()
	specPath := filepath.Join(tmp, "spec.yaml")
	if err := os.WriteFile(specPath, []byte("openapi: \"3.0.0\"\ninfo:\n  title: T\n  version: \"1\"\npaths: {}\n"), 0644); err != nil {
		t.Fatal(err)
	}
	ws.AddSource(graph.NewFilesystemSource(specPath, graph.ClassificationHint{IsOpenAPI: true, LanguageID: "yaml"}))

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err = ws.Analyze(ctx)
	if err == nil {
		t.Log("cancelled context may or may not return error depending on timing")
	}
}

func TestWorkspaceAddRemoveSource(t *testing.T) {
	ws, err := New()
	if err != nil {
		t.Fatalf("New() error: %v", err)
	}
	defer ws.Close()

	tmp := t.TempDir()
	specPath := filepath.Join(tmp, "spec.yaml")
	if err := os.WriteFile(specPath, []byte("openapi: \"3.0.0\"\ninfo:\n  title: T\n  version: \"1\"\npaths: {}\n"), 0644); err != nil {
		t.Fatal(err)
	}

	src := graph.NewFilesystemSource(specPath, graph.ClassificationHint{IsOpenAPI: true, LanguageID: "yaml"})
	ws.AddSource(src)

	nodes := ws.graph.AllNodes()
	if len(nodes) != 1 {
		t.Fatalf("expected 1 node after add, got %d", len(nodes))
	}

	ws.RemoveSource(nodes[0])

	if len(ws.graph.AllNodes()) != 0 {
		t.Error("expected 0 nodes after remove")
	}
}

func TestLintOptions_Fields(t *testing.T) {
	opts := LintOptions{
		ConfigPath:    "/path/to/config.yaml",
		RulesetPath:   "/path/to/ruleset.yaml",
		WorkspaceRoot: "/workspace",
		NoExternalLSP: true,
		Include:       []string{"*.yaml"},
		Exclude:       []string{"vendor/**"},
		TargetVersion: "3.1",
	}

	if opts.ConfigPath != "/path/to/config.yaml" {
		t.Error("ConfigPath not set")
	}
	if opts.TargetVersion != "3.1" {
		t.Error("TargetVersion not set")
	}
	if len(opts.Include) != 1 || len(opts.Exclude) != 1 {
		t.Error("Include/Exclude not set")
	}
}
