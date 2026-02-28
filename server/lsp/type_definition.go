package lsp

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewTypeDefinitionHandler resolves the type (schema) of the element at the
// cursor. For $ref targets it jumps to the resolved schema. For parameters and
// response content it navigates to the underlying schema definition.
func NewTypeDefinitionHandler(cache *openapi.IndexCache) gossip.TypeDefinitionHandler {
	return func(ctx *gossip.Context, params *protocol.TypeDefinitionParams) ([]protocol.Location, error) {
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
		word := doc.WordAt(params.Position)
		cleanWord := strings.Trim(word, "\"' ")

		// $ref: resolve to the target schema
		if strings.Contains(line, "$ref") && cleanWord != "" {
			refTarget := cleanWord
			if refTarget == "$ref" {
				refTarget = extractRefFromLine(line)
			}
			if refTarget != "" {
				if target, err := idx.Resolve(refTarget); err == nil {
					if schema, ok := target.(*openapi.Schema); ok {
						return schemaTypeLocation(uri, idx, schema), nil
					}
				}
			}
		}

		// Parameter name: jump to its schema type
		for _, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				for _, p := range mo.Operation.Parameters {
					if !rangeContains(p.Loc.Range, toRange(params.Position)) {
						continue
					}
					if p.Schema != nil {
						if p.Schema.Ref != "" {
							return resolveSchemaRef(uri, idx, p.Schema.Ref), nil
						}
						if !isZeroRange(p.Schema.Loc.Range) {
							return []protocol.Location{{URI: uri, Range: p.Schema.Loc.Range}}, nil
						}
					}
				}
			}
		}

		// Property name in a schema: jump to property's type
		if idx.Document.Components != nil {
			for _, schema := range idx.Document.Components.Schemas {
				for _, prop := range schema.Properties {
					if !rangeContains(prop.Loc.Range, toRange(params.Position)) {
						continue
					}
					if prop.Ref != "" {
						return resolveSchemaRef(uri, idx, prop.Ref), nil
					}
					if !isZeroRange(prop.Loc.Range) {
						return []protocol.Location{{URI: uri, Range: prop.Loc.Range}}, nil
					}
				}
			}
		}

		return nil, nil
	}
}

func schemaTypeLocation(uri protocol.DocumentURI, idx *openapi.Index, schema *openapi.Schema) []protocol.Location {
	if schema.Ref != "" {
		return resolveSchemaRef(uri, idx, schema.Ref)
	}
	if !isZeroRange(schema.Loc.Range) {
		return []protocol.Location{{URI: uri, Range: schema.Loc.Range}}
	}
	return nil
}

func resolveSchemaRef(uri protocol.DocumentURI, idx *openapi.Index, ref string) []protocol.Location {
	if target, err := idx.Resolve(ref); err == nil {
		if s, ok := target.(*openapi.Schema); ok && !isZeroRange(s.Loc.Range) {
			return []protocol.Location{{URI: uri, Range: s.Loc.Range}}
		}
	}
	return nil
}

func toRange(pos protocol.Position) protocol.Range {
	return protocol.Range{Start: pos, End: pos}
}
