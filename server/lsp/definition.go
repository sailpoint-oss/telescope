package lsp

import (
	"log/slog"
	"strings"
	"time"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

// NewDefinitionHandler provides go-to-definition for $ref targets, security
// scheme names, tags, operationId in links/callbacks, and discriminator mappings.
func NewDefinitionHandler(cache *openapi.IndexCache, projMgr *project.Manager, graphBridge *GraphBridge) gossip.DefinitionHandler {
	return func(ctx *gossip.Context, params *protocol.DefinitionParams) ([]protocol.Location, error) {
		uri := params.TextDocument.URI
		var logger *slog.Logger
		if ctx.Server() != nil {
			logger = ctx.Logger()
		}
		idx := cache.Get(uri)
		if idx == nil {
			if logger != nil {
				logger.Debug("definition: no index for URI", slog.String("uri", string(uri)))
			}
			return nil, nil
		}

		doc := ctx.Documents.Get(uri)
		if doc == nil {
			return nil, nil
		}

		line := doc.LineAt(params.Position.Line)
		word := doc.WordAt(params.Position)
		cleanWord := strings.Trim(word, "\"' ")

		// $ref resolution — always extract the full ref value from the line
		// because WordAt() breaks on #, /, etc. and returns fragments.
		if strings.Contains(line, "$ref") {
			refTarget := extractRefFromLine(line)
			if refTarget != "" {
				if locs := resolveRefToLocation(ctx, uri, refTarget, idx, cache, graphBridge, projMgr, logger); locs != nil {
					return locs, nil
				}
			}
		}

		// Security scheme: jump to definition in components/securitySchemes
		if isSecurityContext(line) && cleanWord != "" {
			if ss, ok := idx.SecuritySchemes[cleanWord]; ok {
				return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(ss.Loc.Range)}}, nil
			}
		}

		// Tag: jump to root tags[] definition
		if isTagContext(line) && cleanWord != "" {
			if tag, ok := idx.Tags[cleanWord]; ok {
				loc := openapi.LocOrFallback(tag.NameLoc, tag.Loc)
				return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(loc.Range)}}, nil
			}
		}

		// operationId in links/callbacks
		if (strings.Contains(line, "operationId") || strings.Contains(line, "operationRef")) && cleanWord != "" {
			if opRef, ok := idx.Operations[cleanWord]; ok {
				return []protocol.Location{{URI: uri, Range: adapt.RangeToProtocol(opRef.Operation.Loc.Range)}}, nil
			}
			// Cross-file search
			if docURI, opRef := cache.FindByOperationID(cleanWord); opRef != nil {
				return []protocol.Location{{URI: docURI, Range: adapt.RangeToProtocol(opRef.Operation.Loc.Range)}}, nil
			}
		}

		// Discriminator mapping values are refs. Check for "mapping:" key context
		// rather than just any line containing "mapping" to avoid false positives.
		trimmedLine := strings.TrimSpace(line)
		if isDiscriminatorMappingContext(trimmedLine) && cleanWord != "" {
			if strings.HasPrefix(cleanWord, "#/") || strings.Contains(cleanWord, "/") {
				if locs := resolveRefToLocation(ctx, uri, cleanWord, idx, cache, graphBridge, projMgr, logger); locs != nil {
					return locs, nil
				}
			}
		}

		return nil, nil
	}
}

