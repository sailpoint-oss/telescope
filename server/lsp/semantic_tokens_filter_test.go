package lsp

import (
	"reflect"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestFilterOverlappingSemanticTokens(t *testing.T) {
	cases := map[string]struct {
		in   []semanticToken
		want []semanticToken
	}{
		"empty":      {in: nil, want: nil},
		"single":     {in: []semanticToken{{line: 1, char: 0, length: 3}}, want: []semanticToken{{line: 1, char: 0, length: 3}}},
		"zero-length dropped": {
			in: []semanticToken{
				{line: 1, char: 0, length: 0, tokenType: tokNamespace},
				{line: 1, char: 2, length: 4, tokenType: tokNamespace},
			},
			want: []semanticToken{{line: 1, char: 2, length: 4, tokenType: tokNamespace}},
		},
		"non-overlapping same line kept": {
			in: []semanticToken{
				{line: 1, char: 0, length: 3, tokenType: tokNamespace},
				{line: 1, char: 5, length: 2, tokenType: tokTypeParameter},
			},
			want: []semanticToken{
				{line: 1, char: 0, length: 3, tokenType: tokNamespace},
				{line: 1, char: 5, length: 2, tokenType: tokTypeParameter},
			},
		},
		"exact duplicate dropped": {
			in: []semanticToken{
				{line: 1, char: 0, length: 4, tokenType: tokNamespace, modifiers: 0},
				{line: 1, char: 0, length: 4, tokenType: tokNamespace, modifiers: 0},
			},
			want: []semanticToken{
				{line: 1, char: 0, length: 4, tokenType: tokNamespace, modifiers: 0},
			},
		},
		"same-start prefers shorter": {
			in: []semanticToken{
				{line: 1, char: 0, length: 10, tokenType: tokNamespace},
				{line: 1, char: 0, length: 4, tokenType: tokTypeParameter},
			},
			want: []semanticToken{
				{line: 1, char: 0, length: 4, tokenType: tokTypeParameter},
			},
		},
		"same-start longer ignored": {
			in: []semanticToken{
				{line: 1, char: 0, length: 4, tokenType: tokTypeParameter},
				{line: 1, char: 0, length: 10, tokenType: tokNamespace},
			},
			want: []semanticToken{
				{line: 1, char: 0, length: 4, tokenType: tokTypeParameter},
			},
		},
		"partial overlap drops later": {
			in: []semanticToken{
				{line: 1, char: 0, length: 5, tokenType: tokNamespace},
				{line: 1, char: 3, length: 5, tokenType: tokTypeParameter},
			},
			want: []semanticToken{
				{line: 1, char: 0, length: 5, tokenType: tokNamespace},
			},
		},
		"different lines pass through": {
			in: []semanticToken{
				{line: 1, char: 0, length: 4, tokenType: tokNamespace},
				{line: 2, char: 0, length: 4, tokenType: tokNamespace},
			},
			want: []semanticToken{
				{line: 1, char: 0, length: 4, tokenType: tokNamespace},
				{line: 2, char: 0, length: 4, tokenType: tokNamespace},
			},
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			got := filterOverlappingSemanticTokens(tc.in)
			if len(got) == 0 && len(tc.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestClampAndFilterSemanticTokens(t *testing.T) {
	const doc = "line zero\nsecond\n" // line 0 length 9, line 1 length 6
	in := []semanticToken{
		{line: 0, char: 0, length: 4, tokenType: tokNamespace},  // kept as-is
		{line: 0, char: 5, length: 100, tokenType: tokNamespace}, // clamped to len 4
		{line: 0, char: 100, length: 2, tokenType: tokNamespace}, // out of range, dropped
		{line: 0, char: 0, length: 0, tokenType: tokNamespace},   // zero length dropped
		{line: 1, char: 0, length: 6, tokenType: tokNamespace},   // kept exactly at limit
	}
	got := clampAndFilterSemanticTokens(in, doc)
	want := []semanticToken{
		{line: 0, char: 0, length: 4, tokenType: tokNamespace},
		{line: 0, char: 5, length: 4, tokenType: tokNamespace},
		{line: 1, char: 0, length: 6, tokenType: tokNamespace},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %+v, want %+v", got, want)
	}
}

func TestUtf16StringLen_ExtendedCoverage(t *testing.T) {
	cases := map[string]uint32{
		"":             0,
		"abc":          3,
		"héllo":        5,         // 'é' is single UTF-16 unit
		"\U0001F600":   2,         // surrogate pair = 2 UTF-16 units
		"a\U0001F600b": 1 + 2 + 1, // surrogate pair + ascii
		"\xff":         1,         // invalid byte counted once
	}
	for s, want := range cases {
		if got := utf16StringLen(s); got != want {
			t.Errorf("utf16StringLen(%q) = %d, want %d", s, got, want)
		}
	}
}

func TestDeltaEncode_RoundTrips(t *testing.T) {
	tokens := []semanticToken{
		{line: 1, char: 2, length: 3, tokenType: tokNamespace},
		{line: 1, char: 8, length: 2, tokenType: tokTypeParameter},
		{line: 4, char: 0, length: 4, tokenType: tokMethod, modifiers: modDeclaration},
	}
	data := deltaEncode(tokens)
	if len(data) != len(tokens)*5 {
		t.Fatalf("encoded len = %d, want %d", len(data), len(tokens)*5)
	}
	// First token: deltaLine=line, deltaChar=char, length, type, modifiers
	if data[0] != 1 || data[1] != 2 || data[2] != 3 || data[3] != tokNamespace || data[4] != 0 {
		t.Fatalf("first entry = %v", data[0:5])
	}
	// Second token same line, so deltaLine=0, deltaChar=6
	if data[5] != 0 || data[6] != 6 {
		t.Fatalf("same-line delta = %v", data[5:10])
	}
	// Third token on a new line, so deltaChar should be absolute (=0)
	if data[10] != 3 || data[11] != 0 {
		t.Fatalf("new-line delta = %v", data[10:15])
	}
}

func TestSemanticTokensRangeHandler_Scoped(t *testing.T) {
	env := newCoverageEnv(t)
	handler := NewSemanticTokensRangeHandler(env.cache, nil, nil)

	// Full range covers the whole spec — should return the same set as the
	// non-range handler (or at least a populated slice).
	full, err := handler(env.ctx, &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 200, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("full range handler: %v", err)
	}
	if full == nil || len(full.Data) == 0 {
		t.Fatalf("expected tokens for full-spec range, got %+v", full)
	}

	// Collapsed range (line 0 only) should never return *more* tokens than
	// the full-spec range.
	narrow, err := handler(env.ctx, &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: env.uri},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("narrow range handler: %v", err)
	}
	if narrow != nil && len(narrow.Data) > len(full.Data) {
		t.Fatalf("narrow range produced more tokens (%d) than full range (%d)", len(narrow.Data), len(full.Data))
	}

	// Unknown doc URI should return nil, nil.
	missing, err := handler(env.ctx, &protocol.SemanticTokensRangeParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: protocol.DocumentURI("file:///nope.yaml")},
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 1, Character: 0},
		},
	})
	if err != nil {
		t.Fatalf("unknown URI err: %v", err)
	}
	if missing != nil {
		t.Fatalf("expected nil result for unknown URI, got %+v", missing)
	}
}
