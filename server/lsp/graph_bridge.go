package lsp

import (
	"context"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path"
	"strings"

	"github.com/LukasParke/gossip/protocol"
	navigator "github.com/sailpoint-oss/navigator"

	"github.com/sailpoint-oss/telescope/server/core/classify"
	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/core/parser"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

// GraphBridge connects the new core graph engine with the existing LSP
// handlers, providing incremental migration from IndexCache/ProjectManager
// to WorkspaceGraph/SnapshotManager.
type GraphBridge struct {
	graph      *graph.WorkspaceGraph
	snapMgr    *graph.SnapshotManager
	pipeline   *graph.PipelineRunner
	classifier *classify.FileClassifier
	virtualMgr *parser.VirtualDocumentManager
	logger     *slog.Logger
}

// NewGraphBridge creates a bridge that wraps the new V2 infrastructure.
func NewGraphBridge(logger *slog.Logger) *GraphBridge {
	markdownProvider := &parser.MarkdownProvider{}
	pipeline, err := graph.NewPipelineRunner([]graph.Stage{
		graph.RawStage{},
		graph.ParseStage{Providers: []parser.EmbeddedLanguageProvider{markdownProvider}},
		graph.LintStage{},
		graph.BindStage{},
		graph.ValidateStage{},
		graph.AnalyzeStage{},
	}, logger)
	if err != nil {
		panic(fmt.Sprintf("build graph pipeline: %v", err))
	}
	return &GraphBridge{
		graph:      graph.NewWorkspaceGraph(),
		snapMgr:    graph.NewSnapshotManager(),
		pipeline:   pipeline,
		classifier: classify.NewFileClassifier(),
		virtualMgr: parser.NewVirtualDocumentManager(markdownProvider),
		logger:     logger,
	}
}

// Graph returns the workspace graph.
func (b *GraphBridge) Graph() *graph.WorkspaceGraph {
	return b.graph
}

// SnapshotManager returns the snapshot manager.
func (b *GraphBridge) SnapshotManager() *graph.SnapshotManager {
	return b.snapMgr
}

// Pipeline returns the graph pipeline runner.
func (b *GraphBridge) Pipeline() *graph.PipelineRunner {
	return b.pipeline
}

// Classifier returns the file classifier.
func (b *GraphBridge) Classifier() *classify.FileClassifier {
	return b.classifier
}

// VirtualDocManager returns the virtual document manager.
func (b *GraphBridge) VirtualDocManager() *parser.VirtualDocumentManager {
	return b.virtualMgr
}

// OnDocumentOpen handles a new document opening by registering it in the graph.
func (b *GraphBridge) OnDocumentOpen(uri string, content []byte) {
	uri = normalizeURIStr(uri)
	src := graph.NewSyntheticSource(uri, content, graph.ClassificationHint{})
	b.graph.AddSource(src)

	b.updateClassification(uri, content)
}

// OnDocumentChange handles a document update.
func (b *GraphBridge) OnDocumentChange(uri string, content []byte) {
	uri = normalizeURIStr(uri)
	node := b.graph.Node(uri)
	if node == nil {
		b.OnDocumentOpen(uri, content)
		return
	}
	if src, ok := node.Source.(*graph.SyntheticSource); ok {
		src.Update(content)
	}
	b.updateClassification(uri, content)
	b.graph.Invalidate(uri)
}

// OnDocumentClose removes a document from the graph.
func (b *GraphBridge) OnDocumentClose(uri string) {
	uri = normalizeURIStr(uri)
	b.virtualMgr.Remove(uri)
	if b.addFilesystemSource(project.URIToPath(uri), true) != "" {
		b.graph.Invalidate(uri)
		return
	}
	b.graph.RemoveSource(uri)
}

// LookupDefinition uses the graph's edge index for $ref resolution.
// Returns the target URI and JSON pointer fragment, or empty values if not found.
func (b *GraphBridge) LookupDefinition(uri, ref string) (targetURI, targetPointer string, found bool) {
	normURI := string(protocol.NormalizeURI(protocol.DocumentURI(uri)))
	edges := b.graph.EdgesFrom(normURI)
	for _, e := range edges {
		if e.RefValue == ref {
			return e.TargetURI, e.TargetPointer, true
		}
	}
	return "", "", false
}

// Dependents returns URIs of documents that reference the given URI.
func (b *GraphBridge) Dependents(uri string) []string {
	return b.graph.Dependents(normalizeURIStr(uri))
}

// Dependencies returns URIs of documents that the given URI references.
func (b *GraphBridge) Dependencies(uri string) []string {
	return b.graph.Dependencies(normalizeURIStr(uri))
}

// EdgesTo returns all edges pointing to the given URI (reverse references).
func (b *GraphBridge) EdgesTo(uri string) []graph.Edge {
	return b.graph.EdgesTo(normalizeURIStr(uri))
}

// EdgesFrom returns all edges originating from the given URI.
func (b *GraphBridge) EdgesFrom(uri string) []graph.Edge {
	return b.graph.EdgesFrom(normalizeURIStr(uri))
}

// FindReferences uses the reverse edge index to find all references to a URI.
func (b *GraphBridge) FindReferences(uri string) []protocol.Location {
	edges := b.graph.EdgesTo(normalizeURIStr(uri))
	locations := make([]protocol.Location, 0, len(edges))
	for _, e := range edges {
		node := b.graph.Node(e.SourceURI)
		if node == nil {
			continue
		}
		locations = append(locations, protocol.Location{
			URI:   protocol.DocumentURI(e.SourceURI),
			Range: protocol.FileStartRange,
		})
	}
	return locations
}

// LoadWorkspaceFiles seeds the graph with filesystem-backed sources discovered
// during workspace initialization and builds a fresh snapshot from the
// pipeline-backed graph state.
func (b *GraphBridge) LoadWorkspaceFiles(ctx context.Context, cache *openapi.IndexCache, files []*project.DiscoveredFile) (*graph.Snapshot, error) {
	uris := make([]string, 0, len(files))
	for _, file := range files {
		if file == nil {
			continue
		}
		if uri := b.addFilesystemSource(file.Path, false); uri != "" {
			uris = append(uris, uri)
		}
	}
	return b.RunPipeline(ctx, cache, uris...)
}

// RunPipeline executes the graph pipeline for the given URIs, recursively
// materializing missing file-backed dependencies and then rebuilding the
// immutable snapshot. Projection indexes are refreshed into the cache when one
// is provided.
func (b *GraphBridge) RunPipeline(ctx context.Context, cache *openapi.IndexCache, uris ...string) (*graph.Snapshot, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	queue := make([]string, 0, len(uris))
	queued := make(map[string]bool)
	for _, uri := range uris {
		norm := normalizeURIStr(uri)
		if norm == "" || queued[norm] {
			continue
		}
		queue = append(queue, norm)
		queued[norm] = true
	}

	if len(queue) == 0 {
		return b.snapMgr.Build(b.graph), nil
	}

	var processed []string
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if b.graph.Node(current) == nil && b.ensureFilesystemURI(current) == "" {
			continue
		}

		if b.pipeline != nil {
			if err := b.pipeline.RunAll(ctx, current, b.graph); err != nil {
				return nil, err
			}
		}

		b.syncVirtualDocuments(current)
		processed = append(processed, current)

		for _, dep := range b.graph.Dependencies(current) {
			normDep := normalizeURIStr(dep)
			if normDep == "" || queued[normDep] {
				continue
			}
			if b.graph.Node(normDep) == nil && b.ensureFilesystemURI(normDep) == "" {
				continue
			}
			queue = append(queue, normDep)
			queued[normDep] = true
		}
	}

	snap := b.snapMgr.Build(b.graph)
	if cache != nil {
		for _, uri := range processed {
			if idx := b.IndexForURI(uri); idx != nil {
				cache.Set(protocol.DocumentURI(uri), idx)
				continue
			}
			cache.Delete(protocol.DocumentURI(uri))
		}
	}

	return snap, nil
}

