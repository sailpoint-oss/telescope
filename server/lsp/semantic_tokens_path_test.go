package lsp_test

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp"
)

const pathParamSemanticTokenSpec = `openapi: "3.1.0"
info:
  title: Token Test
  version: "1.0.0"
paths:
  /pets/{petId}/owners/{ownerId}:
    get:
      operationId: getOwner
      responses:
        "200":
          description: ok
`

type decodedSemanticToken struct {
	line      uint32
	char      uint32
	length    uint32
	tokenType uint32
	modifiers uint32
}

func decodeSemanticTokens(data []uint32) []decodedSemanticToken {
	tokens := make([]decodedSemanticToken, 0, len(data)/5)
	var prevLine, prevChar uint32
	for i := 0; i+4 < len(data); i += 5 {
		dLine := data[i]
		dChar := data[i+1]
		line := prevLine + dLine
		char := dChar
		if dLine == 0 {
			char = prevChar + dChar
		}
		tokens = append(tokens, decodedSemanticToken{
			line:      line,
			char:      char,
			length:    data[i+2],
			tokenType: data[i+3],
			modifiers: data[i+4],
		})
		prevLine = line
		prevChar = char
	}
	return tokens
}

func TestSemanticTokens_PathParametersDoNotOverlap(t *testing.T) {
	env := setupTestEnv(t, "file:///path-params.yaml", pathParamSemanticTokenSpec)
	handler := lsp.NewSemanticTokensHandler(env.cache, nil)

	result, err := handler(env.ctx, &protocol.SemanticTokensParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
	})
	if err != nil {
		t.Fatalf("semantic tokens error: %v", err)
	}
	if result == nil {
		t.Fatal("expected non-nil semantic tokens")
	}

	const (
		tokNamespace     = 0
		tokTypeParameter = 6
		pathLine         = 5
	)

	var pathTokens []decodedSemanticToken
	for _, tok := range decodeSemanticTokens(result.Data) {
		if tok.line == pathLine {
			pathTokens = append(pathTokens, tok)
		}
	}
	if len(pathTokens) < 4 {
		t.Fatalf("expected multiple path tokens on line %d, got %d", pathLine, len(pathTokens))
	}

	sawNamespace := false
	sawPathParam := false
	var prevEnd uint32
	for i, tok := range pathTokens {
		if tok.length == 0 {
			t.Fatalf("token %d has zero length: %+v", i, tok)
		}
		if i > 0 && tok.char < prevEnd {
			t.Fatalf("tokens overlap on path line: prevEnd=%d current=%+v all=%+v", prevEnd, tok, pathTokens)
		}
		prevEnd = tok.char + tok.length
		if tok.tokenType == tokNamespace {
			sawNamespace = true
		}
		if tok.tokenType == tokTypeParameter {
			sawPathParam = true
		}
	}
	if !sawNamespace {
		t.Fatal("expected namespace tokens for literal path segments")
	}
	if !sawPathParam {
		t.Fatal("expected type-parameter tokens for path parameters")
	}
}
