package project

import (
	"net/url"
	"path/filepath"
	"strings"

	"github.com/sailpoint-oss/telescope/server/openapi"
)

// ExtractExternalRefs scans an index's $ref usages and returns RefEdge entries
// for references that point to external files. Local-only refs (#/...) are
// skipped. The sourceURI should be the file:// URI of the document the index
// was built from.
func ExtractExternalRefs(sourceURI string, idx *openapi.Index) []RefEdge {
	if idx == nil {
		return nil
	}

	var edges []RefEdge
	for _, ref := range idx.AllRefs {
		target := ref.Target
		if target == "" || strings.HasPrefix(target, "#") {
			continue // local ref
		}

		parts := strings.SplitN(target, "#", 2)
		filePart := parts[0]
		fragment := ""
		if len(parts) == 2 {
			fragment = parts[1]
		}

		targetURI := resolveRelativeURI(sourceURI, filePart)
		if targetURI == "" {
			continue
		}

		edges = append(edges, RefEdge{
			FromURI:     sourceURI,
			FromPointer: ref.From,
			ToURI:       targetURI,
			ToPointer:   fragment,
			RefValue:    target,
		})
	}

	return edges
}

// resolveRelativeURI resolves a relative file path against a base file:// URI,
// returning the resolved file:// URI. Returns empty string on failure.
func resolveRelativeURI(baseURI, relPath string) string {
	if relPath == "" {
		return ""
	}

	if strings.HasPrefix(relPath, "http://") || strings.HasPrefix(relPath, "https://") {
		return "" // remote refs are not local files
	}

	u, err := url.Parse(baseURI)
	if err != nil || u.Scheme != "file" {
		return ""
	}

	baseDir := filepath.Dir(u.Path)
	resolved := filepath.Clean(filepath.Join(baseDir, relPath))

	target := &url.URL{Scheme: "file", Path: filepath.Clean(resolved)}
	return target.String()
}

// UpdateGraphFromIndex clears old edges for sourceURI and adds new ones
// derived from the index's external $ref usages.
func UpdateGraphFromIndex(g *FileGraph, sourceURI string, idx *openapi.Index) {
	g.RemoveEdgesFrom(sourceURI)
	for _, edge := range ExtractExternalRefs(sourceURI, idx) {
		g.AddEdge(edge)
	}
}

// CollectExternalRefTargets returns the set of unique target URIs referenced
// by external $refs in the given index.
func CollectExternalRefTargets(sourceURI string, idx *openapi.Index) []string {
	seen := make(map[string]bool)
	var targets []string
	for _, edge := range ExtractExternalRefs(sourceURI, idx) {
		if !seen[edge.ToURI] {
			seen[edge.ToURI] = true
			targets = append(targets, edge.ToURI)
		}
	}
	return targets
}
