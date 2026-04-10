package rules_test

import (
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/telescope/server/bridge"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// mockResolver satisfies barrelman.CrossRefResolver for tests.
type mockResolver struct{ resolves bool }

func (m *mockResolver) CanResolve(_, _ string) bool { return m.resolves }

// --- GetIndex ---

func TestGetIndex(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: T
  version: "1"`))

	tests := []struct {
		name     string
		userData interface{}
		wantNil  bool
		wantIdx  *openapi.Index
	}{
		{
			name:    "nil UserData",
			wantNil: true,
		},
		{
			name:     "bridge.AnalysisData",
			userData: &bridge.AnalysisData{Index: idx},
			wantIdx:  idx,
		},
		{
			name:     "raw openapi.Index",
			userData: idx,
			wantIdx:  idx,
		},
		{
			name:     "unrelated type",
			userData: "not-an-index",
			wantNil:  true,
		},
		{
			name:     "AnalysisData with nil Index",
			userData: &bridge.AnalysisData{Index: nil},
			wantNil:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &treesitter.AnalysisContext{UserData: tt.userData}
			got := rules.GetIndex(ctx)
			if tt.wantNil {
				if got != nil {
					t.Fatalf("GetIndex = %v, want nil", got)
				}
				return
			}
			if got != tt.wantIdx {
				t.Fatalf("GetIndex returned unexpected pointer")
			}
		})
	}
}

// --- GetAnalysisData ---

func TestGetAnalysisData(t *testing.T) {
	ad := &bridge.AnalysisData{DocURI: "file:///test.yaml"}

	tests := []struct {
		name     string
		userData interface{}
		wantNil  bool
		want     *bridge.AnalysisData
	}{
		{
			name:    "nil UserData",
			wantNil: true,
		},
		{
			name:     "correct type",
			userData: ad,
			want:     ad,
		},
		{
			name:     "raw openapi.Index (wrong type)",
			userData: &openapi.Index{},
			wantNil:  true,
		},
		{
			name:     "unrelated type",
			userData: 42,
			wantNil:  true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &treesitter.AnalysisContext{UserData: tt.userData}
			got := rules.GetAnalysisData(ctx)
			if tt.wantNil {
				if got != nil {
					t.Fatalf("GetAnalysisData = %v, want nil", got)
				}
				return
			}
			if got != tt.want {
				t.Fatalf("GetAnalysisData returned unexpected pointer")
			}
		})
	}
}

// --- CollectAnalyzers ---

func TestCollectAnalyzers(t *testing.T) {
	analyzers := rules.CollectAnalyzers(func(s *gossip.Server) {
		s.Analyze("my-analyzer", treesitter.Analyzer{
			Scope: treesitter.ScopeFile,
			Run: func(_ *treesitter.AnalysisContext) []protocol.Diagnostic {
				return nil
			},
		})
	})

	if len(analyzers) != 1 {
		t.Fatalf("len(analyzers) = %d, want 1", len(analyzers))
	}
	if analyzers[0].ID != "my-analyzer" {
		t.Errorf("ID = %q, want %q", analyzers[0].ID, "my-analyzer")
	}
}

// --- CollectAll ---

func TestCollectAll(t *testing.T) {
	analyzers, checks := rules.CollectAll(
		func(s *gossip.Server) {
			s.Analyze("a1", treesitter.Analyzer{
				Scope: treesitter.ScopeFile,
				Run: func(_ *treesitter.AnalysisContext) []protocol.Diagnostic {
					return nil
				},
			})
			s.Analyze("a2", treesitter.Analyzer{
				Scope: treesitter.ScopeFile,
				Run: func(_ *treesitter.AnalysisContext) []protocol.Diagnostic {
					return nil
				},
			})
		},
		func(s *gossip.Server) {
			s.Check("c1", treesitter.Check{
				Pattern:  "(ERROR) @error",
				Severity: protocol.DiagnosticSeverity(ctypes.SeverityWarning),
			})
		},
	)

	if len(analyzers) != 2 {
		t.Fatalf("len(analyzers) = %d, want 2", len(analyzers))
	}
	if analyzers[0].ID != "a1" {
		t.Errorf("analyzers[0].ID = %q, want %q", analyzers[0].ID, "a1")
	}
	if analyzers[1].ID != "a2" {
		t.Errorf("analyzers[1].ID = %q, want %q", analyzers[1].ID, "a2")
	}
	if len(checks) != 1 {
		t.Fatalf("len(checks) = %d, want 1", len(checks))
	}
	if checks[0].Name != "c1" {
		t.Errorf("checks[0].Name = %q, want %q", checks[0].Name, "c1")
	}
}

func TestCollectAnalyzers_NoRegistrations(t *testing.T) {
	analyzers := rules.CollectAnalyzers(func(_ *gossip.Server) {})
	if len(analyzers) != 0 {
		t.Fatalf("len(analyzers) = %d, want 0", len(analyzers))
	}
}

// --- RunAnalyzersProto ---

func TestRunAnalyzersProto(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: T
  version: "1"`))

	want := protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: 1, Character: 2},
			End:   protocol.Position{Line: 1, Character: 7},
		},
		Severity: protocol.DiagnosticSeverity(ctypes.SeverityWarning),
		Source:   "test-source",
		Message:  "something is wrong",
	}

	na := rules.NamedAnalyzer{
		ID: "proto-test",
		Analyzer: treesitter.Analyzer{
			Scope: treesitter.ScopeFile,
			Run: func(_ *treesitter.AnalysisContext) []protocol.Diagnostic {
				return []protocol.Diagnostic{want}
			},
		},
	}

	diags := rules.RunAnalyzersProto([]rules.NamedAnalyzer{na}, idx, "file:///test.yaml", nil)

	if len(diags) != 1 {
		t.Fatalf("len(diags) = %d, want 1", len(diags))
	}
	if diags[0].Message != want.Message {
		t.Errorf("Message = %q, want %q", diags[0].Message, want.Message)
	}
	if diags[0].Source != want.Source {
		t.Errorf("Source = %q, want %q", diags[0].Source, want.Source)
	}
	if diags[0].Range.Start.Line != 1 || diags[0].Range.Start.Character != 2 {
		t.Errorf("Range.Start = %+v, want {1 2}", diags[0].Range.Start)
	}
}

