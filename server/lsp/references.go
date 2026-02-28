package lsp

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

var allComponentKinds = []string{
	"schemas", "responses", "parameters", "requestBodies",
	"headers", "securitySchemes", "links", "examples",
}

// NewReferencesHandler finds all references to a component, operationId, or tag.
func NewReferencesHandler(cache *openapi.IndexCache) gossip.ReferencesHandler {
	return func(ctx *gossip.Context, params *protocol.ReferenceParams) ([]protocol.Location, error) {
		uri := params.TextDocument.URI
		idx := cache.Get(uri)
		if idx == nil {
			return nil, nil
		}

		doc := ctx.Documents.Get(uri)
		if doc == nil {
			return nil, nil
		}

		word := doc.WordAt(params.Position)
		if word == "" {
			return nil, nil
		}

		var locations []protocol.Location

		// Component references (all kinds, cross-workspace)
		for _, kind := range allComponentKinds {
			for _, name := range idx.ComponentNames(kind) {
				if name != word {
					continue
				}
				refPath := openapi.ComponentRefPath(kind, name)

				if params.Context.IncludeDeclaration {
					defLoc := componentDefinitionLoc(idx, kind, name)
					if !isZeroRange(defLoc) {
						locations = append(locations, protocol.Location{
							URI:   uri,
							Range: defLoc,
						})
					}
				}

				for docURI, docIdx := range cache.All() {
					for _, usage := range docIdx.RefsTo(refPath) {
						locations = append(locations, protocol.Location{
							URI:   docURI,
							Range: usage.Loc.Range,
						})
					}
				}
				if len(locations) > 0 {
					return locations, nil
				}
			}
		}

		// operationId references (cross-workspace)
		if _, ok := idx.Operations[word]; ok {
			if params.Context.IncludeDeclaration {
				if opRef, ok := idx.Operations[word]; ok {
					locations = append(locations, protocol.Location{
						URI:   uri,
						Range: opRef.Operation.OperationIDLoc.Range,
					})
				}
			}
			for docURI, docIdx := range cache.All() {
				for _, item := range docIdx.Document.Paths {
					for _, mo := range item.Operations() {
						for _, link := range mo.Operation.Responses {
							if link == nil {
								continue
							}
							for _, l := range link.Links {
								if l.OperationID == word && !isZeroRange(l.Loc.Range) {
									locations = append(locations, protocol.Location{
										URI:   docURI,
										Range: l.Loc.Range,
									})
								}
							}
						}
					}
				}
			}
			if len(locations) > 0 {
				return locations, nil
			}
		}

		// Tag references (cross-workspace)
		if _, ok := idx.Tags[word]; ok {
			if params.Context.IncludeDeclaration {
				if tag, ok := idx.Tags[word]; ok && !isZeroRange(tag.NameLoc.Range) {
					locations = append(locations, protocol.Location{
						URI:   uri,
						Range: tag.NameLoc.Range,
					})
				}
			}
		for docURI, docIdx := range cache.All() {
			for _, item := range docIdx.Document.Paths {
				for _, mo := range item.Operations() {
					if tu, ok := mo.Operation.HasTag(word); ok && tu.Loc.Node != nil {
						locations = append(locations, protocol.Location{
							URI:   docURI,
							Range: tu.Loc.Range,
						})
					}
				}
			}
		}
			if len(locations) > 0 {
				return locations, nil
			}
		}

		return locations, nil
	}
}
