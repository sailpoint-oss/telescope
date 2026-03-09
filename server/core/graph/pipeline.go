package graph

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/sailpoint-oss/telescope/server/core/parser"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/core/validate"
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

func (RawStage) Name() StageName         { return StageRaw }
func (RawStage) DependsOn() []StageName  { return nil }

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
	SemanticNode *parser.SemanticNode
	PointerIndex *parser.PointerIndex
	VirtualDocs  []parser.VirtualDocument
}

// ParseStage runs tree-sitter parsing, builds semantic IR and pointer index.
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

	// If no parser is configured, just build a semantic node from scratch
	// using the standalone BuildFromCST stub
	var semanticNode *parser.SemanticNode
	if s.Parser != nil {
		tree, err := s.Parser.Parse(content, format)
		if err != nil {
			g.SetStageResult(uri, StageParse, &StageResult{
				Stage: StageParse, Data: &ParseOutput{}, Version: raw.Version, Duration: time.Since(start),
			})
			return nil
		}
		rootNode := tree.RootNode()
		if rootNode != nil {
			sn, _ := parser.BuildFromCST(rootNode, content)
			semanticNode = sn
		}
	}

	// If parser not available or parsing failed, build semantic node from raw content
	if semanticNode == nil {
		semanticNode = parser.BuildFromRaw(content, format)
	}

	pointerIndex := parser.BuildPointerIndex(semanticNode)
	var vdocs []parser.VirtualDocument
	if len(s.Providers) > 0 && semanticNode != nil {
		vdocs = parser.ExtractVirtualDocuments(semanticNode, uri, s.Providers)
	}

	output := &ParseOutput{
		SemanticNode: semanticNode,
		PointerIndex: pointerIndex,
		VirtualDocs:  vdocs,
	}

	g.SetStageResult(uri, StageParse, &StageResult{
		Stage:    StageParse,
		Data:     output,
		Version:  raw.Version,
		Duration: time.Since(start),
	})
	return nil
}

// LintStage performs structural validation without $ref resolution.
type LintStage struct{}

func (LintStage) Name() StageName         { return StageLint }
func (LintStage) DependsOn() []StageName  { return []StageName{StageParse} }

func (LintStage) Run(_ context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	parsed := g.StageResult(uri, StageParse)
	if parsed == nil {
		return fmt.Errorf("no parse result for %s", uri)
	}

	output, _ := parsed.Data.(*ParseOutput)
	var diags []ctypes.Diagnostic

	if output != nil && output.SemanticNode != nil {
		diags = lintStructural(uri, output.SemanticNode)
	}

	g.SetStageResult(uri, StageLint, &StageResult{
		Stage:       StageLint,
		Data:        output,
		Version:     parsed.Version,
		Diagnostics: diags,
		Duration:    time.Since(start),
	})
	return nil
}

// lintStructural checks for basic structural issues without needing $ref resolution.
func lintStructural(uri string, root *parser.SemanticNode) []ctypes.Diagnostic {
	var diags []ctypes.Diagnostic
	if root == nil || root.Kind != parser.NodeMapping {
		return diags
	}

	// Check for required top-level fields
	hasOpenAPI := root.Get("openapi") != nil || root.Get("swagger") != nil
	if !hasOpenAPI {
		// Might be a fragment, skip structural checks
		return diags
	}

	if info := root.Get("info"); info == nil {
		diags = append(diags, ctypes.Diagnostic{
			URI:      uri,
			Range:    root.Range,
			Severity: ctypes.SeverityError,
			Code:     "missing-info",
			Source:   "telescope",
			Message:  "OpenAPI document must have an 'info' object",
		})
	} else if info.Kind == parser.NodeMapping {
		if info.Get("title") == nil {
			diags = append(diags, ctypes.Diagnostic{
				URI:      uri,
				Range:    info.Range,
				Severity: ctypes.SeverityError,
				Code:     "missing-info-title",
				Source:   "telescope",
				Message:  "info object must have a 'title' field",
			})
		}
		if info.Get("version") == nil {
			diags = append(diags, ctypes.Diagnostic{
				URI:      uri,
				Range:    info.Range,
				Severity: ctypes.SeverityError,
				Code:     "missing-info-version",
				Source:   "telescope",
				Message:  "info object must have a 'version' field",
			})
		}
	}

	return diags
}

