package lsp

import (
	"strings"
	"time"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

// NewTypeDefinitionHandler resolves the type (schema) of the element at the
// cursor. For $ref targets it jumps to the resolved schema. For parameters and
// response content it navigates to the underlying schema definition.
func NewTypeDefinitionHandler(cache *openapi.IndexCache, projMgr *project.Manager, _ *GraphBridge) gossip.TypeDefinitionHandler {
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

		// $ref: resolve to the target schema
		if strings.Contains(line, "$ref") {
			refTarget := extractRefFromLine(line)
			if refTarget != "" {
				if target, err := idx.Resolve(refTarget); err == nil {
					if schema, ok := target.(*openapi.Schema); ok {
						return schemaTypeLocation(uri, idx, schema, projMgr), nil
					}
				}
				// Cross-file fallback via project resolver
				if projMgr != nil {
					projMgr.WaitReady(2 * time.Second)
				}
				if loc := resolveTypeWithProject(projMgr, uri, refTarget); loc != nil {
					return []protocol.Location{*loc}, nil
				}
			}
		}

		// Parameter name: jump to its schema type
		for _, item := range idx.Document.Paths {
			for _, mo := range item.Operations() {
				for _, p := range mo.Operation.Parameters {
					if !rangeContains(adapt.RangeToProtocol(p.Loc.Range), toRange(params.Position)) {
						continue
					}
					if p.Schema != nil {
						if p.Schema.Ref != "" {
							return resolveSchemaRef(uri, idx, p.Schema.Ref, projMgr), nil
						}
						if !isZeroRange(adapt.RangeToProtocol(p.Schema.Loc.Range)) {
							return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(p.Schema.Loc.Range)}}, nil
						}
					}
				}

				// Response content schema: jump to referenced/inline schema type.
				for _, resp := range mo.Operation.Responses {
					if resp == nil {
						continue
					}
					for _, media := range resp.Content {
						if media == nil || media.Schema == nil {
							continue
						}
						if !rangeContains(adapt.RangeToProtocol(media.Schema.Loc.Range), toRange(params.Position)) {
							continue
						}
						if media.Schema.Ref != "" {
							return resolveSchemaRef(uri, idx, media.Schema.Ref, projMgr), nil
						}
						if !isZeroRange(adapt.RangeToProtocol(media.Schema.Loc.Range)) {
							return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(media.Schema.Loc.Range)}}, nil
						}
					}
				}
			}
		}

		// Property name in a schema: jump to property's type
		if idx.Document.Components != nil {
			for _, schema := range idx.Document.Components.Schemas {
				for _, prop := range schema.Properties {
					if !rangeContains(adapt.RangeToProtocol(prop.Loc.Range), toRange(params.Position)) {
						continue
					}
					if prop.Ref != "" {
						return resolveSchemaRef(uri, idx, prop.Ref, projMgr), nil
					}
					if !isZeroRange(adapt.RangeToProtocol(prop.Loc.Range)) {
						return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(prop.Loc.Range)}}, nil
					}
				}
			}
		}

		return nil, nil
	}
}

func schemaTypeLocation(uri protocol.DocumentURI, idx *openapi.Index, schema *openapi.Schema, projMgr *project.Manager) []protocol.Location {
	if schema.Ref != "" {
		return resolveSchemaRef(uri, idx, schema.Ref, projMgr)
	}
	if !isZeroRange(adapt.RangeToProtocol(schema.Loc.Range)) {
		return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(schema.Loc.Range)}}
	}
	return nil
}

func resolveSchemaRef(uri protocol.DocumentURI, idx *openapi.Index, ref string, projMgr *project.Manager) []protocol.Location {
	if target, err := idx.Resolve(ref); err == nil {
		if s, ok := target.(*openapi.Schema); ok && !isZeroRange(adapt.RangeToProtocol(s.Loc.Range)) {
			return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(s.Loc.Range)}}
		}
	}
	if projMgr != nil {
		projMgr.WaitReady(2 * time.Second)
	}
	if loc := resolveTypeWithProject(projMgr, uri, ref); loc != nil {
		return []protocol.Location{*loc}
	}
	return nil
}

// resolveTypeWithProject resolves a $ref to a schema type location using the
// project manager for cross-file resolution.
func resolveTypeWithProject(projMgr *project.Manager, uri protocol.DocumentURI, ref string) *protocol.Location {
	if projMgr == nil {
		return nil
	}
	pctx := projMgr.ProjectForFile(string(uri))
	if pctx == nil || pctx.Resolver == nil {
		return nil
	}
	result, err := pctx.Resolver.Resolve(string(uri), ref)
	if err != nil {
		return nil
	}
	targetURI := protocol.NormalizeURI(protocol.DocumentURI(result.TargetURI))
	if s, ok := result.Value.(*openapi.Schema); ok && !isZeroRange(adapt.RangeToProtocol(s.Loc.Range)) {
		resolved := openapi.LocOrFallback(s.NameLoc, s.Loc)
		return &protocol.Location{URI: targetURI, Range: adapt.RangeToProtocol(resolved.Range)}
	}
	return locationFromTarget(targetURI, result.Value)
}

func toRange(pos protocol.Position) protocol.Range {
	return protocol.Range{Start: pos, End: pos}
}
