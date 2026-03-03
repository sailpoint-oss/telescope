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
	ctx := &ProjectContext{
		RootURI: rootURI,
		Docs:    make(map[string]*openapi.Index),
		Graph:   NewFileGraph(),
		logger:  logger,
	}

	if err := ctx.loadTransitive(rootURI, indexCache); err != nil {
		return nil, fmt.Errorf("build project from %s: %w", rootURI, err)
	}

	ctx.Resolver = NewCrossFileResolver(ctx.Docs)
	return ctx, nil
}

// loadTransitive recursively loads a file and all its external $ref targets.
func (p *ProjectContext) loadTransitive(uri string, cache *openapi.IndexCache) error {
	if _, loaded := p.Docs[uri]; loaded {
		return nil // already visited
	}

	idx, err := p.loadIndex(uri, cache)
	if err != nil {
		if p.logger != nil {
			p.logger.Warn("skipping unreachable ref target", "uri", uri, "error", err)
		}
		return nil // non-fatal: skip unreachable files
	}

	p.Docs[uri] = idx

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

	collectRefsFromContent(idx, data, uri)

	return idx, nil
}

// collectRefsFromContent performs a lightweight scan for $ref values in raw
// YAML/JSON content and populates the index's AllRefs and Refs fields. The
// standalone parser doesn't walk for $ref values, so we do a simple text scan.
func collectRefsFromContent(idx *openapi.Index, data []byte, uri string) {
	content := string(data)
	if idx.Refs == nil {
		idx.Refs = make(map[string][]openapi.RefUsage)
	}

	lines := splitLines(content)
	for _, line := range lines {
		ref := extractRefFromLine(line)
		if ref == "" {
			continue
		}
		usage := openapi.RefUsage{Target: ref}
		idx.Refs[ref] = append(idx.Refs[ref], usage)
		idx.AllRefs = append(idx.AllRefs, usage)
	}
}

func extractRefFromLine(line string) string {
	// YAML: $ref: "./path" or $ref: './path' or $ref: ./path
	if idx := findSubstring(line, "$ref:"); idx >= 0 {
		val := trimLeft(line[idx+5:])
		return unquoteRef(val)
	}
	// JSON: "$ref": "value"
	if idx := findSubstring(line, "\"$ref\""); idx >= 0 {
		rest := line[idx+6:]
		if colon := findSubstring(rest, ":"); colon >= 0 {
			val := trimLeft(rest[colon+1:])
			return unquoteRef(val)
		}
	}
	return ""
}

func unquoteRef(s string) string {
	s = trimLeft(s)
	s = trimRight(s)
	if len(s) == 0 {
		return ""
	}
	if (s[0] == '"' || s[0] == '\'') && len(s) >= 2 {
		quote := s[0]
		end := findByte(s[1:], quote)
		if end >= 0 {
			return s[1 : end+1]
		}
	}
	// Bare value (YAML unquoted)
	end := len(s)
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r' || s[i] == ',' {
			end = i
			break
		}
	}
	return s[:end]
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func findSubstring(s, sub string) int {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

func findByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

func trimLeft(s string) string {
	i := 0
	for i < len(s) && (s[i] == ' ' || s[i] == '\t') {
		i++
	}
	return s[i:]
}

func trimRight(s string) string {
	i := len(s) - 1
	for i >= 0 && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r') {
		i--
	}
	return s[:i+1]
}

func toDocURI(uri string) protocol.DocumentURI {
	return protocol.DocumentURI(uri)
}

// RebuildIndex re-indexes a single file within the project, updating the
// graph and resolver.
func (p *ProjectContext) RebuildIndex(uri string, cache *openapi.IndexCache) error {
	idx, err := p.loadIndex(uri, cache)
	if err != nil {
		return err
	}

	p.Docs[uri] = idx
	p.Graph.RemoveEdgesFrom(uri)
	for _, edge := range ExtractExternalRefs(uri, idx) {
		p.Graph.AddEdge(edge)
	}
	p.Resolver = NewCrossFileResolver(p.Docs)
	return nil
}

// ContainsFile reports whether the given URI is part of this project.
func (p *ProjectContext) ContainsFile(uri string) bool {
	_, ok := p.Docs[uri]
	return ok
}

// AllURIs returns every file URI in the project.
func (p *ProjectContext) AllURIs() []string {
	uris := make([]string, 0, len(p.Docs))
	for uri := range p.Docs {
		uris = append(uris, uri)
	}
	return uris
}