// BindStage resolves $ref values and materializes edges in the workspace graph.
type BindStage struct{}

func (BindStage) Name() StageName         { return StageBind }
func (BindStage) DependsOn() []StageName  { return []StageName{StageLint} }

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
		Stage:   StageBind,
		Data:    output,
		Version: lint.Version,
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
		return baseURI, ""
	}
	if ref[0] == '#' {
		return baseURI, ref[1:]
	}
	idx := strings.IndexByte(ref, '#')
	if idx < 0 {
		return ref, ""
	}
	return ref[:idx], ref[idx+1:]
}

func escapeJSONPointer(s string) string {
	s = strings.ReplaceAll(s, "~", "~0")
	s = strings.ReplaceAll(s, "/", "~1")
	return s
}

// ValidateStage runs JSON Schema validation with the enrichment pipeline.
type ValidateStage struct {
	Validator *validate.SchemaValidator
	Enricher  *validate.EnrichmentPipeline
}

func (s ValidateStage) Name() StageName         { return StageValidate }
func (s ValidateStage) DependsOn() []StageName  { return []StageName{StageBind} }

func (s ValidateStage) Run(_ context.Context, uri string, g *WorkspaceGraph) error {
	start := time.Now()
	bind := g.StageResult(uri, StageBind)
	if bind == nil {
		return fmt.Errorf("no bind result for %s", uri)
	}

	node := g.Node(uri)
	var diags []ctypes.Diagnostic

	if s.Validator != nil && node != nil && len(node.Raw) > 0 {
		output, _ := bind.Data.(*ParseOutput)

		// Detect the OpenAPI version from semantic tree to pick the right schema
		version := detectVersion(output)

		// Convert pointer index to map[string]Range
		piMap := make(map[string]ctypes.Range)
		if output != nil && output.PointerIndex != nil {
			for ptr, r := range output.PointerIndex.All() {
				piMap[ptr] = r
			}
		}

		errs := s.Validator.Validate(node.Raw, version, piMap)
		if s.Enricher != nil {
			errs = s.Enricher.EnrichAll(errs, node.Raw)
		}
		for _, e := range errs {
			diags = append(diags, ctypes.Diagnostic{
				URI:      uri,
				Range:    e.Range,
				Severity: ctypes.SeverityError,
				Code:     "schema/" + e.Keyword,
				Source:   "telescope",
				Message:  e.Message,
				Fixes:    e.Fixes,
			})
		}
	}

	g.SetStageResult(uri, StageValidate, &StageResult{
		Stage:       StageValidate,
		Data:        bind.Data,
		Version:     bind.Version,
		Diagnostics: diags,
		Duration:    time.Since(start),
	})
	return nil
}

func detectVersion(output *ParseOutput) string {
	if output == nil || output.SemanticNode == nil {
		return ""
	}
	if v := output.SemanticNode.Get("openapi"); v != nil {
		return v.StringValue()
	}
	if v := output.SemanticNode.Get("swagger"); v != nil {
		return v.StringValue()
	}
	return ""
}

// AnalyzeStage runs built-in Go rules and optionally delegates to the Bun sidecar.
type AnalyzeStage struct {
	Analyzers []AnalyzeFunc
}

// AnalyzeFunc is a function that produces diagnostics for a document.
type AnalyzeFunc func(ctx context.Context, uri string, g *WorkspaceGraph) []ctypes.Diagnostic

func (s AnalyzeStage) Name() StageName         { return StageAnalyze }
func (s AnalyzeStage) DependsOn() []StageName  { return []StageName{StageValidate} }

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
