package graph

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/core/parser"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/core/uri"
)

// Stage represents a single processing step in the pipeline. Stages declare
// their dependencies and are executed in topological order.
type Stage interface {
	// Name returns the unique identifier for this stage.
	Name() StageName

	// DependsOn returns the stages that must complete before this one.
	DependsOn() []StageName

	// Run executes the stage for a single document node. It may read
	// previous stage results from the graph and should store its result
	// via graph.SetStageResult().
	Run(ctx context.Context, uri string, graph *WorkspaceGraph) error
}

// PipelineRunner orchestrates stage execution across the workspace graph.
// It respects stage dependencies, uses per-(URI, version) caching, and
// skips stages whose cached results are still valid.
type PipelineRunner struct {
	stages []Stage
	order  []StageName
	byName map[StageName]Stage
	logger *slog.Logger
}

// NewPipelineRunner creates a runner with the given stages. Stages are
// topologically sorted based on their DependsOn declarations.
func NewPipelineRunner(stages []Stage, logger *slog.Logger) (*PipelineRunner, error) {
	if logger == nil {
		logger = slog.Default()
	}
	byName := make(map[StageName]Stage, len(stages))
	for _, s := range stages {
		byName[s.Name()] = s
	}

	order, err := topoSort(stages)
	if err != nil {
		return nil, err
	}

	return &PipelineRunner{
		stages: stages,
		order:  order,
		byName: byName,
		logger: logger,
	}, nil
}

// RunAll executes all pipeline stages for a single URI. Stages with valid
// cached results are skipped.
func (p *PipelineRunner) RunAll(ctx context.Context, uri string, g *WorkspaceGraph) error {
	for _, name := range p.order {
		if err := ctx.Err(); err != nil {
			return err
		}

		cached := g.StageResult(uri, name)
		node := g.Node(uri)
		if cached != nil && node != nil && cached.Version == node.Version {
			continue
		}

		stage := p.byName[name]
		if err := stage.Run(ctx, uri, g); err != nil {
			p.logger.Warn("pipeline stage failed",
				"stage", string(name),
				"uri", uri,
				"error", err)
			return fmt.Errorf("stage %s for %s: %w", name, uri, err)
		}
	}
	return nil
}

// RunStage executes a single named stage for a URI.
func (p *PipelineRunner) RunStage(ctx context.Context, uri string, g *WorkspaceGraph, stage StageName) error {
	s, ok := p.byName[stage]
	if !ok {
		return fmt.Errorf("unknown stage: %s", stage)
	}
	return s.Run(ctx, uri, g)
}

// RunThrough executes all stages up to and including the given stage.
func (p *PipelineRunner) RunThrough(ctx context.Context, uri string, g *WorkspaceGraph, through StageName) error {
	for _, name := range p.order {
		if err := ctx.Err(); err != nil {
			return err
		}

		cached := g.StageResult(uri, name)
		node := g.Node(uri)
		if cached != nil && node != nil && cached.Version == node.Version {
			if name == through {
				break
			}
			continue
		}

		stage := p.byName[name]
		if err := stage.Run(ctx, uri, g); err != nil {
			return fmt.Errorf("stage %s for %s: %w", name, uri, err)
		}
		if name == through {
			break
		}
	}
	return nil
}

// Stages returns the ordered list of stage names.
func (p *PipelineRunner) Stages() []StageName {
	out := make([]StageName, len(p.order))
	copy(out, p.order)
	return out
}

