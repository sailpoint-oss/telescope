package lsp

import (
	"log/slog"
	"net/url"
	"os"
	"path"
	"reflect"
	"strings"
	"time"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/lsp/observe"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/project"
)

// NewDefinitionHandler provides go-to-definition for $ref targets, security
// scheme names, tags, operationId in links/callbacks, and discriminator mappings.
func NewDefinitionHandler(cache *openapi.IndexCache, projMgr *project.Manager, graphBridge *GraphBridge) gossip.DefinitionHandler {
	return func(ctx *gossip.Context, params *protocol.DefinitionParams) ([]protocol.Location, error) {
		uri := params.TextDocument.URI
		traceID := observe.GetTraceID(ctx)
		var logger *slog.Logger
		if ctx.Server() != nil {
			logger = ctx.Logger()
		}
		doc := ctx.Documents.Get(uri)
		idx := cache.Get(uri)
		if idx == nil {
			if logger != nil {
				logger.Debug("definition: no index for URI", slog.String("trace_id", traceID), slog.String("uri", string(uri)))
			}
			// Best-effort external $ref fallback when index isn't ready yet.
			line := definitionLineAt(doc, uri, params.Position.Line)
			if strings.Contains(line, "$ref") {
				refTarget := extractRefFromLine(line)
				if locs := resolveLocalRefTextFallback(uri, refTarget); locs != nil {
					return locs, nil
				}
				if locs := resolveExternalRefFallback(uri, refTarget, cache, logger, traceID); locs != nil {
					return locs, nil
				}
			}
			return nil, nil
		}

		if doc == nil {
			line := definitionLineAt(nil, uri, params.Position.Line)
			if strings.Contains(line, "$ref") {
				refTarget := extractRefFromLine(line)
				if locs := resolveExternalRefFallback(uri, refTarget, cache, logger, traceID); locs != nil {
					return locs, nil
				}
			}
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
				if locs := resolveRefToLocation(ctx, uri, refTarget, idx, cache, graphBridge, projMgr, logger, traceID); locs != nil {
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
				if locs := resolveRefToLocation(ctx, uri, cleanWord, idx, cache, graphBridge, projMgr, logger, traceID); locs != nil {
					return locs, nil
				}
			}
		}

		return nil, nil
	}
}

func definitionLineAt(doc interface{ LineAt(uint32) string }, uri protocol.DocumentURI, line uint32) string {
	if !isNilLineAccessor(doc) {
		return doc.LineAt(line)
	}
	fsPath := uriToFSPath(string(protocol.NormalizeURI(uri)))
	if fsPath == "" {
		return ""
	}
	content, err := os.ReadFile(fsPath)
	if err != nil {
		return ""
	}
	lines := strings.Split(string(content), "\n")
	if int(line) < 0 || int(line) >= len(lines) {
		return ""
	}
	return lines[int(line)]
}