func TestRunAnalyzersProto_Empty(t *testing.T) {
	diags := rules.RunAnalyzersProto(nil, nil, "", nil)
	if len(diags) != 0 {
		t.Fatalf("len(diags) = %d, want 0", len(diags))
	}
}

func TestRunAnalyzersProto_ReceivesUserData(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: T
  version: "1"`))

	var receivedURI string
	na := rules.NamedAnalyzer{
		ID: "userdata-test",
		Analyzer: treesitter.Analyzer{
			Scope: treesitter.ScopeFile,
			Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
				data := rules.GetAnalysisData(ctx)
				if data != nil {
					receivedURI = data.DocURI
				}
				return nil
			},
		},
	}

	rules.RunAnalyzersProto([]rules.NamedAnalyzer{na}, idx, "file:///hello.yaml", nil)

	if receivedURI != "file:///hello.yaml" {
		t.Errorf("DocURI = %q, want %q", receivedURI, "file:///hello.yaml")
	}
}

// --- RunAnalyzers (returns ctypes.Diagnostic) ---

func TestRunAnalyzers(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: T
  version: "1"`))

	na := rules.NamedAnalyzer{
		ID: "core-test",
		Analyzer: treesitter.Analyzer{
			Scope: treesitter.ScopeFile,
			Run: func(_ *treesitter.AnalysisContext) []protocol.Diagnostic {
				return []protocol.Diagnostic{
					{
						Range: protocol.Range{
							Start: protocol.Position{Line: 0, Character: 0},
							End:   protocol.Position{Line: 0, Character: 5},
						},
						Severity: protocol.DiagnosticSeverity(ctypes.SeverityWarning),
						Source:   "test",
						Message:  "msg",
					},
				}
			},
		},
	}

	diags := rules.RunAnalyzers([]rules.NamedAnalyzer{na}, idx, "file:///t.yaml", nil)

	if len(diags) != 1 {
		t.Fatalf("len(diags) = %d, want 1", len(diags))
	}
	if diags[0].Message != "msg" {
		t.Errorf("Message = %q", diags[0].Message)
	}
}

// --- WithResolver ---

