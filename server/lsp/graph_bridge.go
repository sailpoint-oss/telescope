package lsp

import (
	"fmt"
	"log/slog"
	"net/url"
	"path"

	"github.com/LukasParke/gossip/protocol"

	"github.com/sailpoint-oss/telescope/server/core/classify"
	"github.com/sailpoint-oss/telescope/server/core/graph"
	"github.com/sailpoint-oss/telescope/server/core/parser"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// GraphBridge connects the new core graph engine with the existing LSP
// handlers, providing incremental migration from IndexCache/ProjectManager
// to WorkspaceGraph/SnapshotManager.
type GraphBridge struct {
	graph      *graph.WorkspaceGraph
	snapMgr    *graph.SnapshotManager
	classifier *classify.FileClassifier
	virtualMgr *parser.VirtualDocumentManager
	logger     *slog.Logger
}

// NewGraphBridge creates a bridge that wraps the new V2 infrastructure.
func NewGraphBridge(logger *slog.Logger) *GraphBridge {
	return &GraphBridge{
		graph:      graph.NewWorkspaceGraph(),
		snapMgr:    graph.NewSnapshotManager(),
		classifier: classify.NewFileClassifier(),
		virtualMgr: parser.NewVirtualDocumentManager(&parser.MarkdownProvider{}),
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

	classification := b.classifier.Classify(uri, content, false)
	if classification.IsOpenAPI {
		b.graph.SetRoot(uri, !classification.IsFragment)
	}
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
	b.graph.Invalidate(uri)
}

// OnDocumentClose removes a document from the graph.
func (b *GraphBridge) OnDocumentClose(uri string) {
	uri = normalizeURIStr(uri)
	b.graph.RemoveSource(uri)
	b.virtualMgr.Remove(uri)
}

// SyncEdgesFromIndex updates the graph's edge index from an OpenAPI index.
// This bridges the old IndexCache with the new graph engine.
func (b *GraphBridge) SyncEdgesFromIndex(uri string, idx *openapi.Index) {
	if idx == nil {
		return
	}
	uri = normalizeURIStr(uri)
	b.graph.RemoveEdgesFrom(uri)
	for _, ref := range idx.AllRefs {
		if ref.Target == "" || ref.Target[0] == '#' {
			continue // local refs don't need graph edges
		}
		b.graph.AddEdge(graph.Edge{
			SourceURI:     uri,
			SourcePointer: ref.From,
			TargetURI:     normalizeURIStr(graphResolveRefTarget(uri, ref.Target)),
			TargetPointer: graphExtractFragment(ref.Target),
			Kind:          graph.EdgeRef,
			RefValue:      ref.Target,
		})
	}
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
