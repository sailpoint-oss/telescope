package graph

import (
	"context"
	"sync"
	"sync/atomic"

	"github.com/sailpoint-oss/telescope/server/core/classify"
	"github.com/sailpoint-oss/telescope/server/core/parser"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// Snapshot is an immutable point-in-time view of the workspace graph state.
// Sync handlers read from the current snapshot; async analysis builds the next.
type Snapshot struct {
	ID              uint64
	Nodes           map[string]SnapshotNode
	Diagnostics     map[string][]ctypes.Diagnostic
	Roots           []string
	PointerIndices  map[string]*parser.PointerIndex
	VirtualDocs     map[string][]parser.VirtualDocument
	Classifications map[string]*classify.FileClassification
}

// SnapshotNode holds the immutable per-document state within a snapshot.
type SnapshotNode struct {
	URI          string
	Version      int64
	Raw          []byte
	StageResults map[StageName]interface{} // stage-specific cached data
}

// SnapshotManager holds the current snapshot and builds next snapshots
// atomically. Thread-safe for concurrent reads.
type SnapshotManager struct {
	mu       sync.RWMutex
	current  atomic.Pointer[Snapshot]
	nextID   atomic.Uint64
	onChange []func(*Snapshot)
	enqueued map[string]bool
}

// NewSnapshotManager creates a new SnapshotManager.
func NewSnapshotManager() *SnapshotManager {
	return &SnapshotManager{
		enqueued: make(map[string]bool),
	}
}

// Current returns the latest immutable snapshot.
func (m *SnapshotManager) Current() *Snapshot {
	return m.current.Load()
}

// Enqueue marks a URI for re-processing in the next snapshot.
func (m *SnapshotManager) Enqueue(uri string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.enqueued[uri] = true
}

// BuildNext runs the pipeline on all enqueued URIs, produces a new snapshot,
// and atomically swaps it as the current. If pipeline is nil, only the
// snapshot is rebuilt without running pipeline stages.
func (m *SnapshotManager) BuildNext(ctx context.Context, g *WorkspaceGraph, pipeline *PipelineRunner) *Snapshot {
	m.mu.Lock()
	uris := make([]string, 0, len(m.enqueued))
	for uri := range m.enqueued {
		uris = append(uris, uri)
	}
	m.enqueued = make(map[string]bool)
	m.mu.Unlock()

	if pipeline != nil {
		for _, uri := range uris {
			if ctx.Err() != nil {
				break
			}
			_ = pipeline.RunAll(ctx, uri, g)
		}
	}

	return m.Build(g)
}

// Build creates a new snapshot from the graph's current state and swaps it in.
func (m *SnapshotManager) Build(g *WorkspaceGraph) *Snapshot {
	id := m.nextID.Add(1)

	nodes := make(map[string]SnapshotNode)
	diagnostics := make(map[string][]ctypes.Diagnostic)
	roots := g.Roots()
	pointerIndices := make(map[string]*parser.PointerIndex)
	virtualDocs := make(map[string][]parser.VirtualDocument)
	classifications := make(map[string]*classify.FileClassification)

	for _, uri := range g.AllNodes() {
		node := g.Node(uri)
		if node == nil {
			continue
		}

		stageResults := make(map[StageName]interface{})
		for stage, sr := range node.StageResults {
			if sr != nil && !node.DirtyStages[stage] {
				stageResults[stage] = sr.Data
			}
		}

		raw := make([]byte, len(node.Raw))
		copy(raw, node.Raw)

		nodes[uri] = SnapshotNode{
			URI:          uri,
			Version:      node.Version,
			Raw:          raw,
			StageResults: stageResults,
		}

		if len(node.Diagnostics) > 0 {
			diags := make([]ctypes.Diagnostic, len(node.Diagnostics))
			copy(diags, node.Diagnostics)
			diagnostics[uri] = diags
		}

		// Extract pointer index and virtual docs from ParseOutput
		if parseResult := stageResults[StageParse]; parseResult != nil {
			if po, ok := parseResult.(*ParseOutput); ok && po != nil {
				if po.PointerIndex != nil {
					pointerIndices[uri] = po.PointerIndex
				}
				if len(po.VirtualDocs) > 0 {
					virtualDocs[uri] = po.VirtualDocs
				}
			} else if pi, ok := parseResult.(*parser.PointerIndex); ok {
				pointerIndices[uri] = pi
			}
		}

		// Extract classification if available
		if classResult := stageResults["classify"]; classResult != nil {
			if fc, ok := classResult.(*classify.FileClassification); ok {
				classifications[uri] = fc
			}
		}
	}

	snap := &Snapshot{
		ID:              id,
		Nodes:           nodes,
		Diagnostics:     diagnostics,
		Roots:           roots,
		PointerIndices:  pointerIndices,
		VirtualDocs:     virtualDocs,
		Classifications: classifications,
	}

	m.current.Store(snap)

	m.mu.Lock()
	callbacks := make([]func(*Snapshot), len(m.onChange))
	copy(callbacks, m.onChange)
	m.mu.Unlock()

	for _, fn := range callbacks {
		if fn != nil {
			fn(snap)
		}
	}

	return snap
}

// OnSnapshot registers a callback for when a new snapshot becomes current.
func (m *SnapshotManager) OnSnapshot(fn func(*Snapshot)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onChange = append(m.onChange, fn)
}
