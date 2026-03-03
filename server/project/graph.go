// Package project implements repo-wide OpenAPI project management: file
// discovery, $ref dependency graphs, cross-file resolution, and project-scoped
// diagnostics. It is modeled after TypeScript's project/program concept where
// root documents (entry points) pull in referenced files transitively.
package project

import (
	"sync"
)

// RefEdge represents a single $ref relationship between two documents.
type RefEdge struct {
	FromURI     string // file containing the $ref
	FromPointer string // JSON pointer within FromURI
	ToURI       string // file being referenced
	ToPointer   string // JSON pointer within ToURI (fragment)
	RefValue    string // raw $ref value as written in the source
}

// FileGraph tracks directed $ref edges between files and maintains both
// forward (deps) and reverse (rdeps) indexes for efficient traversal.
type FileGraph struct {
	mu    sync.RWMutex
	deps  map[string]map[string]bool // uri -> set of uris it references
	rdeps map[string]map[string]bool // uri -> set of uris that reference it
	edges map[string][]RefEdge       // fromURI -> edges originating from that file
}

// NewFileGraph creates an empty file graph.
func NewFileGraph() *FileGraph {
	return &FileGraph{
		deps:  make(map[string]map[string]bool),
		rdeps: make(map[string]map[string]bool),
		edges: make(map[string][]RefEdge),
	}
}

// AddEdge records a $ref relationship. Both the forward and reverse indexes
// are updated atomically.
func (g *FileGraph) AddEdge(edge RefEdge) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.deps[edge.FromURI] == nil {
		g.deps[edge.FromURI] = make(map[string]bool)
	}
	g.deps[edge.FromURI][edge.ToURI] = true

	if g.rdeps[edge.ToURI] == nil {
		g.rdeps[edge.ToURI] = make(map[string]bool)
	}
	g.rdeps[edge.ToURI][edge.FromURI] = true

	g.edges[edge.FromURI] = append(g.edges[edge.FromURI], edge)
}

// RemoveEdgesFrom removes all outgoing edges from the given URI. Call this
// before re-adding edges after a file is re-indexed.
func (g *FileGraph) RemoveEdgesFrom(uri string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	targets := g.deps[uri]
	for target := range targets {
		if rdep := g.rdeps[target]; rdep != nil {
			delete(rdep, uri)
			if len(rdep) == 0 {
				delete(g.rdeps, target)
			}
		}
	}
	delete(g.deps, uri)
	delete(g.edges, uri)
}

// DependenciesOf returns the URIs that the given file references via $ref.
func (g *FileGraph) DependenciesOf(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return setToSlice(g.deps[uri])
}

// DependentsOf returns the URIs of files that reference the given file via $ref.
func (g *FileGraph) DependentsOf(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()
	return setToSlice(g.rdeps[uri])
}

// TransitiveDependentsOf returns all URIs reachable by walking reverse edges
// from the given URI (breadth-first). The starting URI is not included.
func (g *FileGraph) TransitiveDependentsOf(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	visited := make(map[string]bool)
	queue := []string{uri}
	visited[uri] = true

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for dep := range g.rdeps[current] {
			if !visited[dep] {
				visited[dep] = true
				queue = append(queue, dep)
			}
		}
	}

	delete(visited, uri)
	return setToSlice(visited)
}

// TransitiveDependenciesOf returns all URIs reachable by walking forward edges
// from the given URI (breadth-first). The starting URI is not included.
func (g *FileGraph) TransitiveDependenciesOf(uri string) []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	visited := make(map[string]bool)
	queue := []string{uri}
	visited[uri] = true

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for dep := range g.deps[current] {
			if !visited[dep] {
				visited[dep] = true
				queue = append(queue, dep)
			}
		}
	}

	delete(visited, uri)
	return setToSlice(visited)
}

// EdgesFrom returns all ref edges originating from the given URI.
func (g *FileGraph) EdgesFrom(uri string) []RefEdge {
	g.mu.RLock()
	defer g.mu.RUnlock()
	edges := g.edges[uri]
	out := make([]RefEdge, len(edges))
	copy(out, edges)
	return out
}

// AllURIs returns every URI known to the graph (both sources and targets).
func (g *FileGraph) AllURIs() []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	uris := make(map[string]bool)
	for u := range g.deps {
		uris[u] = true
	}
	for u := range g.rdeps {
		uris[u] = true
	}
	return setToSlice(uris)
}

func setToSlice(s map[string]bool) []string {
	if len(s) == 0 {
		return nil
	}
	out := make([]string, 0, len(s))
	for k := range s {
		out = append(out, k)
	}
	return out
}
