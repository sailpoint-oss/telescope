package lsp

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

const (
	tokNamespace     = 0  // path strings
	tokType          = 1  // schema names
	tokClass         = 2  // unused
	tokEnum          = 3  // response status codes
	tokInterface     = 4  // unused
	tokStruct        = 5  // unused
	tokTypeParameter = 6  // path parameters {param}
	tokParameter     = 7  // unused
	tokVariable      = 8  // $ref values
	tokProperty      = 9  // unused
	tokFunction      = 10 // operationId values
	tokMethod        = 11 // HTTP methods
	tokMacro         = 12 // security scheme names
	tokKeyword       = 13 // schema type values
	tokModifier      = 14 // deprecated
	tokString        = 15 // unused

	modDeclaration  = 1 << 0
	modDefinition   = 1 << 1
	modReadonly     = 1 << 2
	modDeprecated   = 1 << 3
	modModification = 1 << 4
)

var pathParamRe = regexp.MustCompile(`\{([^}]+)\}`)

// NewSemanticTokensHandler provides OpenAPI-aware syntax highlighting. The
// handler consults tokenCache (may be nil) for a previously-built token slice
// keyed by the document's edit version; on hit it returns the cached
// delta-encoded payload directly.
func NewSemanticTokensHandler(cache *openapi.IndexCache, graphBridge *GraphBridge, tokenCache *SemanticTokenCache) gossip.SemanticTokensHandler {
	return func(ctx *gossip.Context, params *protocol.SemanticTokensParams) (*protocol.SemanticTokens, error) {
		if !rootOpenAPITargetGate(ctx, graphBridge, cache, params.TextDocument.URI) {
			return nil, nil
		}
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		doc := ctx.Documents.Get(params.TextDocument.URI)
		version := docVersion(doc)
		docText := ""
		if doc != nil {
			docText = doc.Text()
		}

		if tokenCache != nil {
			if entry := tokenCache.Get(params.TextDocument.URI, version); entry != nil {
				if entry.fullPayload == nil {
					entry.fullPayload = deltaEncode(entry.tokens)
				}
				return &protocol.SemanticTokens{Data: entry.fullPayload}, nil
			}
		}

		tokens := buildSemanticTokens(idx, docText)
		payload := deltaEncode(tokens)
		if tokenCache != nil {
			tokenCache.Put(params.TextDocument.URI, &semanticTokenCacheEntry{
				version:     version,
				tokens:      tokens,
				fullPayload: payload,
			})
		}
		return &protocol.SemanticTokens{Data: payload}, nil
	}
}

// NewSemanticTokensRangeHandler provides range-scoped semantic tokens. When a
// cached entry for the current document version exists, we binary-search the
// cached sorted slice for the viewport window in O(log N + W) instead of
// rebuilding. On cache miss, we build the full token slice once (which itself
// uses the sorted openapi.Index views for $refs and components to skip work
// on ref-heavy specs), store it, and serve the Range sub-slice from it. The
// first Full handler hit after a Range miss then reuses the same payload.
func NewSemanticTokensRangeHandler(cache *openapi.IndexCache, graphBridge *GraphBridge, tokenCache *SemanticTokenCache) gossip.SemanticTokensRangeHandler {
	return func(ctx *gossip.Context, params *protocol.SemanticTokensRangeParams) (*protocol.SemanticTokens, error) {
		if !rootOpenAPITargetGate(ctx, graphBridge, cache, params.TextDocument.URI) {
			return nil, nil
		}
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		doc := ctx.Documents.Get(params.TextDocument.URI)
		version := docVersion(doc)
		docText := ""
		if doc != nil {
			docText = doc.Text()
		}

		var tokens []semanticToken
		if tokenCache != nil {
			if entry := tokenCache.Get(params.TextDocument.URI, version); entry != nil {
				tokens = entry.tokens
			}
		}
		if tokens == nil {
			tokens = buildSemanticTokens(idx, docText)
			if tokenCache != nil {
				tokenCache.Put(params.TextDocument.URI, &semanticTokenCacheEntry{
					version: version,
					tokens:  tokens,
				})
			}
		}

		sub := sliceTokensForRange(tokens, params.Range.Start.Line, params.Range.End.Line)
		data := deltaEncode(sub)
		return &protocol.SemanticTokens{Data: data}, nil
	}
}

