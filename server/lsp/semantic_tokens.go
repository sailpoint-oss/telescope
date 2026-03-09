package lsp

import (
	"regexp"
	"sort"
	"strings"
	"unicode/utf16"
	"unicode/utf8"

	"github.com/LukasParke/gossip"
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

// NewSemanticTokensHandler provides OpenAPI-aware syntax highlighting.
func NewSemanticTokensHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.SemanticTokensHandler {
	return func(ctx *gossip.Context, params *protocol.SemanticTokensParams) (*protocol.SemanticTokens, error) {
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		tokens := buildSemanticTokens(idx)
		data := deltaEncode(tokens)
		return &protocol.SemanticTokens{Data: data}, nil
	}
}

// NewSemanticTokensRangeHandler provides range-scoped semantic tokens.
func NewSemanticTokensRangeHandler(cache *openapi.IndexCache, _ *GraphBridge) gossip.SemanticTokensRangeHandler {
	return func(ctx *gossip.Context, params *protocol.SemanticTokensRangeParams) (*protocol.SemanticTokens, error) {
		idx := cache.Get(params.TextDocument.URI)
		if idx == nil || !idx.IsOpenAPI() {
			return nil, nil
		}

		all := buildSemanticTokens(idx)

		filtered := make([]semanticToken, 0, len(all))
		for _, t := range all {
			if t.line >= params.Range.Start.Line && t.line <= params.Range.End.Line {
				filtered = append(filtered, t)
			}
		}

		data := deltaEncode(filtered)
		return &protocol.SemanticTokens{Data: data}, nil
	}
}

func buildSemanticTokens(idx *openapi.Index) []semanticToken {
	var tokens []semanticToken

	for pathStr, item := range idx.Document.Paths {
		if !isZeroRange(adapt.RangeToProtocol(item.PathLoc.Range)) {
			tokens = append(tokens, semanticToken{
				line: item.PathLoc.Range.Start.Line, char: item.PathLoc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(item.PathLoc.Range)), tokenType: tokNamespace,
			})
		}

		for _, match := range pathParamRe.FindAllStringIndex(pathStr, -1) {
			paramOffset := byteOffsetToUTF16(pathStr, match[0])
			paramLen := byteOffsetToUTF16(pathStr[match[0]:], match[1]-match[0])
			tokens = append(tokens, semanticToken{
				line: item.PathLoc.Range.Start.Line, char: item.PathLoc.Range.Start.Character + paramOffset,
				length: paramLen, tokenType: tokTypeParameter,
			})
		}

		for _, mo := range item.Operations() {
			methodLoc := mo.Operation.MethodLoc
			if isZeroRange(adapt.RangeToProtocol(methodLoc.Range)) {
				methodLoc = mo.Operation.Loc
			}
			tokens = append(tokens, semanticToken{
				line: methodLoc.Range.Start.Line, char: methodLoc.Range.Start.Character,
				length: uint32(len(mo.Method)), tokenType: tokMethod,
			})

			if mo.Operation.OperationID != "" && !isZeroRange(adapt.RangeToProtocol(mo.Operation.OperationIDLoc.Range)) {
				tokens = append(tokens, semanticToken{
					line: mo.Operation.OperationIDLoc.Range.Start.Line, char: mo.Operation.OperationIDLoc.Range.Start.Character,
					length: rangeLen(adapt.RangeToProtocol(mo.Operation.OperationIDLoc.Range)), tokenType: tokFunction,
				})
			}

			for _, resp := range mo.Operation.Responses {
				if resp == nil {
					continue
				}
				codeLoc := resp.CodeLoc
				if isZeroRange(adapt.RangeToProtocol(codeLoc.Range)) {
					codeLoc = resp.Loc
				}
				if !isZeroRange(adapt.RangeToProtocol(codeLoc.Range)) {
					tokens = append(tokens, semanticToken{
						line: codeLoc.Range.Start.Line, char: codeLoc.Range.Start.Character,
						length: rangeLen(adapt.RangeToProtocol(codeLoc.Range)), tokenType: tokEnum,
					})
				}
			}
		}
	}

	for _, ref := range idx.AllRefs {
		if !isZeroRange(adapt.RangeToProtocol(ref.Loc.Range)) {
			tokens = append(tokens, semanticToken{
				line: ref.Loc.Range.Start.Line, char: ref.Loc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(ref.Loc.Range)), tokenType: tokVariable,
			})
		}
	}

	if idx.Document.Components != nil {
		for _, schema := range idx.Document.Components.Schemas {
			if !isZeroRange(adapt.RangeToProtocol(schema.NameLoc.Range)) {
				tokens = append(tokens, semanticToken{
					line: schema.NameLoc.Range.Start.Line, char: schema.NameLoc.Range.Start.Character,
					length: rangeLen(adapt.RangeToProtocol(schema.NameLoc.Range)), tokenType: tokType, modifiers: modDeclaration,
				})
			}
			if schema.Type != "" && !isZeroRange(adapt.RangeToProtocol(schema.TypeLoc.Range)) {
				tokens = append(tokens, semanticToken{
					line: schema.TypeLoc.Range.Start.Line, char: schema.TypeLoc.Range.Start.Character,
					length: rangeLen(adapt.RangeToProtocol(schema.TypeLoc.Range)), tokenType: tokKeyword,
				})
			}
		}

		for _, ss := range idx.Document.Components.SecuritySchemes {
			nameLoc := ss.NameLoc
			if isZeroRange(adapt.RangeToProtocol(nameLoc.Range)) {
				nameLoc = ss.Loc
			}
			if !isZeroRange(adapt.RangeToProtocol(nameLoc.Range)) {
				tokens = append(tokens, semanticToken{
					line: nameLoc.Range.Start.Line, char: nameLoc.Range.Start.Character,
					length: rangeLen(adapt.RangeToProtocol(nameLoc.Range)), tokenType: tokMacro, modifiers: modDeclaration,
				})
			}
		}
	}

	// Root tag names
	for _, tag := range idx.Document.Tags {
		if !isZeroRange(adapt.RangeToProtocol(tag.NameLoc.Range)) {
			tokens = append(tokens, semanticToken{
				line: tag.NameLoc.Range.Start.Line, char: tag.NameLoc.Range.Start.Character,
				length: rangeLen(adapt.RangeToProtocol(tag.NameLoc.Range)), tokenType: tokType, modifiers: modDefinition,
			})
		}
	}

	sort.Slice(tokens, func(i, j int) bool {
		if tokens[i].line != tokens[j].line {
			return tokens[i].line < tokens[j].line
		}
		return tokens[i].char < tokens[j].char
	})

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
		return r.End.Character - r.Start.Character
	}
	return r.End.Character
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
