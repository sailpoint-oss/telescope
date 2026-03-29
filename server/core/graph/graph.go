package graph

import (
	"sync"
	"time"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	navgraph "github.com/sailpoint-oss/navigator/graph"
)

// EdgeKind is an alias for navigator/graph.EdgeKind.
type EdgeKind = navgraph.EdgeKind

// Edge constants.
const (
	EdgeRef      = navgraph.EdgeRef
	EdgeExternal = navgraph.EdgeExternal
	EdgePathRef  = navgraph.EdgePathRef
)

// Edge is an alias for navigator/graph.Edge.
type Edge = navgraph.Edge

// StageName is an alias for navigator/graph.StageName.
type StageName = navgraph.StageName

// Stage name constants.
const (
	StageRaw      = navgraph.StageRaw
	StageParse    = navgraph.StageParse
	StageLint     = navgraph.StageLint
	StageBind     = navgraph.StageBind
	StageValidate = navgraph.StageValidate
	StageAnalyze  = navgraph.StageAnalyze
)

// StageResult holds the cached output of a pipeline stage.
type StageResult struct {
	Stage       StageName           // which stage produced this
	Data        interface{}         // stage-specific output
	Version     int64               // document version when this result was computed
	Diagnostics []ctypes.Diagnostic // diagnostics produced by this stage
	Duration    time.Duration       // how long the stage took
}

// GraphNode holds all state for a single document in the workspace graph.
type GraphNode struct {
	Source       DocumentSource
	Version      int64
	Raw          []byte
	StageResults map[StageName]*StageResult
	DirtyStages  map[StageName]bool
	Diagnostics  []ctypes.Diagnostic
}

// ChangeAction describes what kind of graph mutation occurred.
type ChangeAction string

const (
	ChangeAddSource    ChangeAction = "add_source"
	ChangeRemoveSource ChangeAction = "remove_source"
	ChangeAddEdge      ChangeAction = "add_edge"
	ChangeRemoveEdges  ChangeAction = "remove_edges"
	ChangeInvalidate   ChangeAction = "invalidate"
	ChangeSetRoot      ChangeAction = "set_root"
)

// ChangeEntry records a single graph mutation for debugging and replay.
type ChangeEntry struct {
	Time     time.Time
	Action   ChangeAction
	URI      string
	Affected []string // URIs affected by this change
}

// WorkspaceGraph is the unified directed graph replacing both project.FileGraph
// and openapi.IndexCache. It maintains forward/reverse edge indexes and
// per-node pipeline stage caches with invalidation cascades.
type WorkspaceGraph struct {
	mu        sync.RWMutex
	nodes     map[string]*GraphNode // URI -> node
	edges     map[string][]Edge     // source URI -> outgoing edges
	revEdges  map[string][]Edge     // target URI -> incoming edges
	roots     map[string]bool       // URIs identified as root documents
	ChangeLog []ChangeEntry
}

// NewWorkspaceGraph creates an empty workspace graph.
func NewWorkspaceGraph() *WorkspaceGraph {
	return &WorkspaceGraph{
		nodes:    make(map[string]*GraphNode),
		edges:    make(map[string][]Edge),
		revEdges: make(map[string][]Edge),
		roots:    make(map[string]bool),
	}
}

// AddSource adds a document source to the graph. If the URI already exists,
// its source is replaced.
func (g *WorkspaceGraph) AddSource(src DocumentSource) {
	g.mu.Lock()
	defer g.mu.Unlock()
	uri := src.URI()
	if node, ok := g.nodes[uri]; ok {
		node.Source = src
		g.markAllDirtyLocked(uri)
	} else {
		g.nodes[uri] = &GraphNode{
			Source:       src,
			StageResults: make(map[StageName]*StageResult),
			DirtyStages:  make(map[StageName]bool),
		}
	}
	g.ChangeLog = append(g.ChangeLog, ChangeEntry{
		Time: time.Now(), Action: ChangeAddSource, URI: uri,
	})
}

// RemoveSource removes a document and all its edges from the graph.
// Returns the URIs of nodes that were affected by the removal.
func (g *WorkspaceGraph) RemoveSource(uri string) []string {
	g.mu.Lock()
	defer g.mu.Unlock()

	if _, ok := g.nodes[uri]; !ok {
		return nil
	}

	affected := g.removeEdgesFromLocked(uri)
	g.removeIncomingEdgesLocked(uri)

	delete(g.nodes, uri)
	delete(g.roots, uri)
	g.ChangeLog = append(g.ChangeLog, ChangeEntry{
		Time: time.Now(), Action: ChangeRemoveSource, URI: uri, Affected: affected,
	})
	return affected
}