// OnFileCreated adds a filesystem-backed source and rebuilds the pipeline view.
func (b *GraphBridge) OnFileCreated(ctx context.Context, cache *openapi.IndexCache, path string) (*graph.Snapshot, error) {
	uri := b.addFilesystemSource(path, false)
	if uri == "" {
		return b.snapMgr.Build(b.graph), nil
	}
	return b.RunPipeline(ctx, cache, uri)
}

// OnFileChanged refreshes a filesystem-backed source and invalidates its
// dependents before re-running the pipeline. Open synthetic documents remain
// authoritative while they are open in the editor.
func (b *GraphBridge) OnFileChanged(ctx context.Context, cache *openapi.IndexCache, uri string) (*graph.Snapshot, error) {
	uri = normalizeURIStr(uri)
	if node := b.graph.Node(uri); node != nil {
		if _, ok := node.Source.(*graph.SyntheticSource); ok {
			return b.CurrentSnapshot(), nil
		}
	}

	if b.ensureFilesystemURI(uri) == "" {
		return b.snapMgr.Build(b.graph), nil
	}

	affected := b.graph.Invalidate(uri)
	if len(affected) == 0 {
		affected = []string{uri}
	}
	return b.RunPipeline(ctx, cache, affected...)
}

// OnFileDeleted removes a filesystem-backed source, invalidates reverse
// dependents, and rebuilds the snapshot.
func (b *GraphBridge) OnFileDeleted(ctx context.Context, cache *openapi.IndexCache, path string) (*graph.Snapshot, error) {
	uri := normalizeURIStr(project.PathToURI(path))
	node := b.graph.Node(uri)
	if node != nil {
		if _, ok := node.Source.(*graph.SyntheticSource); ok {
			return b.CurrentSnapshot(), nil
		}
	}

	dependents := b.graph.TransitiveDependents(uri)
	b.graph.RemoveSource(uri)
	b.virtualMgr.Remove(uri)
	if cache != nil {
		cache.Delete(protocol.DocumentURI(uri))
	}

	if len(dependents) == 0 {
		return b.snapMgr.Build(b.graph), nil
	}

	for _, dependent := range dependents {
		b.graph.Invalidate(dependent)
	}
	return b.RunPipeline(ctx, cache, dependents...)
}

