package project

import (
	"fmt"
	"log/slog"
	"os"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// ProjectContext represents a single OpenAPI "project" consisting of a root
// document and all files transitively referenced via $ref. It is analogous to
// a TypeScript Program that includes all source files reachable from the
// tsconfig entry points.
type ProjectContext struct {
	RootURI  string
	Docs     map[string]*openapi.Index
	Graph    *FileGraph
	Resolver *CrossFileResolver
	logger   *slog.Logger
}

// BuildProjectContext creates a ProjectContext starting from a root document
// URI. It reads the root file from disk, builds its index, follows all
// external $refs transitively, and constructs the dependency graph.
//
// The indexCache is consulted first; if the URI is already cached (e.g., from
// an open document), that index is used instead of re-reading from disk.
func BuildProjectContext(rootURI string, indexCache *openapi.IndexCache, logger *slog.Logger) (*ProjectContext, error) {
	norm := openapi.NormalizeURI(rootURI)
	ctx := &ProjectContext{
		RootURI: norm,
		Docs:    make(map[string]*openapi.Index),
		Graph:   NewFileGraph(),
		logger:  logger,
	}

	if err := ctx.loadTransitive(norm, indexCache); err != nil {
		return nil, fmt.Errorf("build project from %s: %w", rootURI, err)
	}

	ctx.Resolver = NewCrossFileResolver(ctx.Docs)
	return ctx, nil
}

// loadTransitive recursively loads a file and all its external $ref targets.
func (p *ProjectContext) loadTransitive(uri string, cache *openapi.IndexCache) error {
	norm := openapi.NormalizeURI(uri)
	if _, loaded := p.Docs[norm]; loaded {
		return nil // already visited
	}

	idx, err := p.loadIndex(uri, cache)
	if err != nil {
		if p.logger != nil {
			p.logger.Warn("skipping unreachable ref target", "uri", uri, "error", err)
		}
		return nil // non-fatal: skip unreachable files
	}

	p.Docs[norm] = idx

	edges := ExtractExternalRefs(uri, idx)
	for _, edge := range edges {
		p.Graph.AddEdge(edge)
	}

	for _, edge := range edges {
		if err := p.loadTransitive(edge.ToURI, cache); err != nil {
			return err
		}
	}

	return nil
}

// loadIndex retrieves the index for a URI, first checking the cache and
// falling back to reading from disk.
func (p *ProjectContext) loadIndex(uri string, cache *openapi.IndexCache) (*openapi.Index, error) {
	if cache != nil {
		if idx := cache.Get(toDocURI(uri)); idx != nil {
			return idx, nil
		}
	}
	return indexFromDisk(uri)
}

// indexFromDisk reads a file from disk and builds an openapi.Index using the
// standalone parser (no tree-sitter dependency).
func indexFromDisk(uri string) (*openapi.Index, error) {
	path := uriToPath(uri)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}

	idx := openapi.ParseAndIndex(data)
	if idx == nil {
		return nil, fmt.Errorf("failed to parse %s", path)
	}

	return idx, nil
}

func toDocURI(uri string) protocol.DocumentURI {
	return protocol.DocumentURI(uri)
}

// RebuildIndex re-indexes a single file within the project, updating the
// graph and resolver. Newly referenced files are loaded transitively.
func (p *ProjectContext) RebuildIndex(uri string, cache *openapi.IndexCache) error {
	idx, err := p.loadIndex(uri, cache)
	if err != nil {
		return err
	}

	norm := openapi.NormalizeURI(uri)
	p.Docs[norm] = idx
	p.Graph.RemoveEdgesFrom(norm)
	edges := ExtractExternalRefs(norm, idx)
	for _, edge := range edges {
		p.Graph.AddEdge(edge)
	}

	// Load any newly referenced files that aren't yet part of this project.
	for _, edge := range edges {
		if _, loaded := p.Docs[edge.ToURI]; !loaded {
			if err := p.loadTransitive(edge.ToURI, cache); err != nil {
				if p.logger != nil {
					p.logger.Warn("failed to load new ref target during rebuild", "uri", edge.ToURI, "error", err)
				}
			}
		}
	}

	p.Resolver = NewCrossFileResolver(p.Docs)
	return nil
}

// ContainsFile reports whether the given URI is part of this project.
// The URI is normalized before lookup to handle encoding differences.
func (p *ProjectContext) ContainsFile(uri string) bool {
	if _, ok := p.Docs[uri]; ok {
		return true
	}
	norm := openapi.NormalizeURI(uri)
	if norm != uri {
		_, ok := p.Docs[norm]
		return ok
	}
	return false
}

// AllURIs returns every file URI in the project.
func (p *ProjectContext) AllURIs() []string {
	uris := make([]string, 0, len(p.Docs))
	for uri := range p.Docs {
		uris = append(uris, uri)
	}
	return uris
}
