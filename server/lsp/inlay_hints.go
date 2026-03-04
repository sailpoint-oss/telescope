package lsp

import (
	"fmt"
	"sort"
	"strings"

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

		// Composition (allOf/anyOf/oneOf) summary hints on component schemas
		if idx.Document.Components != nil {
			for _, schema := range idx.Document.Components.Schemas {
				if !rangeOverlaps(schema.Loc.Range, params.Range) {
					continue
				}
				if hint := compositionHint(schema, idx); hint != nil {
					hints = append(hints, *hint)
				}
			}
		}

		return hints, nil
	}
}

// compositionHint returns an inlay hint summarizing a schema's composition, or nil.
func compositionHint(schema *openapi.Schema, idx *openapi.Index) *protocol.InlayHint {
	if len(schema.AllOf) > 0 {
		merged := mergeAllOfProperties(schema.AllOf)
		if len(merged.Properties) == 0 {
			return nil
		}
		names := sortedPropertyNames(merged.Properties)
		label := "merged: {" + truncateList(names, 60) + "}"
		return &protocol.InlayHint{
			Position:    schema.Loc.Range.Start,
			Label:       label,
			PaddingRight: true,
			Tooltip: &protocol.MarkupContent{
				Kind:  protocol.PlainText,
				Value: fmt.Sprintf("allOf merges %d properties", len(names)),
			},
		}
	}

	if len(schema.OneOf) > 0 {
		variants := compositionVariantNames(schema.OneOf)
		label := "oneOf: " + strings.Join(variants, " | ")
		if schema.Discriminator != nil && schema.Discriminator.PropertyName != "" {
			label = fmt.Sprintf("discriminator: %s → %s", schema.Discriminator.PropertyName, strings.Join(variants, ", "))
		}
		return &protocol.InlayHint{
			Position:    schema.Loc.Range.Start,
			Label:       label,
			PaddingRight: true,
		}
	}

	if len(schema.AnyOf) > 0 {
		variants := compositionVariantNames(schema.AnyOf)
		label := "anyOf: " + strings.Join(variants, " | ")
		return &protocol.InlayHint{
			Position:    schema.Loc.Range.Start,
			Label:       label,
			PaddingRight: true,
		}
	}

	return nil
}

// compositionVariantNames extracts human-readable names for each variant in a composition.
func compositionVariantNames(schemas []*openapi.Schema) []string {
	var names []string
	for _, s := range schemas {
		if s.Ref != "" {
			names = append(names, refBaseName(s.Ref))
		} else if s.Type != "" {
			names = append(names, s.Type)
		} else {
			names = append(names, "object")
		}
	}
	return names
}

// sortedPropertyNames returns sorted property names from a schema properties map.
func sortedPropertyNames(props map[string]*openapi.Schema) []string {
	names := make([]string, 0, len(props))
	for n := range props {
		names = append(names, n)
	}
	sort.Strings(names)
	return names
}

// truncateList joins names with ", " and truncates to maxLen characters.
func truncateList(names []string, maxLen int) string {
	result := strings.Join(names, ", ")
	if len(result) > maxLen {
		return result[:maxLen-3] + "..."
	}
	return result
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