// IndexForURI projects the current graph-backed parse output into the legacy
// openapi.Index surface used by existing handlers.
func (b *GraphBridge) IndexForURI(uri string) *openapi.Index {
	normURI := normalizeURIStr(uri)
	if output := b.parseOutput(normURI); output != nil && output.NavigatorIndex != nil {
		return openapi.IndexFromNavigator(output.NavigatorIndex, protocol.DocumentURI(normURI))
	}

	if node := b.graph.Node(normURI); node != nil && len(node.Raw) > 0 {
		if navIdx := navigator.ParseAndIndex(node.Raw); navIdx != nil {
			return openapi.IndexFromNavigator(navIdx, protocol.DocumentURI(normURI))
		}
	}

	return nil
}

// ResolveRef resolves a local or cross-file $ref through the graph-backed
// workspace model using the projection index cache for target materialization.
func (b *GraphBridge) ResolveRef(cache *openapi.IndexCache, fromURI, ref string) (protocol.DocumentURI, interface{}, error) {
	normFrom := protocol.NormalizeURI(protocol.DocumentURI(fromURI))
	if ref == "" {
		return "", nil, fmt.Errorf("empty ref")
	}

	if strings.HasPrefix(ref, "#") {
		idx := cache.Get(normFrom)
		if idx == nil {
			return "", nil, fmt.Errorf("missing source index for %s", normFrom)
		}
		target, err := idx.Resolve(ref)
		if err != nil {
			return "", nil, err
		}
		return normFrom, target, nil
	}

	if targetURI, targetPtr, ok := b.LookupDefinition(string(normFrom), ref); ok {
		normTarget := protocol.NormalizeURI(protocol.DocumentURI(targetURI))
		if targetPtr == "" {
			if idx := cache.Get(normTarget); idx != nil {
				return normTarget, idx.PrimaryValue(), nil
			}
			return normTarget, nil, nil
		}
		if targetIdx := cache.Get(normTarget); targetIdx != nil {
			target, err := targetIdx.Resolve("#" + targetPtr)
			if err != nil {
				return "", nil, err
			}
			return normTarget, target, nil
		}
		return "", nil, fmt.Errorf("missing target index for %s", normTarget)
	}

	filePart, fragment := navigator.SplitRefURI(ref)
	targetURI := navigator.ResolveRelativeURI(string(normFrom), filePart)
	if targetURI == "" {
		return "", nil, fmt.Errorf("cannot resolve %q from %s", ref, normFrom)
	}
	normTarget := protocol.NormalizeURI(protocol.DocumentURI(targetURI))
	targetIdx := cache.Get(normTarget)
	if targetIdx == nil {
		return "", nil, fmt.Errorf("missing target index for %s", normTarget)
	}
	if fragment == "" || fragment == "#" {
		return normTarget, targetIdx.PrimaryValue(), nil
	}
	target, err := targetIdx.Resolve(fragment)
	if err != nil {
		return "", nil, err
	}
	return normTarget, target, nil
}

// BuildSnapshot builds a new snapshot from the current graph state.
func (b *GraphBridge) BuildSnapshot() *graph.Snapshot {
	return b.snapMgr.Build(b.graph)
}

// CurrentSnapshot returns the latest immutable snapshot.
// Returns nil before any snapshot has been built.
func (b *GraphBridge) CurrentSnapshot() *graph.Snapshot {
	return b.snapMgr.Current()
}