// Invalidate marks all stages dirty for the given URI and cascades to
// dependent nodes. Returns the full set of affected URIs.
func (g *WorkspaceGraph) Invalidate(uri string) []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	affected := g.invalidateLocked(uri)
	g.ChangeLog = append(g.ChangeLog, ChangeEntry{
		Time: time.Now(), Action: ChangeInvalidate, URI: uri, Affected: affected,
	})
	return affected
}

func (g *WorkspaceGraph) invalidateLocked(uri string) []string {
	visited := make(map[string]bool)
	queue := []string{uri}
	visited[uri] = true

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		g.markAllDirtyLocked(current)
		for _, edge := range g.revEdges[current] {
			if !visited[edge.SourceURI] {
				visited[edge.SourceURI] = true
				queue = append(queue, edge.SourceURI)
			}
		}
	}

	result := make([]string, 0, len(visited))
	for u := range visited {
		result = append(result, u)
	}
	return result
}

func (g *WorkspaceGraph) markAllDirtyLocked(uri string) {
	node, ok := g.nodes[uri]
	if !ok {
		return
	}
	for stage := range node.StageResults {
		node.DirtyStages[stage] = true
	}
}

// AddEdge records a directed edge. Duplicates are allowed (the graph stores all).
func (g *WorkspaceGraph) AddEdge(edge Edge) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.edges[edge.SourceURI] = append(g.edges[edge.SourceURI], edge)
	g.revEdges[edge.TargetURI] = append(g.revEdges[edge.TargetURI], edge)
	g.ChangeLog = append(g.ChangeLog, ChangeEntry{
		Time: time.Now(), Action: ChangeAddEdge, URI: edge.SourceURI,
		Affected: []string{edge.TargetURI},
	})
}

// RemoveEdgesFrom removes all outgoing edges from the given URI and returns
// the URIs of previously referenced targets.
func (g *WorkspaceGraph) RemoveEdgesFrom(uri string) []string {
	g.mu.Lock()
	defer g.mu.Unlock()
	affected := g.removeEdgesFromLocked(uri)
	g.ChangeLog = append(g.ChangeLog, ChangeEntry{
		Time: time.Now(), Action: ChangeRemoveEdges, URI: uri, Affected: affected,
	})
	return affected
}

func (g *WorkspaceGraph) removeEdgesFromLocked(uri string) []string {
	outgoing := g.edges[uri]
	affected := make(map[string]bool)
	for _, edge := range outgoing {
		affected[edge.TargetURI] = true
		g.removeRevEdgeLocked(edge.TargetURI, uri)
	}
	delete(g.edges, uri)
	return mapToSlice(affected)
}

func (g *WorkspaceGraph) removeIncomingEdgesLocked(uri string) {
	incoming := g.revEdges[uri]
	for _, edge := range incoming {
		filtered := g.edges[edge.SourceURI][:0]
		for _, e := range g.edges[edge.SourceURI] {
			if e.TargetURI != uri {
				filtered = append(filtered, e)
			}
		}
		g.edges[edge.SourceURI] = filtered
	}
	delete(g.revEdges, uri)
}

func (g *WorkspaceGraph) removeRevEdgeLocked(targetURI, sourceURI string) {
	rev := g.revEdges[targetURI]
	filtered := rev[:0]
	for _, e := range rev {
		if e.SourceURI != sourceURI {
			filtered = append(filtered, e)
		}
	}
	if len(filtered) == 0 {
		delete(g.revEdges, targetURI)
	} else {
		g.revEdges[targetURI] = filtered
	}
}

// SetRoot marks a URI as a root document (entry point).
func (g *WorkspaceGraph) SetRoot(uri string, isRoot bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if isRoot {
		g.roots[uri] = true
	} else {
		delete(g.roots, uri)
	}
	g.ChangeLog = append(g.ChangeLog, ChangeEntry{
		Time: time.Now(), Action: ChangeSetRoot, URI: uri,
	})
}

// Roots returns all URIs marked as root documents.
func (g *WorkspaceGraph) Roots() []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return mapToSlice(g.roots)
}

// Node returns the graph node for a URI, or nil if not found.
func (g *WorkspaceGraph) Node(uri string) *GraphNode {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return g.nodes[uri]
}

// AllNodes returns all URIs in the graph.
func (g *WorkspaceGraph) AllNodes() []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	uris := make([]string, 0, len(g.nodes))
	for uri := range g.nodes {
		uris = append(uris, uri)
	}
	return uris
}

