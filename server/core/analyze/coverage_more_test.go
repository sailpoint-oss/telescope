package analyze

import (
	"context"
	"testing"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/core/parser"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

func mapping(children map[string]*parser.SemanticNode) *parser.SemanticNode {
	return &parser.SemanticNode{Kind: parser.NodeMapping, Children: children}
}

func sequence(items ...*parser.SemanticNode) *parser.SemanticNode {
	return &parser.SemanticNode{Kind: parser.NodeSequence, Items: items}
}

func scalar(value string) *parser.SemanticNode {
	return &parser.SemanticNode{Kind: parser.NodeScalar, Value: value}
}

func parseGraphFor(uri string, root *parser.SemanticNode) *graph.WorkspaceGraph {
	g := graph.NewWorkspaceGraph()
	g.AddSource(graph.NewSyntheticSource(uri, []byte(""), graph.ClassificationHint{}))
	g.SetStageResult(uri, graph.StageParse, &graph.StageResult{
		Stage: graph.StageParse,
		Data:  &graph.ParseOutput{SemanticNode: root},
	})
	return g
}

func TestUnusedComponentsAnalyzer_UsesParseStageData(t *testing.T) {
	uri := "file:///api.yaml"
	root := mapping(map[string]*parser.SemanticNode{
		"components": mapping(map[string]*parser.SemanticNode{
			"schemas": mapping(map[string]*parser.SemanticNode{
				"Pet":   {Kind: parser.NodeMapping, Range: ctypes.Range{Start: ctypes.Position{Line: 10}}},
				"Error": {Kind: parser.NodeMapping, Range: ctypes.Range{Start: ctypes.Position{Line: 14}}},
			}),
			"securitySchemes": mapping(map[string]*parser.SemanticNode{
				"bearerAuth": {Kind: parser.NodeMapping, Range: ctypes.Range{Start: ctypes.Position{Line: 20}}},
			}),
		}),
	})
	g := parseGraphFor(uri, root)
	g.AddEdge(graph.Edge{
		SourceURI:     uri,
		TargetURI:     uri,
		TargetPointer: "/components/schemas/Pet",
		Kind:          graph.EdgeRef,
		RefValue:      "#/components/schemas/Pet",
	})

	diags := UnusedComponentsAnalyzer()(context.Background(), uri, g)
	if len(diags) != 2 {
		t.Fatalf("expected diagnostics for unused Error and bearerAuth, got %+v", diags)
	}
	if diags[0].Code != "unused-component" {
		t.Fatalf("unexpected diagnostic code: %+v", diags[0])
	}
}

func TestBreakingChangesAnalyzer_BaselineLifecycle(t *testing.T) {
	uri := "file:///api.yaml"
	baselines := make(map[string]*SpecSummary)
	analyzer := BreakingChangesAnalyzer(baselines)

	initial := mapping(map[string]*parser.SemanticNode{
		"paths": mapping(map[string]*parser.SemanticNode{
			"/pets": mapping(map[string]*parser.SemanticNode{
				"get": mapping(map[string]*parser.SemanticNode{
					"responses": mapping(map[string]*parser.SemanticNode{
						"200": mapping(nil),
					}),
				}),
			}),
		}),
	})
	g := parseGraphFor(uri, initial)
	if diags := analyzer(context.Background(), uri, g); len(diags) != 0 {
		t.Fatalf("expected first run to only establish baseline, got %+v", diags)
	}
	if baselines[uri] == nil {
		t.Fatal("expected baseline to be captured after first run")
	}

	changed := mapping(map[string]*parser.SemanticNode{
		"paths": mapping(map[string]*parser.SemanticNode{
			"/pets": mapping(map[string]*parser.SemanticNode{
				"get": mapping(map[string]*parser.SemanticNode{
					"responses": mapping(map[string]*parser.SemanticNode{
						"200": mapping(nil),
					}),
					"security": sequence(mapping(map[string]*parser.SemanticNode{
						"bearerAuth": scalar(""),
					})),
				}),
			}),
		}),
	})
	g.SetStageResult(uri, graph.StageParse, &graph.StageResult{
		Stage: graph.StageParse,
		Data:  &graph.ParseOutput{SemanticNode: changed},
	})

	diags := analyzer(context.Background(), uri, g)
	if len(diags) == 0 {
		t.Fatal("expected breaking change diagnostics on second run")
	}
	if diags[0].URI != uri {
		t.Fatalf("expected analyzer to stamp diagnostic URI, got %+v", diags[0])
	}
}

func TestBuildSpecSummaryAndDefaults(t *testing.T) {
	root := mapping(map[string]*parser.SemanticNode{
		"paths": mapping(map[string]*parser.SemanticNode{
			"/pets": mapping(map[string]*parser.SemanticNode{
				"get": mapping(map[string]*parser.SemanticNode{
					"parameters": sequence(mapping(map[string]*parser.SemanticNode{
						"name":     scalar("limit"),
						"in":       scalar("query"),
						"required": scalar("true"),
						"schema": mapping(map[string]*parser.SemanticNode{
							"type": scalar("integer"),
							"enum": sequence(scalar("10"), scalar("20")),
						}),
					})),
					"responses": mapping(map[string]*parser.SemanticNode{
						"200": mapping(nil),
						"404": mapping(nil),
					}),
					"security": sequence(mapping(map[string]*parser.SemanticNode{
						"bearerAuth": scalar(""),
					})),
				}),
			}),
		}),
	})

	summary := buildSpecSummary(root)
	if summary == nil || len(summary.Paths) != 1 {
		t.Fatalf("unexpected spec summary: %+v", summary)
	}
	op := summary.Paths["/pets"].Operations["get"]
	if len(op.Parameters) != 1 || op.Parameters[0].Type != "integer" || len(op.Parameters[0].Enum) != 2 {
		t.Fatalf("unexpected parameter summary: %+v", op.Parameters)
	}
	if len(op.ResponseCodes) != 2 || len(op.SecuritySchemes) != 1 {
		t.Fatalf("unexpected response/security summary: %+v", op)
	}
	if buildSpecSummary(nil) != nil {
		t.Fatal("nil semantic root should produce nil summary")
	}
	noPaths := buildSpecSummary(mapping(map[string]*parser.SemanticNode{"info": mapping(nil)}))
	if noPaths == nil || len(noPaths.Paths) != 0 {
		t.Fatalf("expected empty summary for docs without paths, got %+v", noPaths)
	}
	if len(DefaultAnalyzers()) != 2 {
		t.Fatalf("expected two default analyzers, got %d", len(DefaultAnalyzers()))
	}
}