// docVersion returns the current edit version, or -1 when no document is
// available (real Versions start at 0 and monotonically increase, so -1
// cannot collide with a live entry). Used by the token cache so a second
// Range or Full request for the same edit version reuses the cached build.
func docVersion(doc *document.Document) int32 {
	if doc == nil {
		return -1
	}
	return doc.Version()
}

// buildSemanticTokens returns the full set of semantic tokens for the index,
// kept as a thin wrapper for historical callers. Prefer buildSemanticTokensRanged
// with a nil range for identical behavior and for the option of narrowing later.
func buildSemanticTokens(idx *openapi.Index, docText string) []semanticToken {
	return buildSemanticTokensRanged(idx, docText, nil)
}

// buildSemanticTokensRanged emits tokens for the document, optionally narrowed
// to a viewport. When r is non-nil, $ref and component scans use the Index's
// sorted views and binary-search past everything above the viewport; path
// iteration still walks every PathItem (the map is small even on huge specs)
// but emits only tokens whose line falls inside the range.
//
// A tokenAccept closure is used for the line filter so nil-range behavior
// takes a trivial accept-all path and the JIT keeps the branch predictor
// happy on hot loops.
func buildSemanticTokensRanged(idx *openapi.Index, docText string, r *protocol.Range) []semanticToken {
	accept := func(line uint32) bool { return true }
	if r != nil {
		startLine, endLine := r.Start.Line, r.End.Line
		accept = func(line uint32) bool { return line >= startLine && line <= endLine }
	}

	var tokens []semanticToken

	for pathStr, item := range idx.Document.Paths {
		// Path name tokens have a single line; gate cheaply.
		if !isZeroRange(adapt.RangeToProtocol(item.PathLoc.Range)) && accept(item.PathLoc.Range.Start.Line) {
			tokens = append(tokens, buildPathSemanticTokens(pathStr, item.PathLoc.Range.Start.Line, item.PathLoc.Range.Start.Character)...)
		}

		for _, mo := range item.Operations() {
			methodLoc := mo.Operation.MethodLoc
			if isZeroRange(adapt.RangeToProtocol(methodLoc.Range)) {
				methodLoc = mo.Operation.Loc
			}
			if accept(methodLoc.Range.Start.Line) {
				tokens = append(tokens, semanticToken{
					line: methodLoc.Range.Start.Line, char: methodLoc.Range.Start.Character,
					length: uint32(len(mo.Method)), tokenType: tokMethod,
				})
			}

			if mo.Operation.OperationID != "" && !isZeroRange(adapt.RangeToProtocol(mo.Operation.OperationIDLoc.Range)) {
				if accept(mo.Operation.OperationIDLoc.Range.Start.Line) {
					tokens = append(tokens, semanticToken{
						line: mo.Operation.OperationIDLoc.Range.Start.Line, char: mo.Operation.OperationIDLoc.Range.Start.Character,
						length: rangeLen(adapt.RangeToProtocol(mo.Operation.OperationIDLoc.Range)), tokenType: tokFunction,
					})
				}
			}

			for _, resp := range mo.Operation.Responses {
				if resp == nil {
					continue
				}
				codeLoc := resp.CodeLoc
				if isZeroRange(adapt.RangeToProtocol(codeLoc.Range)) {
					codeLoc = resp.Loc
				}
				if !isZeroRange(adapt.RangeToProtocol(codeLoc.Range)) && accept(codeLoc.Range.Start.Line) {
					tokens = append(tokens, semanticToken{
						line: codeLoc.Range.Start.Line, char: codeLoc.Range.Start.Character,
						length: rangeLen(adapt.RangeToProtocol(codeLoc.Range)), tokenType: tokEnum,
					})
				}
			}
		}
	}

	// Refs: the dominant O(N) source on ref-heavy specs. Use the sorted view
	// so a range request can binary-search to the first entry >= range.Start
	// and bail on the first entry past range.End.
	tokens = appendRefTokens(tokens, idx, r)

	// Components: typically a few hundred on real-world specs; same idea.
	tokens = appendComponentTokens(tokens, idx, r)

	// Root tag names — always few; no sort needed.
	for _, tag := range idx.Document.Tags {
		if !isZeroRange(adapt.RangeToProtocol(tag.NameLoc.Range)) && accept(tag.NameLoc.Range.Start.Line) {
			tokens = append(tokens, semanticToken{
				line: tag.NameLoc.Range.Start.Line, char: tag.NameLoc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(tag.NameLoc.Range)), tokenType: tokType, modifiers: modDefinition,
			})
		}
	}

	if docText != "" {
		tokens = clampAndFilterSemanticTokens(tokens, docText)
	}

	sort.Slice(tokens, func(i, j int) bool {
		if tokens[i].line != tokens[j].line {
			return tokens[i].line < tokens[j].line
		}
		if tokens[i].char != tokens[j].char {
			return tokens[i].char < tokens[j].char
		}
		if tokens[i].length != tokens[j].length {
			return tokens[i].length < tokens[j].length
		}
		if tokens[i].tokenType != tokens[j].tokenType {
			return tokens[i].tokenType < tokens[j].tokenType
		}
		return tokens[i].modifiers < tokens[j].modifiers
	})
	tokens = filterOverlappingSemanticTokens(tokens)

	return tokens
}

