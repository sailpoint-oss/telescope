package analyze

import (
	"fmt"
	"strings"

	"github.com/sailpoint-oss/telescope/server/core/graph"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// UnusedResult represents the result of dead component analysis.
type UnusedResult struct {
	URI       string
	Component string // e.g. "schemas/Pet", "responses/NotFound"
	Kind      string // e.g. "schemas", "responses"
	Name      string
	Range     ctypes.Range
}

// ComponentEntry represents a single component definition in a document.
type ComponentEntry struct {
	Kind       string // "schemas", "responses", "parameters", etc.
	Name       string
	Range      ctypes.Range
	Suppressed bool // true if x-telescope-ignore: unused is present
}

// FindUnusedComponents walks the graph's reverse edge index to detect
// components with zero inbound references from outside the components/ section.
// Returns a list of unreferenced components with their locations.
func FindUnusedComponents(g *graph.WorkspaceGraph, componentMap map[string][]ComponentEntry) []UnusedResult {
	var unused []UnusedResult

	for uri, entries := range componentMap {
		for _, entry := range entries {
			pointer := "/components/" + entry.Kind + "/" + entry.Name
			referenced := false

			// Check reverse edges: any edge pointing to this URI with a matching
			// target pointer indicates a reference to this component.
			edges := g.EdgesTo(uri)
			for _, e := range edges {
				if e.TargetPointer == pointer {
					// Only count references from outside components/ as "real" usage.
					// Self-referencing within components/ (e.g. allOf composition)
					// doesn't count as external usage.
					if !strings.HasPrefix(e.SourcePointer, "/components/") {
						referenced = true
						break
					}
					// Cross-file references always count
					if e.SourceURI != uri {
						referenced = true
						break
					}
				}
			}

			// Also check local edges within the same document
			localEdges := g.EdgesFrom(uri)
			for _, e := range localEdges {
				if e.SourceURI == uri && e.TargetURI == uri && e.TargetPointer == pointer {
					if !strings.HasPrefix(e.SourcePointer, "/components/") {
						referenced = true
						break
					}
				}
			}

			if !referenced && !entry.Suppressed {
				unused = append(unused, UnusedResult{
					URI:       uri,
					Component: entry.Kind + "/" + entry.Name,
					Kind:      entry.Kind,
					Name:      entry.Name,
					Range:     entry.Range,
				})
			}
		}
	}

	return unused
}

// UnusedToDiagnostics converts unused component results to diagnostics.
func UnusedToDiagnostics(unused []UnusedResult) map[string][]ctypes.Diagnostic {
	result := make(map[string][]ctypes.Diagnostic)
	for _, u := range unused {
		d := ctypes.Diagnostic{
			Range:    u.Range,
			Severity: ctypes.SeverityInfo,
			Source:   "telescope",
			Code:     "unused-component",
			Message:  fmt.Sprintf("Component '%s' is defined but never referenced", u.Name),
			Tags:     []ctypes.DiagnosticTag{ctypes.DiagnosticTagUnnecessary},
		}
		result[u.URI] = append(result[u.URI], d)
	}
	return result
}
