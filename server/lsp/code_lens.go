package lsp

import (
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewCodeLensHandler provides reference counts on components, file header info,
// required-field previews, and operation summaries.
func NewCodeLensHandler(cache *openapi.IndexCache, graphBridge *GraphBridge) gossip.CodeLensHandler {
	return func(ctx *gossip.Context, params *protocol.CodeLensParams) ([]protocol.CodeLens, error) {
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		var lenses []protocol.CodeLens

		// File header: document type + version
		versionStr := idx.Document.Version
		if versionStr == "" {
			versionStr = "unknown"
		}
		docType := "OpenAPI"
		if idx.Version == openapi.Version20 {
			docType = "Swagger"
		}
		lenses = append(lenses, protocol.CodeLens{
			Range: protocol.Range{
				Start: protocol.Position{Line: 0, Character: 0},
				End:   protocol.Position{Line: 0, Character: 0},
			},
			Command: &protocol.Command{
				Title: fmt.Sprintf("%s %s", docType, versionStr),
			},
		})

		// API Health Score lens
		if idx.Document.DocType == openapi.DocTypeRoot {
			score := computeHealthScore(idx)
			lenses = append(lenses, protocol.CodeLens{
				Range: protocol.Range{
					Start: protocol.Position{Line: 0, Character: 0},
					End:   protocol.Position{Line: 0, Character: 0},
				},
				Command: &protocol.Command{
					Title: formatHealthSummary(score),
				},
			})
		}

		// Component schemas
		uri := params.TextDocument.URI
		if idx.Document.Components != nil {
			for name, schema := range idx.Document.Components.Schemas {
				refPath := openapi.ComponentRefPath("schemas", name)
				refs := idx.RefsTo(refPath)
				count := len(refs)

				refLocations := make([]protocol.Location, len(refs))
				for i, ref := range refs {
					refLocations[i] = protocol.Location{URI: uri, Range: adapt.RangeToProtocol(ref.Loc.Range)}
				}

				// Cross-file references: use graph reverse edges when available
				if graphBridge != nil {
					for _, e := range graphBridge.EdgesTo(string(uri)) {
						if e.TargetPointer == "/components/schemas/"+name {
							sourceIdx := cache.Get(protocol.DocumentURI(e.SourceURI))
							if sourceIdx == nil {
								continue
							}
							for _, ref := range sourceIdx.RefsTo(e.RefValue) {
								refLocations = append(refLocations, protocol.Location{URI: protocol.DocumentURI(e.SourceURI), Range: adapt.RangeToProtocol(ref.Loc.Range)})
								count++
							}
						}
					}
				} else {
					allIndexes := cache.All()
					for otherURI, otherIdx := range allIndexes {
						if otherURI == uri {
							continue
						}
						for _, ref := range otherIdx.AllRefs {
							if ref.Target == refPath {
								refLocations = append(refLocations, protocol.Location{URI: otherURI, Range: adapt.RangeToProtocol(ref.Loc.Range)})
								count++
							}
						}
					}
				}

				schemaRange := adapt.RangeToProtocol(schema.NameLoc.Range)
				lenses = append(lenses, protocol.CodeLens{
					Range: schemaRange,
					Command: &protocol.Command{
						Title:   fmt.Sprintf("%d references", count),
						Command: "telescope.showReferences",
						Arguments: []interface{}{
							map[string]interface{}{
								"uri":       string(uri),
								"position":  schemaRange.Start,
								"locations": refLocations,
							},
						},
					},
				})

				// Required fields preview
				if len(schema.Required) > 0 {
					preview := strings.Join(schema.Required, ", ")
					if len(preview) > 80 {
						preview = preview[:77] + "..."
					}
					lenses = append(lenses, protocol.CodeLens{
						Range: schemaRange,
						Command: &protocol.Command{
							Title: fmt.Sprintf("required: %s", preview),
						},
					})
				}
			}
		}

		// Fragment file lenses: show what references this fragment from other files
		if idx.Document.DocType == openapi.DocTypeFragment || idx.Document.DocType == openapi.DocTypeUnknown {
			var refFiles []string
			refCount := 0

			if graphBridge != nil {
				// Graph-accelerated: use reverse edge index
				edges := graphBridge.EdgesTo(string(uri))
				seen := make(map[string]bool)
				for _, e := range edges {
					refCount++
					fname := uriToFilename(e.SourceURI)
					if !seen[fname] {
						seen[fname] = true
						refFiles = append(refFiles, fname)
					}
				}
			} else {
				allIndexes := cache.All()
				for otherURI, otherIdx := range allIndexes {
					if otherURI == uri {
						continue
					}
					for _, ref := range otherIdx.AllRefs {
						if strings.Contains(ref.Target, uriToFilename(string(uri))) {
							refCount++
							fname := uriToFilename(string(otherURI))
							found := false
							for _, f := range refFiles {
								if f == fname {
									found = true
									break
								}
							}
							if !found {
								refFiles = append(refFiles, fname)
							}
						}
					}
				}
			}
			if refCount > 0 {
				title := fmt.Sprintf("Referenced by: %s (%d references)", strings.Join(refFiles, ", "), refCount)
				lenses = append(lenses, protocol.CodeLens{
					Range: protocol.Range{
						Start: protocol.Position{Line: 0, Character: 0},
						End:   protocol.Position{Line: 0, Character: 0},
					},
					Command: &protocol.Command{Title: title},
				})
			}
		}

		// Operations with richer summaries
		for _, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				op := mo.Operation

				// Response summary
				var responseParts []string
				if len(op.Responses) > 0 {
					codes := sortedKeys(op.Responses)
					for _, code := range codes {
						responseParts = append(responseParts, code)
					}
				}

				// Params summary
				var paramParts []string
				for _, p := range op.Parameters {
					paramParts = append(paramParts, fmt.Sprintf("%s: %s", p.In, p.Name))
				}

				// Security summary
				var secParts []string
				for _, req := range op.Security {
					secParts = append(secParts, req.SchemeNames()...)
				}

				// Build the main title
				title := strings.ToUpper(mo.Method)
				if op.Summary != "" {
					title += " " + op.Summary
				}

				lenses = append(lenses, protocol.CodeLens{
					Range:   adapt.RangeToProtocol(op.Loc.Range),
					Command: &protocol.Command{Title: title},
				})

				// Response codes
				if len(responseParts) > 0 {
					lenses = append(lenses, protocol.CodeLens{
						Range:   adapt.RangeToProtocol(op.Loc.Range),
						Command: &protocol.Command{Title: fmt.Sprintf("responses: %s", strings.Join(responseParts, ", "))},
					})
				}

				// Parameters
				if len(paramParts) > 0 {
					lenses = append(lenses, protocol.CodeLens{
						Range:   adapt.RangeToProtocol(op.Loc.Range),
						Command: &protocol.Command{Title: fmt.Sprintf("params: %s", strings.Join(paramParts, ", "))},
					})
				}

				// Security
				if len(secParts) > 0 {
					lenses = append(lenses, protocol.CodeLens{
						Range:   adapt.RangeToProtocol(op.Loc.Range),
						Command: &protocol.Command{Title: fmt.Sprintf("security: %s", strings.Join(secParts, ", "))},
					})
				}
			}
		}

		// Bundle preview lens for root documents with cross-file references
		if idx.Document.DocType == openapi.DocTypeRoot && graphBridge != nil {
			deps := graphBridge.Dependencies(string(params.TextDocument.URI))
			if len(deps) > 0 {
				lenses = append(lenses, protocol.CodeLens{
					Range: protocol.Range{
						Start: protocol.Position{Line: 0, Character: 0},
						End:   protocol.Position{Line: 0, Character: 0},
					},
					Command: &protocol.Command{
						Title:     fmt.Sprintf("Bundle: %d files", len(deps)+1),
						Command:   "telescope.bundlePreview",
						Arguments: []any{string(params.TextDocument.URI)},
					},
				})
			}
		}

		return lenses, nil
	}
}

func sortedKeys(m map[string]*openapi.Response) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// uriToFilename extracts just the filename from a file URI or path.
func uriToFilename(uri string) string {
	path := strings.TrimPrefix(uri, "file://")
	return filepath.Base(path)
}
