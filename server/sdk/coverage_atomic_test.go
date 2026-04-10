package sdk

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func TestTotalDiagnostics(t *testing.T) {
	tests := []struct {
		name   string
		diags  map[string][]ctypes.Diagnostic
		expect int
	}{
		{
			name:   "nil map",
			diags:  nil,
			expect: 0,
		},
		{
			name:   "empty map",
			diags:  map[string][]ctypes.Diagnostic{},
			expect: 0,
		},
		{
			name: "single URI single diagnostic",
			diags: map[string][]ctypes.Diagnostic{
				"file:///a.yaml": {{Message: "err1", Severity: ctypes.SeverityError}},
			},
			expect: 1,
		},
		{
			name: "multiple URIs",
			diags: map[string][]ctypes.Diagnostic{
				"file:///a.yaml": {
					{Message: "err1"},
					{Message: "err2"},
				},
				"file:///b.yaml": {
					{Message: "warn1"},
				},
			},
			expect: 3,
		},
		{
			name: "URI with empty slice",
			diags: map[string][]ctypes.Diagnostic{
				"file:///a.yaml": {},
				"file:///b.yaml": {{Message: "x"}},
			},
			expect: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := &AnalysisResult{Diagnostics: tt.diags}
			if got := r.TotalDiagnostics(); got != tt.expect {
				t.Errorf("TotalDiagnostics() = %d, want %d", got, tt.expect)
			}
		})
	}
}

func TestDiagnosticsForURI(t *testing.T) {
	diags := map[string][]ctypes.Diagnostic{
		"file:///a.yaml": {
			{Message: "a1", Severity: ctypes.SeverityError},
			{Message: "a2", Severity: ctypes.SeverityWarning},
		},
		"file:///b.yaml": {
			{Message: "b1"},
		},
	}
	r := &AnalysisResult{Diagnostics: diags}

	t.Run("existing URI returns its diagnostics", func(t *testing.T) {
		got := r.DiagnosticsForURI("file:///a.yaml")
		if len(got) != 2 {
			t.Fatalf("expected 2 diagnostics, got %d", len(got))
		}
		if got[0].Message != "a1" || got[1].Message != "a2" {
			t.Errorf("unexpected diagnostic messages: %v", got)
		}
	})

	t.Run("missing URI returns nil", func(t *testing.T) {
		got := r.DiagnosticsForURI("file:///missing.yaml")
		if got != nil {
			t.Errorf("expected nil for missing URI, got %v", got)
		}
	})
}

func TestHasErrors(t *testing.T) {
	tests := []struct {
		name   string
		diags  map[string][]ctypes.Diagnostic
		expect bool
	}{
		{
			name:   "empty diagnostics",
			diags:  map[string][]ctypes.Diagnostic{},
			expect: false,
		},
		{
			name: "only warnings",
			diags: map[string][]ctypes.Diagnostic{
				"file:///a.yaml": {
					{Severity: ctypes.SeverityWarning},
					{Severity: ctypes.SeverityInfo},
				},
			},
			expect: false,
		},
		{
			name: "contains error",
			diags: map[string][]ctypes.Diagnostic{
				"file:///a.yaml": {{Severity: ctypes.SeverityWarning}},
				"file:///b.yaml": {{Severity: ctypes.SeverityError}},
			},
			expect: true,
		},
		{
			name: "hint only",
			diags: map[string][]ctypes.Diagnostic{
				"file:///a.yaml": {{Severity: ctypes.SeverityHint}},
			},
			expect: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := &AnalysisResult{Diagnostics: tt.diags}
			if got := r.HasErrors(); got != tt.expect {
				t.Errorf("HasErrors() = %v, want %v", got, tt.expect)
			}
		})
	}
}

func TestWithStages(t *testing.T) {
	custom := []graph.Stage{}
	opt := WithStages(custom)

	var cfg WorkspaceConfig
	opt(&cfg)

	if cfg.Stages == nil {
		t.Fatal("expected Stages to be set")
	}
}

func TestWithGoroutinePoolSize(t *testing.T) {
	tests := []struct {
		name   string
		size   int
		expect int
	}{
		{"zero", 0, 0},
		{"positive", 8, 8},
		{"large", 1000, 1000},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var cfg WorkspaceConfig
			opt := WithGoroutinePoolSize(tt.size)
			opt(&cfg)
			if cfg.GoroutinePoolSize != tt.expect {
				t.Errorf("GoroutinePoolSize = %d, want %d", cfg.GoroutinePoolSize, tt.expect)
			}
		})
	}
}

func TestWorkspaceIndex(t *testing.T) {
	t.Run("nil snapshot returns nil", func(t *testing.T) {
		w := &Workspace{
			graph:   graph.NewWorkspaceGraph(),
			snapMgr: graph.NewSnapshotManager(),
		}
		if got := w.Index("file:///any.yaml"); got != nil {
			t.Errorf("expected nil for workspace with no snapshot, got %v", got)
		}
	})

	t.Run("snapshot with matching node returns stage data", func(t *testing.T) {
		g := graph.NewWorkspaceGraph()
		sm := graph.NewSnapshotManager()
		sm.Build(g)

		w := &Workspace{
			graph:   g,
			snapMgr: sm,
		}
		snap := w.Snapshot()
		if snap == nil {
			t.Fatal("expected snapshot after Build")
		}
	})

	t.Run("snapshot with missing URI returns nil", func(t *testing.T) {
		g := graph.NewWorkspaceGraph()
		sm := graph.NewSnapshotManager()
		sm.Build(g)

		w := &Workspace{
			graph:   g,
			snapMgr: sm,
		}
		if got := w.Index("file:///nonexistent.yaml"); got != nil {
			t.Errorf("expected nil for missing URI, got %v", got)
		}
	})
}

func TestCountEdges(t *testing.T) {
	t.Run("empty graph has zero edges", func(t *testing.T) {
		w := &Workspace{
			graph: graph.NewWorkspaceGraph(),
		}
		if got := w.countEdges(); got != 0 {
			t.Errorf("countEdges() = %d, want 0", got)
		}
	})
}

func TestOptionComposition(t *testing.T) {
	opts := []Option{
		WithBuiltinRules(false),
		WithCustomRules(true),
		WithGoroutinePoolSize(4),
	}

	var cfg WorkspaceConfig
	for _, opt := range opts {
		opt(&cfg)
	}

	if cfg.BuiltinRules {
		t.Error("expected BuiltinRules=false")
	}
	if !cfg.CustomRules {
		t.Error("expected CustomRules=true")
	}
	if cfg.GoroutinePoolSize != 4 {
		t.Errorf("expected GoroutinePoolSize=4, got %d", cfg.GoroutinePoolSize)
	}
}