// SnapshotNode returns the snapshot node for a URI, or nil if not found.
func (b *GraphBridge) SnapshotNode(uri string) *graph.SnapshotNode {
	snap := b.snapMgr.Current()
	if snap == nil {
		return nil
	}
	if n, ok := snap.Nodes[normalizeURIStr(uri)]; ok {
		return &n
	}
	return nil
}

// SnapshotPointerIndex returns the pointer index from the latest snapshot.
func (b *GraphBridge) SnapshotPointerIndex(uri string) *parser.PointerIndex {
	snap := b.snapMgr.Current()
	if snap == nil {
		return nil
	}
	return snap.PointerIndices[normalizeURIStr(uri)]
}

// EnrichDiagnosticsWithRefContext adds RelatedInformation to diagnostics
// that occur within nodes resolved from $ref, linking back to the reference site.
func (b *GraphBridge) EnrichDiagnosticsWithRefContext(uri string, diags []ctypes.Diagnostic) []ctypes.Diagnostic {
	refEdges := b.graph.EdgesTo(normalizeURIStr(uri))
	if len(refEdges) == 0 {
		return diags
	}

	for i := range diags {
		for _, edge := range refEdges {
			diags[i].Related = append(diags[i].Related, ctypes.RelatedInformation{
				URI: edge.SourceURI,
				Range: ctypes.Range{
					Start: ctypes.Position{Line: 0, Character: 0},
					End:   ctypes.Position{Line: 0, Character: 0},
				},
				Message: fmt.Sprintf("Referenced via $ref from %s", edge.SourceURI),
			})
		}
	}
	return diags
}

// OnSnapshot registers a callback for when a new snapshot becomes current.
func (b *GraphBridge) OnSnapshot(fn func(*graph.Snapshot)) {
	b.snapMgr.OnSnapshot(fn)
}

func (b *GraphBridge) parseOutput(uri string) *graph.ParseOutput {
	if sr := b.graph.StageResult(normalizeURIStr(uri), graph.StageParse); sr != nil {
		if output, ok := sr.Data.(*graph.ParseOutput); ok {
			return output
		}
	}
	return nil
}

func (b *GraphBridge) syncVirtualDocuments(uri string) {
	output := b.parseOutput(uri)
	if output == nil || output.SemanticNode == nil {
		b.virtualMgr.Remove(uri)
		return
	}
	b.virtualMgr.Update(uri, output.SemanticNode)
}

func (b *GraphBridge) updateClassification(uri string, content []byte) {
	classification := b.classifier.Classify(uri, content, false)
	if classification.IsOpenAPI || classification.DocumentKind == openapi.DocumentKindArazzo {
		b.graph.SetRoot(uri, !classification.IsFragment)
		return
	}
	b.graph.SetRoot(uri, false)
}

func (b *GraphBridge) ensureFilesystemURI(uri string) string {
	return b.addFilesystemSource(project.URIToPath(uri), false)
}

func (b *GraphBridge) addFilesystemSource(path string, replaceSynthetic bool) string {
	if path == "" {
		return ""
	}
	if _, err := os.Stat(path); err != nil {
		return ""
	}

	src := graph.NewFilesystemSource(path, graph.ClassificationHint{})
	uri := normalizeURIStr(src.URI())
	if node := b.graph.Node(uri); node != nil {
		if _, ok := node.Source.(*graph.SyntheticSource); ok && !replaceSynthetic {
			return uri
		}
	}

	content, _, err := src.Read(context.Background())
	if err != nil {
		return ""
	}

	b.graph.AddSource(src)
	b.updateClassification(uri, content)
	return uri
}

func normalizeURIStr(uri string) string {
	return string(protocol.NormalizeURI(protocol.DocumentURI(uri)))
}

func graphResolveRefTarget(baseURI, ref string) string {
	if ref == "" {
		return baseURI
	}
	if ref[0] == '#' {
		return baseURI
	}
	idx := len(ref)
	for i, c := range ref {
		if c == '#' {
			idx = i
			break
		}
	}
	filePart := ref[:idx]

	u, err := url.Parse(baseURI)
	if err != nil || u.Scheme != "file" {
		return filePart
	}
	baseDir := path.Dir(u.Path)
	resolved := path.Clean(path.Join(baseDir, filePart))
	target := &url.URL{Scheme: "file", Path: resolved}
	return target.String()
}

func graphExtractFragment(ref string) string {
	for i, c := range ref {
		if c == '#' {
			return ref[i+1:]
		}
	}
	return ""
}