// appendRefTokens walks $ref usages. When r is non-nil, uses the sorted view
// (SortedRefs + FirstRefAtOrAfter) to jump straight to the viewport's first
// ref and stop on the first ref past the viewport. When r is nil, falls back
// to linear iteration over AllRefs to preserve the exact ordering the Full
// handler has always produced.
func appendRefTokens(tokens []semanticToken, idx *openapi.Index, r *protocol.Range) []semanticToken {
	if r == nil {
		for _, ref := range idx.AllRefs {
			if isZeroRange(adapt.RangeToProtocol(ref.Loc.Range)) {
				continue
			}
			tokens = append(tokens, semanticToken{
				line: ref.Loc.Range.Start.Line, char: ref.Loc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(ref.Loc.Range)), tokenType: tokVariable,
			})
		}
		return tokens
	}
	sorted := idx.SortedRefs()
	if len(sorted) == 0 {
		return tokens
	}
	start := openapi.FirstRefAtOrAfter(sorted, r.Start.Line)
	for i := start; i < len(sorted); i++ {
		entry := sorted[i]
		if entry.Line > r.End.Line {
			break
		}
		ref := idx.AllRefs[entry.Index]
		if isZeroRange(adapt.RangeToProtocol(ref.Loc.Range)) {
			continue
		}
		tokens = append(tokens, semanticToken{
			line: ref.Loc.Range.Start.Line, char: ref.Loc.Range.Start.Character,
			length: rangeLen(adapt.RangeToProtocol(ref.Loc.Range)), tokenType: tokVariable,
		})
	}
	return tokens
}

