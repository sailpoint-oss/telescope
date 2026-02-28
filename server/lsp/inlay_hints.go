package lsp

import (
	"fmt"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

var (
	inlayKindType    = 1
	inlayKindParam   = 2
)

// NewInlayHintHandler provides inline hints for $ref types, required fields,
// deprecated markers, and parameter locations.
func NewInlayHintHandler(cache *openapi.IndexCache) gossip.InlayHintHandler {
	return func(ctx *gossip.Context, params *protocol.InlayHintParams) ([]protocol.InlayHint, error) {
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		var hints []protocol.InlayHint

		// $ref type resolution hints
		for _, ref := range idx.AllRefs {
			r := ref.Loc.Range
			if !rangeOverlaps(r, params.Range) {
				continue
			}
			if target, err := idx.Resolve(ref.Target); err == nil {
				if schema, ok := target.(*openapi.Schema); ok && schema.Type != "" {
					hints = append(hints, protocol.InlayHint{
						Position:    r.End,
						Label:       ": " + schema.Type,
						Kind:        &inlayKindType,
						PaddingLeft: true,
					})
				}
			}
		}

		// Required property markers on schemas
		if idx.Document.Components != nil {
			for _, schema := range idx.Document.Components.Schemas {
				if !rangeOverlaps(schema.Loc.Range, params.Range) {
					continue
				}
				requiredSet := make(map[string]bool, len(schema.Required))
				for _, r := range schema.Required {
					requiredSet[r] = true
				}
				for propName, prop := range schema.Properties {
					if !requiredSet[propName] {
						continue
					}
					if isZeroRange(prop.Loc.Range) {
						continue
					}
					hints = append(hints, protocol.InlayHint{
						Position:     prop.Loc.Range.Start,
						Label:        "*",
						PaddingRight: true,
						Tooltip: &protocol.MarkupContent{
							Kind:  protocol.PlainText,
							Value: fmt.Sprintf("'%s' is required", propName),
						},
					})
				}
			}
		}

		// Deprecated operation markers
		for _, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				if !mo.Operation.Deprecated {
					continue
				}
				opLoc := mo.Operation.Loc.Range
				if !rangeOverlaps(opLoc, params.Range) {
					continue
				}
				hints = append(hints, protocol.InlayHint{
					Position:    opLoc.Start,
					Label:       "deprecated",
					PaddingRight: true,
					Tooltip: &protocol.MarkupContent{
						Kind:  protocol.PlainText,
						Value: "This operation is deprecated",
					},
				})
			}
		}

		// Parameter "in:" hints
		for _, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				for _, p := range mo.Operation.Parameters {
					if p.In == "" || isZeroRange(p.NameLoc.Range) {
						continue
					}
					if !rangeOverlaps(p.NameLoc.Range, params.Range) {
						continue
					}
					hints = append(hints, protocol.InlayHint{
						Position:    p.NameLoc.Range.End,
						Label:       fmt.Sprintf(" in: %s", p.In),
						Kind:        &inlayKindParam,
						PaddingLeft: true,
					})
				}
			}
		}

		return hints, nil
	}
}

func rangeOverlaps(a, b protocol.Range) bool {
	if a.End.Line < b.Start.Line || (a.End.Line == b.Start.Line && a.End.Character < b.Start.Character) {
		return false
	}
	if b.End.Line < a.Start.Line || (b.End.Line == a.Start.Line && b.End.Character < a.Start.Character) {
		return false
	}
	return true
}
