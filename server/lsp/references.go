package lsp

import (
	"fmt"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

var allComponentKinds = []string{
	"schemas", "responses", "parameters", "requestBodies",
	"headers", "securitySchemes", "links", "examples",
}

// NewReferencesHandler finds all references to a component, operationId, or tag.
func NewReferencesHandler(cache *openapi.IndexCache, graphBridge *GraphBridge) gossip.ReferencesHandler {
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
		line := doc.LineAt(params.Position.Line)

		var locations []protocol.Location
		seen := make(map[string]struct{})
		addLoc := func(loc protocol.Location) {
			key := string(loc.URI) + "|" +
				fmt.Sprintf("%d:%d-%d:%d", loc.Range.Start.Line, loc.Range.Start.Character, loc.Range.End.Line, loc.Range.End.Character)
			if _, ok := seen[key]; ok {
				return
			}
			seen[key] = struct{}{}
			locations = append(locations, loc)
		}
		allIdx := cache.All()

		// $ref: find all usages of the same ref target across the workspace
		if strings.Contains(line, "$ref") {
			refTarget := extractRefFromLine(line)
			if refTarget != "" {
				// Determine the target URI so we can use the reverse edge index.
				resolvedTargetURI := graphResolveRefTarget(string(uri), refTarget)

				// Graph-accelerated path: use reverse edge index on the target
				// URI to find all documents referencing it in O(dependents).
				if graphBridge != nil && resolvedTargetURI != "" {
					edges := graphBridge.EdgesTo(resolvedTargetURI)
					for _, e := range edges {
						sourceIdx := cache.Get(protocol.DocumentURI(e.SourceURI))
						if sourceIdx == nil {
							continue
						}
						for _, usage := range sourceIdx.RefsTo(e.RefValue) {
							addLoc(protocol.Location{
								URI:   protocol.DocumentURI(e.SourceURI),
								Range: adapt.RangeToProtocol(usage.Loc.Range),
							})
						}
					}
					// Also search local refs in the same document
					targets := []string{refTarget}
					if i := strings.Index(refTarget, "#"); i > 0 {
						targets = append(targets, refTarget[i:])
					}
					for _, target := range targets {
						for _, usage := range idx.RefsTo(target) {
							addLoc(protocol.Location{
								URI:   uri,
								Range: adapt.RangeToProtocol(usage.Loc.Range),
							})
						}
					}
					if len(locations) > 0 {
						return locations, nil
					}
				}

				// Fallback: scan all documents (for when graph isn't populated)
				targets := []string{refTarget}
				if i := strings.Index(refTarget, "#"); i > 0 {
					targets = append(targets, refTarget[i:])
				}
				for docURI, docIdx := range allIdx {
					for _, target := range targets {
						for _, usage := range docIdx.RefsTo(target) {
							addLoc(protocol.Location{
								URI:   docURI,
								Range: adapt.RangeToProtocol(usage.Loc.Range),
							})
						}
					}
				}
				if len(locations) == 1 {
					addLoc(protocol.Location{
						URI: uri,
						Range: protocol.Range{
							Start: protocol.Position{Line: params.Position.Line, Character: params.Position.Character},
							End:   protocol.Position{Line: params.Position.Line, Character: params.Position.Character + 1},
						},
					})
				}
				if len(locations) > 0 {
					return locations, nil
				}
			}
		}

		if word == "" {
			return nil, nil
		}

		// Component references (all kinds, cross-workspace)
		for _, kind := range allComponentKinds {
			for _, name := range idx.ComponentNames(kind) {
				if name != word {
					continue
				}
				refPath := openapi.ComponentRefPath(kind, name)

				defLoc := componentDefinitionLoc(idx, kind, name)
				// Include declaration by default for symbol-style reference queries.
				// This improves consistency across clients that may not set IncludeDeclaration.
				if !isZeroRange(defLoc) {
					addLoc(protocol.Location{
						URI:   uri,
						Range: defLoc,
					})
				}

				for docURI, docIdx := range allIdx {
					for _, usage := range docIdx.RefsTo(refPath) {
						addLoc(protocol.Location{
							URI:   docURI,
							Range: adapt.RangeToProtocol(usage.Loc.Range),
						})
					}
				}
				// Fallback: if graph/index refs are not ready yet (common in just-opened
				// buffers), scan open document text for literal ref occurrences.
				if len(locations) <= 1 {
					for docURI := range allIdx {
						openDoc := ctx.Documents.Get(docURI)
						if openDoc == nil {
							continue
						}
						for lineNum, textLine := range strings.Split(openDoc.Text(), "\n") {
							start := strings.Index(textLine, refPath)
							for start >= 0 {
								addLoc(protocol.Location{
									URI: docURI,
									Range: protocol.Range{
										Start: protocol.Position{Line: uint32(lineNum), Character: uint32(start)},
										End:   protocol.Position{Line: uint32(lineNum), Character: uint32(start + len(refPath))},
									},
								})
								nextFrom := start + len(refPath)
								if nextFrom >= len(textLine) {
									break
								}
								offset := strings.Index(textLine[nextFrom:], refPath)
								if offset < 0 {
									break
								}
								start = nextFrom + offset
							}
						}
					}
				}
				if len(locations) > 0 {
					return locations, nil
				}
			}
		}

		// Fallback for freshly-created docs where component indexing can lag:
		// treat the current word as a schema key and search for local/remote refs.
		if len(locations) == 0 {
			refPath := openapi.ComponentRefPath("schemas", word)
			for docURI := range allIdx {
				openDoc := ctx.Documents.Get(docURI)
				if openDoc == nil {
					continue
				}
				for lineNum, textLine := range strings.Split(openDoc.Text(), "\n") {
					start := strings.Index(textLine, refPath)
					for start >= 0 {
						addLoc(protocol.Location{
							URI: docURI,
							Range: protocol.Range{
								Start: protocol.Position{Line: uint32(lineNum), Character: uint32(start)},
								End:   protocol.Position{Line: uint32(lineNum), Character: uint32(start + len(refPath))},
							},
						})
						nextFrom := start + len(refPath)
						if nextFrom >= len(textLine) {
							break
						}
						offset := strings.Index(textLine[nextFrom:], refPath)
						if offset < 0 {
							break
						}
						start = nextFrom + offset
					}
				}
			}
			if strings.Contains(strings.TrimSpace(line), word+":") {
				addLoc(protocol.Location{
					URI: uri,
					Range: protocol.Range{
						Start: protocol.Position{Line: params.Position.Line, Character: params.Position.Character},
						End:   protocol.Position{Line: params.Position.Line, Character: params.Position.Character},
					},
				})
			}
			if len(locations) == 1 {
				addLoc(protocol.Location{
					URI: uri,
					Range: protocol.Range{
						Start: protocol.Position{Line: params.Position.Line, Character: params.Position.Character},
						End:   protocol.Position{Line: params.Position.Line, Character: params.Position.Character + 1},
					},
				})
			}
			if len(locations) > 0 {
				return locations, nil
			}
		}

		// operationId references (cross-workspace)
		if _, ok := idx.Operations[word]; ok {
			if params.Context.IncludeDeclaration {
				if opRef, ok := idx.Operations[word]; ok {
					addLoc(protocol.Location{
						URI:   uri,
						Range: adapt.RangeToProtocol(opRef.Operation.OperationIDLoc.Range),
					})
				}
			}
			for docURI, docIdx := range allIdx {
				for _, item := range docIdx.Document.Paths {
					for _, mo := range item.Operations() {
						for _, link := range mo.Operation.Responses {
							if link == nil {
								continue
							}
							for _, l := range link.Links {
								if l.OperationID == word && !isZeroRange(adapt.RangeToProtocol(l.Loc.Range)) {
									addLoc(protocol.Location{
										URI:   docURI,
										Range: adapt.RangeToProtocol(l.Loc.Range),
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
				if tag, ok := idx.Tags[word]; ok && !isZeroRange(adapt.RangeToProtocol(tag.NameLoc.Range)) {
					addLoc(protocol.Location{
						URI:   uri,
						Range: adapt.RangeToProtocol(tag.NameLoc.Range),
					})
				}
			}
			for docURI, docIdx := range allIdx {
				for _, item := range docIdx.Document.Paths {
					for _, mo := range item.Operations() {
						if tu, ok := mo.Operation.HasTag(word); ok && tu.Loc.Node != nil {
							addLoc(protocol.Location{
								URI:   docURI,
								Range: adapt.RangeToProtocol(tu.Loc.Range),
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
