package lsp

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewLinkedEditingRangeHandler returns linked editing ranges for $ref target
// strings. When the cursor is on a $ref value, all identical $ref values in the
// document are returned so editing one edits all simultaneously.
func NewLinkedEditingRangeHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.LinkedEditingRangeHandler {
	return func(ctx *gossip.Context, params *protocol.LinkedEditingRangeParams) (*protocol.LinkedEditingRanges, error) {
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
		cleanWord := strings.Trim(word, "\"' ")
		line := doc.LineAt(params.Position.Line)

		// $ref linked editing
		if strings.Contains(line, "$ref") {
			refTarget := extractRefFromLine(line)
			if refTarget != "" {
				usages := idx.RefsTo(refTarget)
				var ranges []protocol.Range
				for _, usage := range usages {
					if usage.URI == uri {
						ranges = append(ranges, adapt.RangeToProtocol(usage.Loc.Range))
					}
				}
				if len(ranges) > 0 {
					return &protocol.LinkedEditingRanges{Ranges: ranges}, nil
				}
			}
		}

		// Tag linked editing
		if _, ok := idx.Tags[cleanWord]; ok {
			var ranges []protocol.Range
			// Root tag definition
			if tag, found := idx.Tags[cleanWord]; found && !isZeroRange(adapt.RangeToProtocol(tag.NameLoc.Range)) {
				ranges = append(ranges, adapt.RangeToProtocol(tag.NameLoc.Range))
			}
			// Operation tag usages in same document
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					if tu, found := mo.Operation.HasTag(cleanWord); found && !isZeroRange(adapt.RangeToProtocol(tu.Loc.Range)) {
						ranges = append(ranges, adapt.RangeToProtocol(tu.Loc.Range))
					}
				}
			}
			if len(ranges) > 1 {
				return &protocol.LinkedEditingRanges{Ranges: ranges}, nil
			}
		}

		// operationId linked editing
		if opRef, ok := idx.Operations[cleanWord]; ok {
			var ranges []protocol.Range
			if !isZeroRange(adapt.RangeToProtocol(opRef.Operation.OperationIDLoc.Range)) {
				ranges = append(ranges, adapt.RangeToProtocol(opRef.Operation.OperationIDLoc.Range))
			}
			// Component-level link operationId references
			if idx.Document.Components != nil {
				for _, link := range idx.Document.Components.Links {
					if link.OperationID == cleanWord && !isZeroRange(adapt.RangeToProtocol(link.OperationIDLoc.Range)) {
						ranges = append(ranges, adapt.RangeToProtocol(link.OperationIDLoc.Range))
					}
				}
			}
			// Inline response link operationId references
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					for _, resp := range mo.Operation.Responses {
						if resp == nil {
							continue
						}
						for _, link := range resp.Links {
							if link.OperationID == cleanWord && !isZeroRange(adapt.RangeToProtocol(link.OperationIDLoc.Range)) {
								ranges = append(ranges, adapt.RangeToProtocol(link.OperationIDLoc.Range))
							}
						}
					}
				}
			}
			if len(ranges) > 1 {
				return &protocol.LinkedEditingRanges{Ranges: ranges}, nil
			}
		}

		return nil, nil
	}
}