// invalidateTarget proactively triggers diagnostic republishing for a
// cross-file navigation target so the user sees diagnostics when VS Code opens
// the file via go-to-definition.
func invalidateTarget(ctx *gossip.Context, targetURI protocol.DocumentURI) {
	if ctx.Server() == nil {
		return
	}
	if eng := ctx.Server().DiagnosticEngine(); eng != nil {
		eng.Invalidate(targetURI)
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

	// Determine quote style and extract quoted value to handle trailing comments.
	if len(rest) > 0 && (rest[0] == '"' || rest[0] == '\'') {
		quote := rest[0]
		end := strings.IndexByte(rest[1:], quote)
		if end >= 0 {
			return rest[1 : end+1]
		}
	}

	// Unquoted value — strip trailing YAML comment (# preceded by whitespace).
	if ci := strings.Index(rest, " #"); ci >= 0 {
		rest = strings.TrimSpace(rest[:ci])
	}
	return rest
}

// resolveWithProject attempts cross-file $ref resolution using the project manager.
func resolveWithProject(projMgr *project.Manager, uri protocol.DocumentURI, ref string) *protocol.Location {
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
	return locationFromTarget(targetURI, result.Value)
}

func locationFromTarget(docURI protocol.DocumentURI, target interface{}) *protocol.Location {
	normURI := protocol.NormalizeURI(docURI)

	var loc, nameLoc openapi.Loc
	switch t := target.(type) {
	case *openapi.Schema:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.Response:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.Parameter:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.SecurityScheme:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.RequestBody:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.Example:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.PathItem:
		loc = t.Loc
	case *openapi.Header:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.Link:
		loc, nameLoc = t.Loc, t.NameLoc
	case *openapi.Document:
		r := protocol.Range{}
		if !isZeroRange(adapt.RangeToProtocol(t.Loc.Range)) {
			r = adapt.RangeToProtocol(t.Loc.Range)
		}
		return &protocol.Location{URI: normURI, Range: r}
	default:
		return nil
	}

	result := openapi.LocOrFallback(nameLoc, loc)
	return &protocol.Location{
		URI:   normURI,
		Range: adapt.RangeToProtocol(result.Range),
	}
}

// resolveRefToLocation resolves a $ref-like value through the three-tier resolution
// strategy: local index → graph bridge → project manager. Returns locations on success
// or nil if the ref cannot be resolved.
func resolveRefToLocation(
	ctx *gossip.Context,
	uri protocol.DocumentURI,
	ref string,
	idx *openapi.Index,
	cache *openapi.IndexCache,
	graphBridge *GraphBridge,
	projMgr *project.Manager,
	logger *slog.Logger,
) []protocol.Location {
	// 1. Local resolution within the same document.
	if target, err := idx.Resolve(ref); err == nil {
		if loc := locationFromTarget(uri, target); loc != nil {
			if logger != nil {
				logger.Debug("definition: resolved local ref",
					slog.String("ref", ref),
					slog.String("targetURI", string(loc.URI)))
			}
			return []protocol.Location{*loc}
		}
	}

	// 2. Graph edge lookup — fast cross-file resolution.
	if graphBridge != nil {
		if targetURI, targetPtr, ok := graphBridge.LookupDefinition(string(uri), ref); ok {
			normTarget := protocol.NormalizeURI(protocol.DocumentURI(targetURI))
			// Prepend "#" because TargetPointer is a JSON Pointer
			// (e.g. "/components/schemas/Pet") but Resolve expects
			// a ref string (e.g. "#/components/schemas/Pet").
			if targetIdx := cache.Get(normTarget); targetIdx != nil && targetPtr != "" {
				if target, err := targetIdx.Resolve("#" + targetPtr); err == nil {
					if loc := locationFromTarget(normTarget, target); loc != nil {
						if logger != nil {
							logger.Debug("definition: resolved via graph edge",
								slog.String("ref", ref),
								slog.String("targetURI", targetURI))
						}
						invalidateTarget(ctx, normTarget)
						return []protocol.Location{*loc}
					}
				}
			}
			// Target URI known but no index yet — only return file-start
			// fallback for cross-file refs. For same-file refs that failed
			// to resolve, fall through to the project manager (step 3).
			if normTarget != protocol.NormalizeURI(uri) {
				if logger != nil {
					logger.Debug("definition: graph edge found, no target index",
						slog.String("ref", ref),
						slog.String("targetURI", targetURI))
				}
				invalidateTarget(ctx, normTarget)
				return []protocol.Location{{URI: normTarget, Range: protocol.Range{}}}
			}
		}
	}

	// 3. Cross-file fallback via project manager.
	if projMgr != nil {
		projMgr.WaitReady(2 * time.Second)
	}
	if loc := resolveWithProject(projMgr, uri, ref); loc != nil {
		if logger != nil {
			logger.Debug("definition: resolved cross-file ref",
				slog.String("ref", ref),
				slog.String("targetURI", string(loc.URI)))
		}
		invalidateTarget(ctx, loc.URI)
		return []protocol.Location{*loc}
	}

	if logger != nil {
		logger.Debug("definition: unresolved ref", slog.String("ref", ref))
	}
	return nil
}

// isDiscriminatorMappingContext checks if the line is within a discriminator
// mapping block (e.g. a key-value under "mapping:").
func isDiscriminatorMappingContext(trimmedLine string) bool {
	// Direct "mapping:" key
	if strings.HasPrefix(trimmedLine, "mapping:") {
		return true
	}
	// Value line under mapping — has a colon (key: value pair) and contains
	// a ref-like value (path separator). Exclude lines that are clearly other
	// YAML structures.
	if strings.Contains(trimmedLine, ":") && strings.Contains(trimmedLine, "/") {
		return true
	}
	return false
}