// topoSort performs a topological sort of stages based on DependsOn.
func topoSort(stages []Stage) ([]StageName, error) {
	inDegree := make(map[StageName]int)
	adjacency := make(map[StageName][]StageName)
	all := make(map[StageName]bool)

	for _, s := range stages {
		name := s.Name()
		all[name] = true
		if _, ok := inDegree[name]; !ok {
			inDegree[name] = 0
		}
		for _, dep := range s.DependsOn() {
			adjacency[dep] = append(adjacency[dep], name)
			inDegree[name]++
		}
	}

	var queue []StageName
	for name := range all {
		if inDegree[name] == 0 {
			queue = append(queue, name)
		}
	}

	var order []StageName
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		order = append(order, current)

		for _, next := range adjacency[current] {
			inDegree[next]--
			if inDegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}

	if len(order) != len(all) {
		return nil, fmt.Errorf("cycle detected in pipeline stage dependencies")
	}
	return order, nil
}

// --- Built-in stage scaffolds ---

// RawStage reads content from the DocumentSource.
type RawStage struct{}

func (RawStage) Name() StageName        { return StageRaw }
func (RawStage) DependsOn() []StageName { return nil }

func (RawStage) Run(ctx context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	node := g.Node(uri)
	if node == nil || node.Source == nil {
		return fmt.Errorf("no source for %s", uri)
	}
	content, version, err := node.Source.Read(ctx)
	if err != nil {
		return err
	}
	g.mu.Lock()
	node.Raw = content
	node.Version = version
	g.mu.Unlock()
	g.SetStageResult(uri, StageRaw, &StageResult{
		Stage:    StageRaw,
		Data:     content,
		Version:  version,
		Duration: time.Since(start),
	})
	return nil
}

// ParseOutput holds the results of the parse stage.
type ParseOutput struct {
	SemanticNode   *parser.SemanticNode
	PointerIndex   *parser.PointerIndex
	VirtualDocs    []parser.VirtualDocument
	NavigatorIndex *navigator.Index
}

// ParseStage builds the Navigator semantic/index view plus pointer metadata.
type ParseStage struct {
	Parser    *parser.Parser
	Providers []parser.EmbeddedLanguageProvider
}

func (s ParseStage) Name() StageName        { return StageParse }
func (s ParseStage) DependsOn() []StageName { return []StageName{StageRaw} }

func (s ParseStage) Run(_ context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	raw := g.StageResult(uri, StageRaw)
	if raw == nil {
		return fmt.Errorf("no raw content for %s", uri)
	}
	node := g.Node(uri)
	if node == nil {
		return fmt.Errorf("no node for %s", uri)
	}

	content, _ := raw.Data.([]byte)
	if content == nil {
		g.SetStageResult(uri, StageParse, &StageResult{
			Stage: StageParse, Data: &ParseOutput{}, Version: raw.Version, Duration: time.Since(start),
		})
		return nil
	}

	format := "yaml"
	if strings.HasSuffix(strings.ToLower(uri), ".json") {
		format = "json"
	}

	var semanticNode *parser.SemanticNode
	navIdx := navigator.ParseContent(content, uri)
	if navIdx != nil {
		semanticNode = navIdx.SemanticRoot()
	}

	if semanticNode == nil && s.Parser != nil {
		tree, err := s.Parser.Parse(content, format)
		if err != nil {
			semanticNode = nil
		} else {
			rootNode := tree.RootNode()
			if rootNode != nil {
				sn, _ := parser.BuildFromCST(rootNode, content)
				semanticNode = sn
			}
		}
	}

	if semanticNode == nil {
		semanticNode = parser.BuildFromRaw(content, format)
	}

	pointerIndex := parser.BuildPointerIndex(semanticNode)
	var vdocs []parser.VirtualDocument
	if len(s.Providers) > 0 && semanticNode != nil {
		vdocs = parser.ExtractVirtualDocuments(semanticNode, uri, s.Providers)
	}

	output := &ParseOutput{
		SemanticNode:   semanticNode,
		PointerIndex:   pointerIndex,
		VirtualDocs:    vdocs,
		NavigatorIndex: navIdx,
	}

	g.SetStageResult(uri, StageParse, &StageResult{
		Stage:    StageParse,
		Data:     output,
		Version:  raw.Version,
		Duration: time.Since(start),
	})
	return nil
}