// appendComponentTokens walks Components.{Schemas,SecuritySchemes}. Schema
// Type tokens share a line with their NameLoc but not always — we still emit
// both when the range accepts the respective line; the per-token line check
// is cheap compared to the binary-searched bulk skip.
func appendComponentTokens(tokens []semanticToken, idx *openapi.Index, r *protocol.Range) []semanticToken {
	if idx.Document == nil || idx.Document.Components == nil {
		return tokens
	}
	emitSchema := func(schema *openapi.Schema, acceptLine func(uint32) bool) {
		if !isZeroRange(adapt.RangeToProtocol(schema.NameLoc.Range)) && acceptLine(schema.NameLoc.Range.Start.Line) {
			tokens = append(tokens, semanticToken{
				line: schema.NameLoc.Range.Start.Line, char: schema.NameLoc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(schema.NameLoc.Range)), tokenType: tokType, modifiers: modDeclaration,
			})
		}
		if schema.Type != "" && !isZeroRange(adapt.RangeToProtocol(schema.TypeLoc.Range)) && acceptLine(schema.TypeLoc.Range.Start.Line) {
			tokens = append(tokens, semanticToken{
				line: schema.TypeLoc.Range.Start.Line, char: schema.TypeLoc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(schema.TypeLoc.Range)), tokenType: tokKeyword,
			})
		}
	}
	emitSecurity := func(ss *openapi.SecurityScheme, acceptLine func(uint32) bool) {
		nameLoc := ss.NameLoc
		if isZeroRange(adapt.RangeToProtocol(nameLoc.Range)) {
			nameLoc = ss.Loc
		}
		if !isZeroRange(adapt.RangeToProtocol(nameLoc.Range)) && acceptLine(nameLoc.Range.Start.Line) {
			tokens = append(tokens, semanticToken{
				line: nameLoc.Range.Start.Line, char: nameLoc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(nameLoc.Range)), tokenType: tokMacro, modifiers: modDeclaration,
			})
		}
	}

	if r == nil {
		acceptAll := func(uint32) bool { return true }
		for _, s := range idx.Document.Components.Schemas {
			emitSchema(s, acceptAll)
		}
		for _, ss := range idx.Document.Components.SecuritySchemes {
			emitSecurity(ss, acceptAll)
		}
		return tokens
	}

	sorted := idx.SortedComponents()
	if len(sorted) == 0 {
		return tokens
	}
	startIdx := openapi.FirstComponentAtOrAfter(sorted, r.Start.Line)
	// A schema's TypeLoc sometimes lands on a later line than its NameLoc; we
	// scan a small prefix backwards to pick up schemas whose name is above
	// the range but whose type lands inside it.
	scanBack := 4
	if startIdx < scanBack {
		scanBack = startIdx
	}
	startIdx -= scanBack
	accept := func(line uint32) bool { return line >= r.Start.Line && line <= r.End.Line }
	for i := startIdx; i < len(sorted); i++ {
		entry := sorted[i]
		// Names below the range are safe to stop at; schema Type locs are
		// at most a few lines after the name, covered by scanBack above.
		if entry.Line > r.End.Line {
			break
		}
		switch entry.Kind {
		case openapi.ComponentKindSchema:
			if entry.Schema != nil {
				emitSchema(entry.Schema, accept)
			}
		case openapi.ComponentKindSecurityScheme:
			if entry.SecurityScheme != nil {
				emitSecurity(entry.SecurityScheme, accept)
			}
		}
	}
	return tokens
}

func buildPathSemanticTokens(pathStr string, line, startChar uint32) []semanticToken {
	matches := pathParamRe.FindAllStringIndex(pathStr, -1)
	if len(matches) == 0 {
		length := utf16StringLen(pathStr)
		if length == 0 {
			return nil
		}
		return []semanticToken{{
			line:      line,
			char:      startChar,
			length:    length,
			tokenType: tokNamespace,
		}}
	}

	tokens := make([]semanticToken, 0, len(matches)*2+1)
	cursor := 0
	for _, match := range matches {
		if match[0] > cursor {
			prefix := pathStr[cursor:match[0]]
			if length := utf16StringLen(prefix); length > 0 {
				tokens = append(tokens, semanticToken{
					line:      line,
					char:      startChar + byteOffsetToUTF16(pathStr, cursor),
					length:    length,
					tokenType: tokNamespace,
				})
			}
		}

		param := pathStr[match[0]:match[1]]
		if length := utf16StringLen(param); length > 0 {
			tokens = append(tokens, semanticToken{
				line:      line,
				char:      startChar + byteOffsetToUTF16(pathStr, match[0]),
				length:    length,
				tokenType: tokTypeParameter,
			})
		}
		cursor = match[1]
	}

	if cursor < len(pathStr) {
		suffix := pathStr[cursor:]
		if length := utf16StringLen(suffix); length > 0 {
			tokens = append(tokens, semanticToken{
				line:      line,
				char:      startChar + byteOffsetToUTF16(pathStr, cursor),
				length:    length,
				tokenType: tokNamespace,
			})
		}
	}

	return tokens
}

type semanticToken struct {
	line, char, length uint32
	tokenType          uint32
	modifiers          uint32
}

