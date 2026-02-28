package lsp

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewLinkedEditingRangeHandler returns linked editing ranges for $ref target
// strings. When the cursor is on a $ref value, all identical $ref values in the
// document are returned so editing one edits all simultaneously.
func NewLinkedEditingRangeHandler(cache *openapi.IndexCache) gossip.LinkedEditingRangeHandler {
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

		line := doc.LineAt(params.Position.Line)
		if !strings.Contains(line, "$ref") {
			return nil, nil
		}

		word := doc.WordAt(params.Position)
		refTarget := strings.Trim(word, "\"' ")
		if refTarget == "" || refTarget == "$ref" {
			refTarget = extractRefFromLine(line)
		}
		if refTarget == "" {
			return nil, nil
		}

		// Collect all ranges of this same ref value in the document
		usages := idx.RefsTo(refTarget)
		if len(usages) == 0 {
			return nil, nil
		}

		var ranges []protocol.Range
		for _, usage := range usages {
			if usage.URI == uri {
				ranges = append(ranges, usage.Loc.Range)
			}
		}

		if len(ranges) == 0 {
			return nil, nil
		}

		return &protocol.LinkedEditingRanges{
			Ranges: ranges,
		}, nil
	}
}