// LintStage surfaces Navigator-owned parse/validation issues without re-deriving
// Telescope-local structural or schema diagnostics.
type LintStage struct{}

func (LintStage) Name() StageName        { return StageLint }
func (LintStage) DependsOn() []StageName { return []StageName{StageParse} }

func (LintStage) Run(_ context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	parsed := g.StageResult(uri, StageParse)
	if parsed == nil {
		return fmt.Errorf("no parse result for %s", uri)
	}

	output, _ := parsed.Data.(*ParseOutput)
	diags := navigatorIssues(uri, output)

	g.SetStageResult(uri, StageLint, &StageResult{
		Stage:       StageLint,
		Data:        output,
		Version:     parsed.Version,
		Diagnostics: diags,
		Duration:    time.Since(start),
	})
	return nil
}

func navigatorIssues(uri string, output *ParseOutput) []ctypes.Diagnostic {
	if output == nil || output.NavigatorIndex == nil || len(output.NavigatorIndex.Issues) == 0 {
		return nil
	}

	diags := make([]ctypes.Diagnostic, 0, len(output.NavigatorIndex.Issues))
	for _, issue := range output.NavigatorIndex.Issues {
		rng := issue.Range
		if rng == (navigator.Range{}) {
			rng = ctypes.FileStartRange
		}
		diags = append(diags, ctypes.Diagnostic{
			URI:      uri,
			Range:    rng,
			Severity: navigatorSeverity(issue.Severity),
			Code:     issue.Code,
			Source:   navigatorSource(issue.Category),
			Message:  issue.Message,
		})
	}
	return diags
}

func navigatorSeverity(sev navigator.Severity) ctypes.Severity {
	switch sev {
	case navigator.SeverityWarning:
		return ctypes.SeverityWarning
	case navigator.SeverityInfo:
		return ctypes.SeverityInfo
	default:
		return ctypes.SeverityError
	}
}

func navigatorSource(category navigator.IssueCategory) string {
	switch category {
	case navigator.CategorySyntax:
		return "navigator-syntax"
	case navigator.CategoryMeta:
		return "navigator-meta"
	default:
		return "navigator"
	}
}

// BindStage resolves $ref values and materializes edges in the workspace graph.
type BindStage struct{}

func (BindStage) Name() StageName        { return StageBind }
func (BindStage) DependsOn() []StageName { return []StageName{StageLint} }

func (BindStage) Run(_ context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	lint := g.StageResult(uri, StageLint)
	if lint == nil {
		return fmt.Errorf("no lint result for %s", uri)
	}

	output, _ := lint.Data.(*ParseOutput)
	g.RemoveEdgesFrom(uri)

	if output != nil && output.SemanticNode != nil {
		visited := make(map[string]bool)
		bindRefs(uri, "", output.SemanticNode, g, visited)
	}

	g.SetStageResult(uri, StageBind, &StageResult{
		Stage:    StageBind,
		Data:     output,
		Version:  lint.Version,
		Duration: time.Since(start),
	})
	return nil
}

// bindRefs walks the tree finding $ref values and creating graph edges.
func bindRefs(baseURI, pointer string, node *parser.SemanticNode, g *WorkspaceGraph, visited map[string]bool) {
	if node == nil {
		return
	}
	switch node.Kind {
	case parser.NodeMapping:
		refNode := node.Get("$ref")
		if refNode != nil && refNode.Kind == parser.NodeScalar {
			ref := refNode.StringValue()
			if ref != "" && !visited[ref] {
				visited[ref] = true
				targetURI, targetPointer := resolveRef(baseURI, ref)
				kind := EdgeRef
				if strings.HasPrefix(ref, "#") {
					kind = EdgeRef
				} else if strings.Contains(ref, "#") {
					kind = EdgePathRef
				} else {
					kind = EdgeExternal
				}
				g.AddEdge(Edge{
					SourceURI:     baseURI,
					SourcePointer: pointer + "/$ref",
					TargetURI:     targetURI,
					TargetPointer: targetPointer,
					Kind:          kind,
					RefValue:      ref,
				})
			}
		}
		for key, child := range node.Children {
			childPointer := pointer + "/" + escapeJSONPointer(key)
			bindRefs(baseURI, childPointer, child, g, visited)
		}
	case parser.NodeSequence:
		for i, item := range node.Items {
			itemPointer := fmt.Sprintf("%s/%d", pointer, i)
			bindRefs(baseURI, itemPointer, item, g, visited)
		}
	}
}

