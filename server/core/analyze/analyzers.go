package analyze

import (
	"context"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/core/parser"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// UnusedComponentsAnalyzer returns a graph.AnalyzeFunc that detects unreferenced
// components within each document using the graph's reverse edge index.
func UnusedComponentsAnalyzer() graph.AnalyzeFunc {
	return func(_ context.Context, uri string, g *graph.WorkspaceGraph) []ctypes.Diagnostic {
		parsed := g.StageResult(uri, graph.StageParse)
		if parsed == nil {
			return nil
		}
		output, ok := parsed.Data.(*graph.ParseOutput)
		if !ok || output == nil || output.SemanticNode == nil {
			return nil
		}

		componentMap := buildComponentMap(uri, output.SemanticNode)
		if len(componentMap) == 0 {
			return nil
		}

		unused := FindUnusedComponents(g, componentMap)
		diagMap := UnusedToDiagnostics(unused)
		return diagMap[uri]
	}
}

func buildComponentMap(uri string, root *parser.SemanticNode) map[string][]ComponentEntry {
	comps := root.Get("components")
	if comps == nil || comps.Kind != parser.NodeMapping {
		return nil
	}

	result := make(map[string][]ComponentEntry)
	componentKinds := []string{"schemas", "responses", "parameters", "examples", "requestBodies", "headers", "securitySchemes", "links", "callbacks"}

	for _, kind := range componentKinds {
		section := comps.Get(kind)
		if section == nil || section.Kind != parser.NodeMapping {
			continue
		}
		for name, child := range section.Children {
			entry := ComponentEntry{
				Kind: kind,
				Name: name,
			}
			if child != nil {
				entry.Range = child.Range
			}
			result[uri] = append(result[uri], entry)
		}
	}
	return result
}

// BreakingChangesAnalyzer returns a graph.AnalyzeFunc that compares the current
// spec against a previously stored baseline. The baseline is stored per-URI
// in the provided map and updated after each comparison.
func BreakingChangesAnalyzer(baselines map[string]*SpecSummary) graph.AnalyzeFunc {
	return func(_ context.Context, uri string, g *graph.WorkspaceGraph) []ctypes.Diagnostic {
		parsed := g.StageResult(uri, graph.StageParse)
		if parsed == nil {
			return nil
		}
		output, ok := parsed.Data.(*graph.ParseOutput)
		if !ok || output == nil || output.SemanticNode == nil {
			return nil
		}

		current := buildSpecSummary(output.SemanticNode)
		if current == nil {
			return nil
		}

		baseline := baselines[uri]
		var diags []ctypes.Diagnostic
		if baseline != nil {
			changes := DetectBreakingChanges(baseline, current)
			diags = BreakingChangesToDiagnostics(changes)
			for i := range diags {
				diags[i].URI = uri
			}
		}

		baselines[uri] = current
		return diags
	}
}

func buildSpecSummary(root *parser.SemanticNode) *SpecSummary {
	if root == nil || root.Kind != parser.NodeMapping {
		return nil
	}

	pathsNode := root.Get("paths")
	if pathsNode == nil || pathsNode.Kind != parser.NodeMapping {
		return &SpecSummary{Paths: make(map[string]PathSummary)}
	}

	summary := &SpecSummary{
		Paths: make(map[string]PathSummary),
	}

	httpMethods := map[string]bool{
		"get": true, "post": true, "put": true, "delete": true,
		"patch": true, "head": true, "options": true, "trace": true,
	}

	for pathName, pathNode := range pathsNode.Children {
		if pathNode == nil || pathNode.Kind != parser.NodeMapping {
			continue
		}
		ps := PathSummary{
			Operations: make(map[string]OperationSummary),
		}
		for method, opNode := range pathNode.Children {
			if !httpMethods[method] || opNode == nil || opNode.Kind != parser.NodeMapping {
				continue
			}
			os := OperationSummary{}

			if params := opNode.Get("parameters"); params != nil && params.Kind == parser.NodeSequence {
				for _, p := range params.Items {
					if p == nil || p.Kind != parser.NodeMapping {
						continue
					}
					paramSummary := ParamSummary{}
					if n := p.Get("name"); n != nil {
						paramSummary.Name = n.StringValue()
					}
					if n := p.Get("in"); n != nil {
						paramSummary.In = n.StringValue()
					}
					if n := p.Get("required"); n != nil {
						paramSummary.Required = n.StringValue() == "true"
					}
					if schema := p.Get("schema"); schema != nil && schema.Kind == parser.NodeMapping {
						if t := schema.Get("type"); t != nil {
							paramSummary.Type = t.StringValue()
						}
						if e := schema.Get("enum"); e != nil && e.Kind == parser.NodeSequence {
							for _, item := range e.Items {
								if item != nil {
									paramSummary.Enum = append(paramSummary.Enum, item.StringValue())
								}
							}
						}
					}
					os.Parameters = append(os.Parameters, paramSummary)
				}
			}

			if responses := opNode.Get("responses"); responses != nil && responses.Kind == parser.NodeMapping {
				for code := range responses.Children {
					os.ResponseCodes = append(os.ResponseCodes, code)
				}
			}

			if security := opNode.Get("security"); security != nil && security.Kind == parser.NodeSequence {
				for _, item := range security.Items {
					if item != nil && item.Kind == parser.NodeMapping {
						for scheme := range item.Children {
							os.SecuritySchemes = append(os.SecuritySchemes, scheme)
						}
					}
				}
			}

			ps.Operations[method] = os
		}
		summary.Paths[pathName] = ps
	}

	return summary
}

// DefaultAnalyzers returns the standard set of analyzer functions.
func DefaultAnalyzers() []graph.AnalyzeFunc {
	return []graph.AnalyzeFunc{
		UnusedComponentsAnalyzer(),
		BreakingChangesAnalyzer(make(map[string]*SpecSummary)),
	}
}
