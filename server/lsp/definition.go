package lsp

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// NewDefinitionHandler provides go-to-definition for $ref targets, security
// scheme names, tags, operationId in links/callbacks, and discriminator mappings.
func NewDefinitionHandler(cache *openapi.IndexCache) gossip.DefinitionHandler {
	return func(ctx *gossip.Context, params *protocol.DefinitionParams) ([]protocol.Location, error) {
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

		// $ref resolution
		if strings.Contains(line, "$ref") {
			refTarget := cleanWord
			if refTarget == "" || refTarget == "$ref" {
				refTarget = extractRefFromLine(line)
			}
			if refTarget != "" {
				if target, err := idx.Resolve(refTarget); err == nil {
					if loc := locationFromTarget(uri, target); loc != nil {
						return []protocol.Location{*loc}, nil
					}
				}
			}
		}

		// Security scheme: jump to definition in components/securitySchemes
		if isSecurityContext(line) && cleanWord != "" {
			if ss, ok := idx.SecuritySchemes[cleanWord]; ok {
				return []protocol.Location{{URI: uri, Range: ss.Loc.Range}}, nil
			}
		}

		// Tag: jump to root tags[] definition
		if isTagContext(line) && cleanWord != "" {
			if tag, ok := idx.Tags[cleanWord]; ok {
				return []protocol.Location{{URI: uri, Range: tag.Loc.Range}}, nil
			}
		}

		// operationId in links/callbacks
		if (strings.Contains(line, "operationId") || strings.Contains(line, "operationRef")) && cleanWord != "" {
			if opRef, ok := idx.Operations[cleanWord]; ok {
				return []protocol.Location{{URI: uri, Range: opRef.Operation.Loc.Range}}, nil
			}
			// Cross-file search
			if docURI, opRef := cache.FindByOperationID(cleanWord); opRef != nil {
				return []protocol.Location{{URI: docURI, Range: opRef.Operation.Loc.Range}}, nil
			}
		}

		// Discriminator mapping values are refs
		if strings.Contains(line, "mapping") && cleanWord != "" {
			if strings.HasPrefix(cleanWord, "#/") || strings.Contains(cleanWord, "/") {
				if target, err := idx.Resolve(cleanWord); err == nil {
					if loc := locationFromTarget(uri, target); loc != nil {
						return []protocol.Location{*loc}, nil
					}
				}
			}
		}

		return nil, nil
	}
}

func extractRefFromLine(line string) string {
	i := strings.Index(line, "$ref")
	if i < 0 {
		return ""
	}
	rest := line[i+4:]
	rest = strings.TrimLeft(rest, ": \t")
	rest = strings.TrimSpace(rest)
	rest = strings.Trim(rest, "\"'")
	return rest
}

func locationFromTarget(docURI protocol.DocumentURI, target interface{}) *protocol.Location {
	var loc openapi.Loc
	switch t := target.(type) {
	case *openapi.Schema:
		loc = t.Loc
	case *openapi.Response:
		loc = t.Loc
	case *openapi.Parameter:
		loc = t.Loc
	case *openapi.SecurityScheme:
		loc = t.Loc
	case *openapi.RequestBody:
		loc = t.Loc
	case *openapi.Example:
		loc = t.Loc
	case *openapi.PathItem:
		loc = t.Loc
	case *openapi.Header:
		loc = t.Loc
	case *openapi.Link:
		loc = t.Loc
	default:
		return nil
	}

	return &protocol.Location{
		URI:   docURI,
		Range: loc.Range,
	}
}
