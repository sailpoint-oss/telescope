package lsp

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewFoldingRangeHandler provides folding ranges based on the OpenAPI structure.
func NewFoldingRangeHandler(cache *openapi.IndexCache) gossip.FoldingRangeHandler {
	return func(ctx *gossip.Context, params *protocol.FoldingRangeParams) ([]protocol.FoldingRange, error) {
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		var ranges []protocol.FoldingRange

		// Info section
		if idx.Document.Info != nil {
			addFold(&ranges, idx.Document.Info.Loc.Range, "region")
		}

		// Servers
		for _, srv := range idx.Document.Servers {
			addFold(&ranges, srv.Loc.Range, "region")
		}

		// Paths and operations
		for _, item := range idx.Document.Paths {
			addFold(&ranges, item.Loc.Range, "region")
			for _, mo := range item.Operations() {
				addFold(&ranges, mo.Operation.Loc.Range, "region")
			}
		}

		// Tags
		for _, tag := range idx.Document.Tags {
			addFold(&ranges, tag.Loc.Range, "region")
		}

		// Components
		if comp := idx.Document.Components; comp != nil {
			addFold(&ranges, comp.Loc.Range, "region")

			for _, schema := range comp.Schemas {
				addFold(&ranges, schema.Loc.Range, "region")
			}
			for _, param := range comp.Parameters {
				addFold(&ranges, param.Loc.Range, "region")
			}
			for _, resp := range comp.Responses {
				addFold(&ranges, resp.Loc.Range, "region")
			}
			for _, rb := range comp.RequestBodies {
				addFold(&ranges, rb.Loc.Range, "region")
			}
			for _, hdr := range comp.Headers {
				addFold(&ranges, hdr.Loc.Range, "region")
			}
			for _, ss := range comp.SecuritySchemes {
				addFold(&ranges, ss.Loc.Range, "region")
			}
			for _, link := range comp.Links {
				addFold(&ranges, link.Loc.Range, "region")
			}
		for _, cb := range comp.Callbacks {
			if cb != nil {
				for _, pi := range *cb {
					if pi != nil {
						addFold(&ranges, pi.Loc.Range, "region")
					}
				}
			}
		}
			for _, ex := range comp.Examples {
				addFold(&ranges, ex.Loc.Range, "region")
			}
		}

		return ranges, nil
	}
}

func addFold(ranges *[]protocol.FoldingRange, r protocol.Range, kind string) {
	if r.Start.Line == r.End.Line {
		return
	}
	*ranges = append(*ranges, protocol.FoldingRange{
		StartLine: r.Start.Line,
		EndLine:   r.End.Line,
		Kind:      kind,
	})
}