func TestWithResolver(t *testing.T) {
	r := &mockResolver{resolves: true}
	opt := rules.WithResolver(r)

	data := &rules.AnalysisData{}
	opt(data)

	if data.Resolver == nil {
		t.Fatal("Resolver is nil after WithResolver")
	}
	if !data.Resolver.CanResolve("any", "any") {
		t.Error("Resolver.CanResolve returned false, want true")
	}
}

func TestWithResolver_Nil(t *testing.T) {
	opt := rules.WithResolver(nil)
	data := &rules.AnalysisData{Resolver: &mockResolver{}}
	opt(data)

	if data.Resolver != nil {
		t.Error("Resolver should be nil after WithResolver(nil)")
	}
}

// --- WithTargetVersion ---

func TestWithTargetVersion(t *testing.T) {
	opt := rules.WithTargetVersion(openapi.Version31)

	data := &rules.AnalysisData{}
	opt(data)

	if data.TargetVersion != openapi.Version31 {
		t.Errorf("TargetVersion = %q, want %q", data.TargetVersion, openapi.Version31)
	}
}

// --- RunAnalyzersProto with options ---

func TestRunAnalyzersProto_WithOptions(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: T
  version: "1"`))

	resolver := &mockResolver{resolves: true}

	var gotVersion openapi.Version
	var gotResolver bool

	na := rules.NamedAnalyzer{
		ID: "opts-test",
		Analyzer: treesitter.Analyzer{
			Scope: treesitter.ScopeFile,
			Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
				data := rules.GetAnalysisData(ctx)
				if data != nil {
					gotVersion = data.TargetVersion
					gotResolver = data.Resolver != nil
				}
				return nil
			},
		},
	}

	rules.RunAnalyzersProto(
		[]rules.NamedAnalyzer{na}, idx, "", nil,
		rules.WithTargetVersion(openapi.Version31),
		rules.WithResolver(resolver),
	)

	if gotVersion != openapi.Version31 {
		t.Errorf("TargetVersion = %q, want %q", gotVersion, openapi.Version31)
	}
	if !gotResolver {
		t.Error("Resolver was not set via option")
	}
}

// --- RegisterGossip ---

func TestRegisterGossip(t *testing.T) {
	b := barrelman.Define("coverage-atomic-test-rule", barrelman.RuleMeta{
		Description: "test rule for coverage",
		Severity:    barrelman.SeverityWarning,
		Category:    barrelman.CategoryNaming,
		Recommended: true,
	}).Document(func(_ *openapi.Document, r *rules.Reporter) {
		r.At(openapi.Loc{}, "test finding")
	})

	s := gossip.NewServer("test-register", "0.0.0")
	rules.RegisterGossip(b, s)

	meta, ok := rules.DefaultRegistry.Get("coverage-atomic-test-rule")
	if !ok {
		t.Fatal("rule not found in DefaultRegistry after RegisterGossip")
	}
	if meta.ID != "coverage-atomic-test-rule" {
		t.Errorf("ID = %q", meta.ID)
	}
	if meta.Severity != barrelman.SeverityWarning {
		t.Errorf("Severity = %d, want %d", meta.Severity, barrelman.SeverityWarning)
	}
}

// --- WalkIndex ---

func TestWalkIndex_ValidIndex(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: getUsers
      summary: List users
      responses:
        "200":
          description: OK`))

	var docVisited bool
	r := rules.NewReporter("walk-test", ctypes.SeverityWarning)
	rules.WalkIndex(idx, rules.Visitors{
		Document: func(doc *openapi.Document, _ *rules.Reporter) {
			docVisited = true
			if doc.Info == nil {
				t.Error("document info is nil")
			}
		},
	}, r)

	if !docVisited {
		t.Error("Document visitor was not called")
	}
}

func TestWalkIndex_OperationVisitor(t *testing.T) {
	idx := openapi.ParseAndIndex([]byte(`openapi: "3.1.0"
info:
  title: T
  version: "1"
paths:
  /a:
    get:
      operationId: getA
      responses:
        "200":
          description: ok
    post:
      operationId: createA
      responses:
        "201":
          description: created`))

	var count int
	r := rules.NewReporter("op-walk", ctypes.SeverityWarning)
	rules.WalkIndex(idx, rules.Visitors{
		Operation: func(path, method string, _ *openapi.Operation, _ *rules.Reporter) {
			count++
		},
	}, r)

	if count != 2 {
		t.Errorf("operation visitor called %d times, want 2", count)
	}
}
