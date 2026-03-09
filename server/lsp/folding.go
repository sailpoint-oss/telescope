package lsp

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewFoldingRangeHandler provides folding ranges based on the OpenAPI structure.
func NewFoldingRangeHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.FoldingRangeHandler {
	return func(ctx *gossip.Context, params *protocol.FoldingRangeParams) ([]protocol.FoldingRange, error) {
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		var ranges []protocol.FoldingRange

		// Info section
		if idx.Document.Info != nil {
			addFold(&ranges, adapt.RangeToProtocol(idx.Document.Info.Loc.Range), "region")
		}

		// Servers
		for _, srv := range idx.Document.Servers {
			addFold(&ranges, adapt.RangeToProtocol(srv.Loc.Range), "region")
		}

		// Paths and operations
		for _, item := range idx.Document.Paths {
			addFold(&ranges, adapt.RangeToProtocol(item.Loc.Range), "region")
			for _, mo := range item.Operations() {
				addFold(&ranges, adapt.RangeToProtocol(mo.Operation.Loc.Range), "region")
			}
		}

		// Tags
		for _, tag := range idx.Document.Tags {
			addFold(&ranges, adapt.RangeToProtocol(tag.Loc.Range), "region")
		}

		// Components
		if comp := idx.Document.Components; comp != nil {
			addFold(&ranges, adapt.RangeToProtocol(comp.Loc.Range), "region")

			for _, schema := range comp.Schemas {
				addFold(&ranges, adapt.RangeToProtocol(schema.Loc.Range), "region")
			}
			for _, param := range comp.Parameters {
				addFold(&ranges, adapt.RangeToProtocol(param.Loc.Range), "region")
			}
			for _, resp := range comp.Responses {
				addFold(&ranges, adapt.RangeToProtocol(resp.Loc.Range), "region")
			}
			for _, rb := range comp.RequestBodies {
				addFold(&ranges, adapt.RangeToProtocol(rb.Loc.Range), "region")
			}
			for _, hdr := range comp.Headers {
				addFold(&ranges, adapt.RangeToProtocol(hdr.Loc.Range), "region")
			}
			for _, ss := range comp.SecuritySchemes {
				addFold(&ranges, adapt.RangeToProtocol(ss.Loc.Range), "region")
			}
			for _, link := range comp.Links {
				addFold(&ranges, adapt.RangeToProtocol(link.Loc.Range), "region")
			}
			for _, cb := range comp.Callbacks {
				if cb != nil {
					for _, pi := range *cb {
						if pi != nil {
							addFold(&ranges, adapt.RangeToProtocol(pi.Loc.Range), "region")
						}
					}
				}
			}
			for _, ex := range comp.Examples {
				addFold(&ranges, adapt.RangeToProtocol(ex.Loc.Range), "region")
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
