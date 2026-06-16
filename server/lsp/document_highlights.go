package lsp

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

const (
	highlightText  = 1
	highlightRead  = 2
	highlightWrite = 3
)

// NewDocumentHighlightHandler highlights all occurrences of a $ref target,
// operationId, tag, or component name within the current document.
func NewDocumentHighlightHandler(cache *openapi.IndexCache, graphBridge *GraphBridge) gossip.DocumentHighlightHandler {
	return func(ctx *gossip.Context, params *protocol.DocumentHighlightParams) ([]protocol.DocumentHighlight, error) {
		uri := params.TextDocument.URI
		if !handlerTargetGate(ctx, graphBridge, cache, uri) {
			return nil, nil
		}
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

		cleanWord := strings.Trim(word, "\"' ")
		var highlights []protocol.DocumentHighlight

		// $ref target: highlight all refs pointing to the same target in this doc
		line := doc.LineAt(params.Position.Line)
		if strings.Contains(line, "$ref") {
			refTarget := extractRefFromLine(line)
			if refTarget != "" {
				for _, usage := range idx.RefsTo(refTarget) {
					if usage.URI == uri {
						highlights = append(highlights, protocol.DocumentHighlight{
							Range: adapt.RangeToProtocol(usage.Loc.Range),
							Kind:  highlightRead,
						})
					}
				}
				if len(highlights) > 0 {
					return highlights, nil
				}
			}
		}

		// Component name: highlight definition + all refs in document
		for _, kind := range componentKinds {
			for _, name := range idx.ComponentNames(kind) {
				if name == cleanWord {
					// Definition
					defLoc := componentDefinitionLoc(idx, kind, name)
					if !isZeroRange(defLoc) {
						highlights = append(highlights, protocol.DocumentHighlight{
							Range: defLoc,
							Kind:  highlightWrite,
						})
					}
					// Refs in this document
					refPath := openapi.ComponentRefPath(kind, name)
					for _, usage := range idx.RefsTo(refPath) {
						if usage.URI == uri {
							highlights = append(highlights, protocol.DocumentHighlight{
								Range: adapt.RangeToProtocol(usage.Loc.Range),
								Kind:  highlightRead,
							})
						}
					}
					if len(highlights) > 0 {
						return highlights, nil
					}
				}
			}
		}

		// operationId: highlight all matching operationIds
		if _, ok := idx.Operations[cleanWord]; ok {
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					if mo.Operation.OperationID == cleanWord && !isZeroRange(adapt.RangeToProtocol(mo.Operation.OperationIDLoc.Range)) {
						highlights = append(highlights, protocol.DocumentHighlight{
							Range: adapt.RangeToProtocol(mo.Operation.OperationIDLoc.Range),
							Kind:  highlightText,
						})
					}
				}
			}
			if len(highlights) > 0 {
				return highlights, nil
			}
		}

		// Tag: highlight all matching tag values in document
		if _, ok := idx.Tags[cleanWord]; ok {
			// Root tag definition
			for i := range idx.Document.Tags {
				tag := &idx.Document.Tags[i]
				if tag.Name == cleanWord {
					highlights = append(highlights, protocol.DocumentHighlight{
						Range: adapt.RangeToProtocol(tag.NameLoc.Range),
						Kind:  highlightWrite,
					})
				}
			}
			// Operation tag usages
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					if tu, ok := mo.Operation.HasTag(cleanWord); ok && tu.Loc.Node != nil {
						highlights = append(highlights, protocol.DocumentHighlight{
							Range: adapt.RangeToProtocol(tu.Loc.Range),
							Kind:  highlightRead,
						})
					}
				}
			}
			if len(highlights) > 0 {
				return highlights, nil
			}
		}

		// Security scheme: highlight definition + all usages in security arrays
		if ss, ok := idx.SecuritySchemes[cleanWord]; ok {
			if !isZeroRange(adapt.RangeToProtocol(ss.Loc.Range)) {
				highlights = append(highlights, protocol.DocumentHighlight{
					Range: adapt.RangeToProtocol(ss.Loc.Range),
					Kind:  highlightWrite,
				})
			}
			// Root-level security usages
			for _, req := range idx.Document.Security {
				if entry, ok := req.HasScheme(cleanWord); ok && entry.NameLoc.Node != nil {
					highlights = append(highlights, protocol.DocumentHighlight{
						Range: adapt.RangeToProtocol(entry.NameLoc.Range),
						Kind:  highlightRead,
					})
				}
			}
			// Operation-level security usages
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					for _, req := range mo.Operation.Security {
						if entry, ok := req.HasScheme(cleanWord); ok && entry.NameLoc.Node != nil {
							highlights = append(highlights, protocol.DocumentHighlight{
								Range: adapt.RangeToProtocol(entry.NameLoc.Range),
								Kind:  highlightRead,
							})
						}
					}
				}
			}
			if len(highlights) > 0 {
				return highlights, nil
			}
		}

		return nil, nil
	}
}
