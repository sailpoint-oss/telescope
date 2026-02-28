package lsp

import (
	"fmt"
	"sort"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewCodeLensHandler provides reference counts on components, file header info,
// required-field previews, and operation summaries.
func NewCodeLensHandler(cache *openapi.IndexCache) gossip.CodeLensHandler {
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

		// Component schemas
		uri := params.TextDocument.URI
		if idx.Document.Components != nil {
			for name, schema := range idx.Document.Components.Schemas {
				refPath := openapi.ComponentRefPath("schemas", name)
				refs := idx.RefsTo(refPath)
				count := len(refs)

				refLocations := make([]protocol.Location, len(refs))
				for i, ref := range refs {
					refLocations[i] = protocol.Location{URI: uri, Range: ref.Loc.Range}
				}

				lenses = append(lenses, protocol.CodeLens{
					Range: schema.NameLoc.Range,
					Command: &protocol.Command{
						Title:   fmt.Sprintf("%d references", count),
						Command: "editor.action.showReferences",
						Arguments: []interface{}{
							string(uri),
							schema.NameLoc.Range.Start,
							refLocations,
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
						Range: schema.NameLoc.Range,
						Command: &protocol.Command{
							Title: fmt.Sprintf("required: %s", preview),
						},
					})
				}
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
					Range:   op.Loc.Range,
					Command: &protocol.Command{Title: title},
				})

				// Response codes
				if len(responseParts) > 0 {
					lenses = append(lenses, protocol.CodeLens{
						Range:   op.Loc.Range,
						Command: &protocol.Command{Title: fmt.Sprintf("responses: %s", strings.Join(responseParts, ", "))},
					})
				}

				// Parameters
				if len(paramParts) > 0 {
					lenses = append(lenses, protocol.CodeLens{
						Range:   op.Loc.Range,
						Command: &protocol.Command{Title: fmt.Sprintf("params: %s", strings.Join(paramParts, ", "))},
					})
				}

				// Security
				if len(secParts) > 0 {
					lenses = append(lenses, protocol.CodeLens{
						Range:   op.Loc.Range,
						Command: &protocol.Command{Title: fmt.Sprintf("security: %s", strings.Join(secParts, ", "))},
					})
				}
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
