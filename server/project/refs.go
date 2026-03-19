package project

import (
	"strings"

	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// ExtractExternalRefs scans an index's $ref usages and returns RefEdge entries
// for references that point to external files. Local-only refs (#/...) are
// skipped.
func ExtractExternalRefs(sourceURI string, idx *openapi.Index) []RefEdge {
	if idx == nil {
		return nil
	}

	var edges []RefEdge
	for _, ref := range idx.AllRefs {
		target := ref.Target
		if target == "" || strings.HasPrefix(target, "#") {
			continue
		}

		filePart, pointer := navigator.SplitRefURI(target)
		targetURI := navigator.ResolveRelativeURI(sourceURI, filePart)
		if targetURI == "" || targetURI == sourceURI {
			continue
		}
		// Skip remote refs (http/https URLs)
		if strings.HasPrefix(targetURI, "http://") || strings.HasPrefix(targetURI, "https://") {
			continue
		}

		edges = append(edges, RefEdge{
			FromURI:     sourceURI,
			FromPointer: ref.From,
			ToURI:       targetURI,
			ToPointer:   strings.TrimPrefix(pointer, "#"),
			RefValue:    target,
		})
	}

	return edges
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