func deltaEncode(tokens []semanticToken) []uint32 {
	data := make([]uint32, 0, len(tokens)*5)
	var prevLine, prevChar uint32
	for _, t := range tokens {
		deltaLine := t.line - prevLine
		deltaChar := t.char
		if deltaLine == 0 {
			deltaChar = t.char - prevChar
		}
		data = append(data, deltaLine, deltaChar, t.length, t.tokenType, t.modifiers)
		prevLine = t.line
		prevChar = t.char
	}
	return data
}

// byteOffsetToUTF16 converts a byte offset within s to a UTF-16 code unit count.
func byteOffsetToUTF16(s string, byteOff int) uint32 {
	n := uint32(0)
	for i := 0; i < byteOff && i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		n += uint32(utf16.RuneLen(r))
		i += size
	}
	return n
}

func rangeLen(r protocol.Range) uint32 {
	if r.Start.Line == r.End.Line {
		if r.End.Character <= r.Start.Character {
			return 0
		}
		return r.End.Character - r.Start.Character
	}
	// Multi-line ranges are not valid single-line semantic token lengths.
	return 0
}

// clampAndFilterSemanticTokens drops tokens that extend past the UTF-16 line
// length or have zero length, avoiding VS Code "invalid length" diagnostics.
func clampAndFilterSemanticTokens(tokens []semanticToken, docText string) []semanticToken {
	out := make([]semanticToken, 0, len(tokens))
	for _, t := range tokens {
		lineStr := document.LineAt(docText, t.line)
		max := utf16StringLen(lineStr)
		if t.char >= max {
			continue
		}
		if t.char+t.length > max {
			t.length = max - t.char
		}
		if t.length == 0 {
			continue
		}
		out = append(out, t)
	}
	return out
}

func filterOverlappingSemanticTokens(tokens []semanticToken) []semanticToken {
	if len(tokens) <= 1 {
		return tokens
	}
	out := make([]semanticToken, 0, len(tokens))
	for _, tok := range tokens {
		if tok.length == 0 {
			continue
		}
		if len(out) == 0 {
			out = append(out, tok)
			continue
		}
		prev := out[len(out)-1]
		if tok.line != prev.line {
			out = append(out, tok)
			continue
		}

		prevEnd := prev.char + prev.length
		if tok.char >= prevEnd {
			out = append(out, tok)
			continue
		}

		// Skip exact duplicates.
		if tok.char == prev.char &&
			tok.length == prev.length &&
			tok.tokenType == prev.tokenType &&
			tok.modifiers == prev.modifiers {
			continue
		}

		// When two tokens start at the same position, keep the shorter/more
		// specific token and drop the broader one to avoid VS Code warnings.
		if tok.char == prev.char {
			if tok.length < prev.length {
				out[len(out)-1] = tok
			}
			continue
		}

		// For partial overlaps, prefer the earlier token and drop the later one.
	}
	return out
}

func utf16StringLen(s string) uint32 {
	var n uint32
	for i := 0; i < len(s); {
		r, size := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && size == 1 {
			n++
			i++
			continue
		}
		rl := utf16.RuneLen(r)
		if rl < 0 {
			rl = 1
		}
		n += uint32(rl)
		i += size
	}
	return n
}

func isZeroRange(r protocol.Range) bool {
	return r.Start.Line == 0 && r.Start.Character == 0 && r.End.Line == 0 && r.End.Character == 0
}

func isSecurityContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	if strings.HasPrefix(trimmed, "security:") {
		return true
	}
	// Match security requirement list items: "- SchemeName: []" or "- SchemeName:"
	if strings.HasPrefix(trimmed, "- ") {
		rest := strings.TrimPrefix(trimmed, "- ")
		// Security requirements have the form: SchemeName: [scopes] or SchemeName: []
		return strings.Contains(rest, ":") && (strings.Contains(rest, "[") || strings.HasSuffix(rest, ":"))
	}
	return false
}

func isTagContext(line string) bool {
	trimmed := strings.TrimSpace(line)
	// Match "tags:" key or tag list items under tags (e.g. "- Pets")
	return strings.HasPrefix(trimmed, "tags:") || strings.HasPrefix(trimmed, "- ")
}