// EdgesFrom returns all outgoing edges from the given URI.
func (g *WorkspaceGraph) EdgesFrom(uri string) []Edge {
	g.mu.RLock()
	defer g.mu.RUnlock()
	out := make([]Edge, len(g.edges[uri]))
	copy(out, g.edges[uri])
	return out
}

// EdgesTo returns all incoming edges to the given URI (reverse lookup).
func (g *WorkspaceGraph) EdgesTo(uri string) []Edge {
	g.mu.RLock()
	defer g.mu.RUnlock()
	out := make([]Edge, len(g.revEdges[uri]))
	copy(out, g.revEdges[uri])
	return out
}

// Dependents returns URIs that reference the given URI via any edge kind.
func (g *WorkspaceGraph) Dependents(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	seen := make(map[string]bool)
	for _, e := range g.revEdges[uri] {
		seen[e.SourceURI] = true
	}
	return mapToSlice(seen)
}

// Dependencies returns URIs that the given URI references via any edge kind.
func (g *WorkspaceGraph) Dependencies(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	seen := make(map[string]bool)
	for _, e := range g.edges[uri] {
		seen[e.TargetURI] = true
	}
	return mapToSlice(seen)
}

// TransitiveDependencies returns all URIs reachable by walking outgoing edges
// from the given URI (breadth-first). The starting URI is not included.
func (g *WorkspaceGraph) TransitiveDependencies(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	visited := map[string]bool{uri: true}
	queue := []string{uri}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, e := range g.edges[current] {
			if !visited[e.TargetURI] {
				visited[e.TargetURI] = true
				queue = append(queue, e.TargetURI)
			}
		}
	}

	delete(visited, uri)
	return mapToSlice(visited)
}

// TransitiveDependents returns all URIs reachable by walking reverse edges
// from the given URI (breadth-first). The starting URI is not included.
func (g *WorkspaceGraph) TransitiveDependents(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	visited := map[string]bool{uri: true}
	queue := []string{uri}

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, e := range g.revEdges[current] {
			if !visited[e.SourceURI] {
				visited[e.SourceURI] = true
				queue = append(queue, e.SourceURI)
			}
		}
	}

	delete(visited, uri)
	return mapToSlice(visited)
}

// DetectCycles returns all URIs that participate in reference cycles.
func (g *WorkspaceGraph) DetectCycles() [][]string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	const (
		white = iota
		gray
		black
	)
	color := make(map[string]int)
	var cycles [][]string

	var dfs func(uri string, path []string)
	dfs = func(uri string, path []string) {
		color[uri] = gray
		path = append(path, uri)
		for _, e := range g.edges[uri] {
			target := e.TargetURI
			switch color[target] {
			case white:
				dfs(target, path)
			case gray:
				// Found a cycle: extract it from path
				start := -1
				for i, u := range path {
					if u == target {
						start = i
						break
					}
				}
				if start >= 0 {
					cycle := make([]string, len(path)-start)
					copy(cycle, path[start:])
					cycles = append(cycles, cycle)
				}
			}
		}
		color[uri] = black
	}

	for uri := range g.nodes {
		if color[uri] == white {
			dfs(uri, nil)
		}
	}
	return cycles
}

// StageResult returns the cached result for a pipeline stage, or nil.
func (g *WorkspaceGraph) StageResult(uri string, stage StageName) *StageResult {
	g.mu.RLock()
	defer g.mu.RUnlock()
	node := g.nodes[uri]
	if node == nil {
		return nil
	}
	if node.DirtyStages[stage] {
		return nil
	}
	return node.StageResults[stage]
}

// SetStageResult stores a pipeline stage result for a URI.
func (g *WorkspaceGraph) SetStageResult(uri string, stage StageName, result *StageResult) {
	g.mu.Lock()
	defer g.mu.Unlock()
	node := g.nodes[uri]
	if node == nil {
		return
	}
	node.StageResults[stage] = result
	delete(node.DirtyStages, stage)
}

// ReadOnlyGraph provides a read-only view of the workspace graph for SDK consumers.
type ReadOnlyGraph interface {
	Node(uri string) *GraphNode
	AllNodes() []string
	Roots() []string
	EdgesFrom(uri string) []Edge
	EdgesTo(uri string) []Edge
	Dependents(uri string) []string
	Dependencies(uri string) []string
	TransitiveDependencies(uri string) []string
	TransitiveDependents(uri string) []string
	DetectCycles() [][]string
}

func mapToSlice(m map[string]bool) []string {
	if len(m) == 0 {
		return nil
	}
	s := make([]string, 0, len(m))
	for k := range m {
		s = append(s, k)
	}
	return s
}