func isNilLineAccessor(doc interface{ LineAt(uint32) string }) bool {
	if doc == nil {
		return true
	}
	v := reflect.ValueOf(doc)
	return v.Kind() == reflect.Ptr && v.IsNil()
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
	if pctx == nil {
		return nil
	}
	resolver := pctx.GetResolver()
	if resolver == nil {
		return nil
	}
	result, err := resolver.Resolve(string(uri), ref)
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
	traceID string,
) []protocol.Location {
	// 1. Local resolution within the same document.
	if target, err := idx.Resolve(ref); err == nil {
		if loc := locationFromTarget(uri, target); loc != nil {
			if logger != nil {
				logger.Debug("definition: resolved local ref",
					slog.String("trace_id", traceID),
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
								slog.String("trace_id", traceID),
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
						slog.String("trace_id", traceID),
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
				slog.String("trace_id", traceID),
				slog.String("ref", ref),
				slog.String("targetURI", string(loc.URI)))
		}
		invalidateTarget(ctx, loc.URI)
		return []protocol.Location{*loc}
	}

	// 4. Deterministic URI-based fallback for external refs. This keeps
	// go-to-definition stable even if graph/project caches are still warming.
	if locs := resolveExternalRefFallback(uri, ref, cache, logger, traceID); locs != nil {
		return locs
	}

	if logger != nil {
		logger.Debug("definition: unresolved ref", slog.String("trace_id", traceID), slog.String("ref", ref))
	}
	return nil
}

func resolveExternalRefFallback(
	baseURI protocol.DocumentURI,
	ref string,
	cache *openapi.IndexCache,
	logger *slog.Logger,
	traceID string,
) []protocol.Location {
	refPath, refPointer, isExternal := splitExternalRef(ref)
	if !isExternal || refPath == "" {
		return nil
	}

	baseStr := string(protocol.NormalizeURI(baseURI))
	u, err := url.Parse(baseStr)
	if err != nil || u.Scheme != "file" {
		return nil
	}
	u.Path = path.Clean(path.Join(path.Dir(u.Path), refPath))
	targetURI := protocol.DocumentURI(u.String())
	if targetURI == "" {
		return nil
	}

	// If target index is available, try precise pointer resolution first.
	if refPointer != "" && cache != nil {
		if targetIdx := cache.Get(targetURI); targetIdx != nil {
			if target, err := targetIdx.Resolve("#" + refPointer); err == nil {
				if loc := locationFromTarget(targetURI, target); loc != nil {
					if logger != nil {
						logger.Debug("definition: resolved external ref fallback target",
							slog.String("trace_id", traceID),
							slog.String("ref", ref),
							slog.String("targetURI", string(loc.URI)))
					}
					return []protocol.Location{*loc}
				}
			}
		}
	}

	// Fall back to file-start target when pointer resolution is unavailable.
	if logger != nil {
		logger.Debug("definition: external ref fallback file target",
			slog.String("trace_id", traceID),
			slog.String("ref", ref),
			slog.String("targetURI", string(targetURI)))
	}
	return []protocol.Location{{URI: targetURI, Range: protocol.Range{}}}
}

func resolveLocalRefTextFallback(uri protocol.DocumentURI, ref string) []protocol.Location {
	if !strings.HasPrefix(ref, "#/") {
		return nil
	}
	fsPath := uriToFSPath(string(protocol.NormalizeURI(uri)))
	if fsPath == "" {
		return nil
	}
	content, err := os.ReadFile(fsPath)
	if err != nil {
		return nil
	}
	segments := strings.Split(strings.TrimPrefix(ref, "#/"), "/")
	if len(segments) == 0 {
		return nil
	}
	targetName := segments[len(segments)-1]
	if targetName == "" {
		return nil
	}
	targetName = strings.ReplaceAll(targetName, "~1", "/")
	targetName = strings.ReplaceAll(targetName, "~0", "~")

	lines := strings.Split(string(content), "\n")
	for i, ln := range lines {
		trimmed := strings.TrimSpace(ln)
		if trimmed == targetName+":" || strings.HasPrefix(trimmed, targetName+": ") {
			col := strings.Index(ln, targetName)
			if col < 0 {
				col = 0
			}
			return []protocol.Location{{
				URI: uri,
				Range: protocol.Range{
					Start: protocol.Position{Line: uint32(i), Character: uint32(col)},
					End:   protocol.Position{Line: uint32(i), Character: uint32(col + len(targetName))},
				},
			}}
		}
	}
	return []protocol.Location{{URI: uri, Range: protocol.Range{}}}
}

func splitExternalRef(ref string) (pathPart string, pointer string, external bool) {
	if ref == "" {
		return "", "", false
	}
	hash := strings.Index(ref, "#")
	switch {
	case hash == -1:
		return ref, "", !strings.HasPrefix(ref, "#")
	case hash == 0:
		return "", strings.TrimPrefix(ref, "#"), false
	default:
		return ref[:hash], strings.TrimPrefix(ref[hash:], "#"), true
	}
}

func filePathToURI(fsPath string) protocol.DocumentURI {
	if fsPath == "" {
		return ""
	}
	return protocol.DocumentURI(project.PathToURI(fsPath))
}

// isDiscriminatorMappingContext checks if the line is within a discriminator
// mapping block (e.g. a key-value under "mapping:").
func isDiscriminatorMappingContext(trimmedLine string) bool {
	// Direct "mapping:" key
	if strings.HasPrefix(trimmedLine, "mapping:") {
		return true
	}
	// Value line under mapping — the value portion contains a JSON pointer
	// (e.g. "#/components/schemas/Dog"), which is what discriminator mapping
	// values look like.
	if idx := strings.Index(trimmedLine, ":"); idx >= 0 {
		value := trimmedLine[idx+1:]
		if strings.Contains(value, "#/") {
			return true
		}
	}
	return false
}
