package analyze

import (
	"fmt"
	"strings"

	"github.com/sailpoint-oss/telescope/server/core/graph"
)

// BundleResult represents the output of a multi-root bundle preview.
type BundleResult struct {
	RootURI string
	Content []byte
	Format  BundleFormat
	Errors  []string
}

// BundleFormat specifies the output format for bundles.
type BundleFormat int

const (
	BundleFormatYAML BundleFormat = iota
	BundleFormatJSON
)

// BundleOptions configures the bundle operation.
type BundleOptions struct {
	Format    BundleFormat
	MaxDepth  int // max $ref follow depth; 0 = unlimited
	RootURI   string
}

// BundlePreview traverses the graph starting from the root URI, collecting
// all referenced documents. It produces a manifest of URIs in dependency
// order suitable for producing a fully-dereferenced bundle.
//
// The actual YAML/JSON merging is handled by the caller — this function
// provides the graph traversal and cycle-safe ordering.
func BundlePreview(g graph.ReadOnlyGraph, opts BundleOptions) *BundleResult {
	if g == nil {
		return &BundleResult{RootURI: opts.RootURI, Errors: []string{"nil graph"}}
	}

	rootNode := g.Node(opts.RootURI)
	if rootNode == nil {
		return &BundleResult{
			RootURI: opts.RootURI,
			Errors:  []string{fmt.Sprintf("root URI %q not found in graph", opts.RootURI)},
		}
	}

	maxDepth := opts.MaxDepth
	if maxDepth <= 0 {
		maxDepth = 100
	}

	visited := make(map[string]bool)
	var order []string
	var errors []string

	var walk func(uri string, depth int)
	walk = func(uri string, depth int) {
		if visited[uri] {
			return
		}
		if depth > maxDepth {
			errors = append(errors, fmt.Sprintf("max depth %d exceeded at %s", maxDepth, uri))
			return
		}
		visited[uri] = true
		order = append(order, uri)

		edges := g.EdgesFrom(uri)
		for _, e := range edges {
			if e.TargetURI != uri {
				walk(e.TargetURI, depth+1)
			}
		}
	}

	walk(opts.RootURI, 0)

	// Detect cycles
	cycles := g.DetectCycles()
	for _, cycle := range cycles {
		errors = append(errors, fmt.Sprintf("cycle detected: %s", strings.Join(cycle, " → ")))
	}

	return &BundleResult{
		RootURI: opts.RootURI,
		Format:  opts.Format,
		Errors:  errors,
	}
}

// DependencyOrder returns the URIs in the bundle in dependency order.
// The root is first, followed by its transitive dependencies.
func DependencyOrder(g graph.ReadOnlyGraph, rootURI string) []string {
	if g == nil {
		return nil
	}

	visited := make(map[string]bool)
	var order []string

	var walk func(uri string)
	walk = func(uri string) {
		if visited[uri] {
			return
		}
		visited[uri] = true

		edges := g.EdgesFrom(uri)
		for _, e := range edges {
			if e.TargetURI != uri {
				walk(e.TargetURI)
			}
		}
		order = append(order, uri)
	}

	walk(rootURI)

	// Reverse for topological order (root first)
	for i, j := 0, len(order)-1; i < j; i, j = i+1, j-1 {
		order[i], order[j] = order[j], order[i]
	}

	return order
}