func resolveRef(baseURI, ref string) (string, string) {
	if ref == "" {
		return uri.Normalize(baseURI), ""
	}
	if ref[0] == '#' {
		return uri.Normalize(baseURI), ref[1:]
	}

	filePart, fragment := navigator.SplitRefURI(ref)
	targetURI := navigator.ResolveRelativeURI(baseURI, filePart)
	if targetURI == "" {
		targetURI = filePart
	}
	return uri.Normalize(targetURI), strings.TrimPrefix(fragment, "#")
}

func escapeJSONPointer(s string) string {
	s = strings.ReplaceAll(s, "~", "~0")
	s = strings.ReplaceAll(s, "/", "~1")
	return s
}

// ValidateStage is a compatibility pass-through stage retained so existing
// stage-based consumers keep the same topology while Navigator owns validation.
type ValidateStage struct{}

func (s ValidateStage) Name() StageName        { return StageValidate }
func (s ValidateStage) DependsOn() []StageName { return []StageName{StageBind} }

func (s ValidateStage) Run(_ context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	bind := g.StageResult(uri, StageBind)
	if bind == nil {
		return fmt.Errorf("no bind result for %s", uri)
	}

	g.SetStageResult(uri, StageValidate, &StageResult{
		Stage:    StageValidate,
		Data:     bind.Data,
		Version:  bind.Version,
		Duration: time.Since(start),
	})
	return nil
}

// AnalyzeStage runs built-in Go rules and optionally delegates to the Bun sidecar.
type AnalyzeStage struct {
	Analyzers []AnalyzeFunc
}

// AnalyzeFunc is a function that produces diagnostics for a document.
type AnalyzeFunc func(ctx context.Context, uri string, g *WorkspaceGraph) []ctypes.Diagnostic

func (s AnalyzeStage) Name() StageName        { return StageAnalyze }
func (s AnalyzeStage) DependsOn() []StageName { return []StageName{StageValidate} }

func (s AnalyzeStage) Run(ctx context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	valResult := g.StageResult(uri, StageValidate)
	if valResult == nil {
		return fmt.Errorf("no validate result for %s", uri)
	}

	var allDiags []ctypes.Diagnostic
	for _, fn := range s.Analyzers {
		diags := fn(ctx, uri, g)
		allDiags = append(allDiags, diags...)
	}

	// Accumulate diagnostics from previous stages
	node := g.Node(uri)
	if node != nil {
		var accumulated []ctypes.Diagnostic
		for _, stageName := range []StageName{StageLint, StageValidate} {
			if sr := g.StageResult(uri, stageName); sr != nil {
				accumulated = append(accumulated, sr.Diagnostics...)
			}
		}
		accumulated = append(accumulated, allDiags...)
		g.mu.Lock()
		node.Diagnostics = accumulated
		g.mu.Unlock()
	}

	g.SetStageResult(uri, StageAnalyze, &StageResult{
		Stage:       StageAnalyze,
		Data:        valResult.Data,
		Version:     valResult.Version,
		Diagnostics: allDiags,
		Duration:    time.Since(start),
	})
	return nil
}

// DefaultStages returns the built-in stage implementations in dependency order.
func DefaultStages() []Stage {
	return []Stage{
		RawStage{},
		ParseStage{},
		LintStage{},
		BindStage{},
		ValidateStage{},
		AnalyzeStage{},
	}
}
