package sdk

import (
	"context"
	"log/slog"
	"time"

	"github.com/sailpoint-oss/telescope/server/core/analyze"
	"github.com/sailpoint-oss/telescope/server/core/graph"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// Workspace provides the stable public Go API for using Telescope as a library.
// It wraps the core graph engine, pipeline runner, and snapshot manager into a
// single high-level interface suitable for CLI tools and external consumers
// (e.g. Cartographer).
type Workspace struct {
	graph      *graph.WorkspaceGraph
	pipeline   *graph.PipelineRunner
	snapMgr    *graph.SnapshotManager
	config     WorkspaceConfig
	logger     *slog.Logger
	watchCancel context.CancelFunc
}

// New creates a new Workspace with the given options.
func New(opts ...Option) (*Workspace, error) {
	cfg := WorkspaceConfig{
		BuiltinRules: true,
	}
	for _, opt := range opts {
		opt(&cfg)
	}

	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	stages := graph.DefaultStages()
	if cfg.Stages != nil {
		stages = cfg.Stages
	} else if cfg.BuiltinRules {
		for i, s := range stages {
			if as, ok := s.(graph.AnalyzeStage); ok {
				as.Analyzers = append(as.Analyzers, analyze.DefaultAnalyzers()...)
				stages[i] = as
			}
		}
	}

	pipeline, err := graph.NewPipelineRunner(stages, logger)
	if err != nil {
		return nil, err
	}

	return &Workspace{
		graph:    graph.NewWorkspaceGraph(),
		pipeline: pipeline,
		snapMgr:  graph.NewSnapshotManager(),
		config:   cfg,
		logger:   logger,
	}, nil
}

// AddSource adds a document source to the workspace and runs the pipeline.
func (w *Workspace) AddSource(src graph.DocumentSource) {
	w.graph.AddSource(src)
}

// RemoveSource removes a document from the workspace.
func (w *Workspace) RemoveSource(uri string) {
	w.graph.RemoveSource(uri)
}

// Analyze runs the full analysis pipeline on all documents in the workspace
// and returns aggregated results.
func (w *Workspace) Analyze(ctx context.Context) (*AnalysisResult, error) {
	start := time.Now()

	uris := w.graph.AllNodes()
	allDiags := make(map[string][]ctypes.Diagnostic)

	stageDurations := make(map[string]time.Duration)

	for _, uri := range uris {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if err := w.pipeline.RunAll(ctx, uri, w.graph); err != nil {
			w.logger.Warn("pipeline failed", "uri", uri, "error", err)
			continue
		}
		node := w.graph.Node(uri)
		if node == nil {
			continue
		}
		if len(node.Diagnostics) > 0 {
			allDiags[uri] = node.Diagnostics
		}
		// Aggregate stage durations
		for stageName, result := range node.StageResults {
			if result != nil {
				stageDurations[string(stageName)] += result.Duration
			}
		}
	}

	snap := w.snapMgr.Build(w.graph)

	return &AnalysisResult{
		Diagnostics:    allDiags,
		NodeCount:      len(uris),
		EdgeCount:      w.countEdges(),
		RootDocuments:  w.graph.Roots(),
		Duration:       time.Since(start),
		SnapshotID:     snap.ID,
		StageDurations: stageDurations,
		RuleDurations:  make(map[string]time.Duration),
	}, nil
}

// AnalyzeURI runs the pipeline for a single document and returns its diagnostics.
func (w *Workspace) AnalyzeURI(ctx context.Context, uri string) ([]ctypes.Diagnostic, error) {
	if err := w.pipeline.RunAll(ctx, uri, w.graph); err != nil {
		return nil, err
	}
	node := w.graph.Node(uri)
	if node == nil {
		return nil, nil
	}
	return node.Diagnostics, nil
}

// Graph returns a read-only view of the workspace graph.
func (w *Workspace) Graph() graph.ReadOnlyGraph {
	return w.graph
}

// Snapshot returns the current immutable snapshot, or nil if none has been built.
func (w *Workspace) Snapshot() *graph.Snapshot {
	return w.snapMgr.Current()
}

// OnSnapshot registers a callback for when a new snapshot is built.
func (w *Workspace) OnSnapshot(fn func(*graph.Snapshot)) {
	w.snapMgr.OnSnapshot(fn)
}

// Watch starts background processing. When documents change, the snapshot
// manager queues them and calls onChange with each new snapshot. Returns a
// cancel function to stop watching.
func (w *Workspace) Watch(ctx context.Context, onChange func(*graph.Snapshot)) (context.CancelFunc, error) {
	ctx, cancel := context.WithCancel(ctx)

	w.snapMgr.OnSnapshot(func(snap *graph.Snapshot) {
		if onChange != nil {
			onChange(snap)
		}
	})

	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				w.snapMgr.BuildNext(ctx, w.graph, w.pipeline)
			}
		}
	}()

	return cancel, nil
}

// Index returns the OpenAPI index data from the current snapshot for a given URI.
// Returns the raw stage result from the lint stage, or nil if unavailable.
func (w *Workspace) Index(uri string) interface{} {
	snap := w.snapMgr.Current()
	if snap == nil {
		return nil
	}
	node, ok := snap.Nodes[uri]
	if !ok {
		return nil
	}
	return node.StageResults[graph.StageLint]
}

// Close releases resources associated with the workspace.
func (w *Workspace) Close() error {
	if w.watchCancel != nil {
		w.watchCancel()
		w.watchCancel = nil
	}
	return nil
}

func (w *Workspace) countEdges() int {
	count := 0
	for _, uri := range w.graph.AllNodes() {
		count += len(w.graph.EdgesFrom(uri))
	}
	return count
}
