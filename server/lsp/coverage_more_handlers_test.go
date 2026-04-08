package lsp

import (
	"strings"
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestComponentNamesForKind_NilIndex(t *testing.T) {
	got := componentNamesForKind(nil, "schemas")
	if got != nil {
		t.Errorf("expected nil for nil index, got %v", got)
	}
}

func TestComponentNamesForKind_NilDocument(t *testing.T) {
	idx := &openapi.Index{}
	got := componentNamesForKind(idx, "schemas")
	if got != nil {
		t.Errorf("expected nil for nil document, got %v", got)
	}
}

func TestComponentNamesForKind_PathItems(t *testing.T) {
	idx := &openapi.Index{
		Document: &openapi.Document{
			Components: &openapi.Components{
				PathItems: map[string]*openapi.PathItem{
					"MyPath":    {},
					"OtherPath": {},
				},
			},
		},
	}
	got := componentNamesForKind(idx, "pathItems")
	if len(got) != 2 {
		t.Errorf("expected 2 path items, got %d", len(got))
	}
}

func TestSuggestionFromMessage(t *testing.T) {
	tests := []struct {
		msg, want string
	}{
		{"Did you mean 'UserResponse'? Check spelling.", "UserResponse"},
		{"No suggestion here", ""},
		{"Did you mean '", ""},
		{"Did you mean 'foo' and 'bar'?", "foo"},
	}
	for _, tt := range tests {
		got := suggestionFromMessage(tt.msg)
		if got != tt.want {
			t.Errorf("suggestionFromMessage(%q) = %q, want %q", tt.msg, got, tt.want)
		}
	}
}

func TestSymbolKindForComponent(t *testing.T) {
	tests := []struct {
		kind string
		want protocol.SymbolKind
	}{
		{"schemas", protocol.SymbolClass},
		{"parameters", protocol.SymbolVariable},
		{"responses", protocol.SymbolField},
		{"securitySchemes", protocol.SymbolProperty},
		{"requestBodies", protocol.SymbolStruct},
		{"examples", protocol.SymbolField},
		{"unknown", protocol.SymbolField},
	}
	for _, tt := range tests {
		got := symbolKindForComponent(tt.kind)
		if got != tt.want {
			t.Errorf("symbolKindForComponent(%q) = %d, want %d", tt.kind, got, tt.want)
		}
	}
}

func TestResolveRefTarget_EmptyRef(t *testing.T) {
	got := resolveRefTarget("file:///test.yaml", "")
	if got != nil {
		t.Error("expected nil for empty ref")
	}
}

func TestResolveRefTarget_LocalRef(t *testing.T) {
	got := resolveRefTarget("file:///test.yaml", "#/components/schemas/Pet")
	if got != nil {
		t.Error("expected nil for local ref (handled by definition providers)")
	}
}

func TestResolveRefTarget_ExternalRef(t *testing.T) {
	got := resolveRefTarget("file:///dir/test.yaml", "./models.yaml#/components/schemas/Pet")
	if got == nil {
		t.Fatal("expected non-nil for external ref")
	}
	uri := string(*got)
	if !strings.Contains(uri, "models.yaml") {
		t.Errorf("expected models.yaml in resolved URI, got %q", uri)
	}
	if !strings.Contains(uri, "#/components/schemas/Pet") {
		t.Errorf("expected fragment preserved, got %q", uri)
	}
}

func TestResolveRefTarget_ExternalRefNoFragment(t *testing.T) {
	got := resolveRefTarget("file:///dir/test.yaml", "./common.yaml")
	if got == nil {
		t.Fatal("expected non-nil for external ref without fragment")
	}
	uri := string(*got)
	if !strings.Contains(uri, "common.yaml") {
		t.Errorf("expected common.yaml in URI, got %q", uri)
	}
}

func TestRangeLen_SingleLine(t *testing.T) {
	r := protocol.Range{
		Start: protocol.Position{Line: 5, Character: 2},
		End:   protocol.Position{Line: 5, Character: 10},
	}
	if got := rangeLen(r); got != 8 {
		t.Errorf("rangeLen = %d, want 8", got)
	}
}

func TestRangeLen_MultiLine(t *testing.T) {
	r := protocol.Range{
		Start: protocol.Position{Line: 5, Character: 2},
		End:   protocol.Position{Line: 7, Character: 10},
	}
	if got := rangeLen(r); got != 0 {
		t.Errorf("rangeLen multiline = %d, want 0", got)
	}
}

func TestRangeLen_ZeroWidth(t *testing.T) {
	r := protocol.Range{
		Start: protocol.Position{Line: 5, Character: 5},
		End:   protocol.Position{Line: 5, Character: 5},
	}
	if got := rangeLen(r); got != 0 {
		t.Errorf("rangeLen zero width = %d, want 0", got)
	}
}

func TestIsZeroRange(t *testing.T) {
	if !isZeroRange(protocol.Range{}) {
		t.Error("expected zero range for default")
	}
	nonZero := protocol.Range{Start: protocol.Position{Line: 1}}
	if isZeroRange(nonZero) {
		t.Error("expected non-zero range")
	}
}

func TestIsSecurityContext(t *testing.T) {
	tests := []struct {
		line string
		want bool
	}{
		{"security:", true},
		{"  security:", true},
		{"  - BearerAuth: []", true},
		{"  - OAuth2:", true},
		{"description: a security thing", false},
		{"paths:", false},
	}
	for _, tt := range tests {
		got := isSecurityContext(tt.line)
		if got != tt.want {
			t.Errorf("isSecurityContext(%q) = %v, want %v", tt.line, got, tt.want)
		}
	}
}

func TestIsTagContext(t *testing.T) {
	tests := []struct {
		line string
		want bool
	}{
		{"tags:", true},
		{"  tags:", true},
		{"  - Pets", true},
		{"description: some text", false},
	}
	for _, tt := range tests {
		got := isTagContext(tt.line)
		if got != tt.want {
			t.Errorf("isTagContext(%q) = %v, want %v", tt.line, got, tt.want)
		}
	}
}

func TestDeltaEncode(t *testing.T) {
	tokens := []semanticToken{
		{line: 1, char: 5, length: 3, tokenType: tokMethod, modifiers: 0},
		{line: 1, char: 10, length: 4, tokenType: tokFunction, modifiers: 0},
		{line: 3, char: 2, length: 6, tokenType: tokType, modifiers: modDeclaration},
	}
	data := deltaEncode(tokens)
	if len(data) != 15 {
		t.Errorf("expected 15 values (3 tokens * 5), got %d", len(data))
	}
	// First token: deltaLine=1, deltaChar=5, length=3, type=tokMethod, mod=0
	if data[0] != 1 || data[1] != 5 || data[2] != 3 {
		t.Errorf("first token encoding wrong: %v", data[:5])
	}
	// Second token same line: deltaLine=0, deltaChar=5 (10-5)
	if data[5] != 0 || data[6] != 5 {
		t.Errorf("second token delta wrong: %v", data[5:10])
	}
	// Third token: deltaLine=2 (3-1), deltaChar=2
	if data[10] != 2 || data[11] != 2 {
		t.Errorf("third token delta wrong: %v", data[10:15])
	}
}

func TestByteOffsetToUTF16_ASCII(t *testing.T) {
	s := "hello world"
	got := byteOffsetToUTF16(s, 5)
	if got != 5 {
		t.Errorf("expected 5, got %d", got)
	}
}

func TestByteOffsetToUTF16_Multibyte(t *testing.T) {
	s := "a\u00e9b"
	got := byteOffsetToUTF16(s, 3)
	if got != 2 {
		t.Errorf("expected 2 UTF-16 units for 'a' + 'e-acute', got %d", got)
	}
}

func TestUtf16StringLen(t *testing.T) {
	if got := utf16StringLen("hello"); got != 5 {
		t.Errorf("expected 5, got %d", got)
	}
	if got := utf16StringLen(""); got != 0 {
		t.Errorf("expected 0, got %d", got)
	}
}

func TestLevenshteinDistance(t *testing.T) {
	tests := []struct {
		a, b string
		want int
	}{
		{"", "", 0},
		{"abc", "", 3},
		{"", "xyz", 3},
		{"kitten", "sitting", 3},
		{"same", "same", 0},
	}
	for _, tt := range tests {
		got := levenshteinDistance(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("levenshteinDistance(%q, %q) = %d, want %d", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestClosestStringSuggestion(t *testing.T) {
	candidates := []string{"UserResponse", "UserRequest", "ItemResponse"}

	if got := closestStringSuggestion("", candidates); got != "" {
		t.Errorf("expected empty for empty target, got %q", got)
	}
	if got := closestStringSuggestion("target", nil); got != "" {
		t.Errorf("expected empty for nil candidates, got %q", got)
	}

	got := closestStringSuggestion("UserRespons", candidates)
	if got != "UserResponse" {
		t.Errorf("expected UserResponse, got %q", got)
	}
}

func TestEscapeUnescapePointerSegment(t *testing.T) {
	original := "my/tilded~name"
	escaped := escapePointerSegment(original)
	if !strings.Contains(escaped, "~1") {
		t.Errorf("expected / escaped to ~1, got %q", escaped)
	}
	if !strings.Contains(escaped, "~0") {
		t.Errorf("expected ~ escaped to ~0, got %q", escaped)
	}

	back := unescapePointerSegment(escaped)
	if back != original {
		t.Errorf("roundtrip failed: got %q, want %q", back, original)
	}
}

func TestGenerateOperationID(t *testing.T) {
	tests := []struct {
		method, path, want string
	}{
		{"get", "/users", "getUsers"},
		{"post", "/users/{id}/orders", "postUsersIdOrders"},
		{"delete", "/items", "deleteItems"},
		{"get", "/", "get"},
	}
	for _, tt := range tests {
		got := generateOperationID(tt.method, tt.path)
		if got != tt.want {
			t.Errorf("generateOperationID(%q, %q) = %q, want %q", tt.method, tt.path, got, tt.want)
		}
	}
}

func TestCapitalizeFirst(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", ""},
		{"hello", "Hello"},
		{"Hello", "Hello"},
		{"a", "A"},
	}
	for _, tt := range tests {
		got := capitalizeFirst(tt.in)
		if got != tt.want {
			t.Errorf("capitalizeFirst(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestToKebabCase(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"/users", "/users"},
		{"/userAccounts", "/user-accounts"},
		{"/users/{userId}/orders", "/users/{userId}/orders"},
		{"/MyResource", "/my-resource"},
	}
	for _, tt := range tests {
		got := toKebabCase(tt.in)
		if got != tt.want {
			t.Errorf("toKebabCase(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestCamelToKebab(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"camelCase", "camel-case"},
		{"already-kebab", "already-kebab"},
		{"PascalCase", "pascal-case"},
		{"simple", "simple"},
	}
	for _, tt := range tests {
		got := camelToKebab(tt.in)
		if got != tt.want {
			t.Errorf("camelToKebab(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestInferResourceName(t *testing.T) {
	tests := []struct {
		path, want string
	}{
		{"/users", "user"},
		{"/users/{id}", "user"},
		{"/items/{itemId}/details", "detail"},
		{"/resource", "resource"},
		{"/{onlyParam}", "resource"},
	}
	for _, tt := range tests {
		got := inferResourceName(tt.path)
		if got != tt.want {
			t.Errorf("inferResourceName(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestRangeContains(t *testing.T) {
	outer := protocol.Range{
		Start: protocol.Position{Line: 5, Character: 0},
		End:   protocol.Position{Line: 10, Character: 20},
	}
	inside := protocol.Range{
		Start: protocol.Position{Line: 6, Character: 2},
		End:   protocol.Position{Line: 8, Character: 10},
	}
	outside := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 0},
		End:   protocol.Position{Line: 3, Character: 0},
	}

	if !rangeContains(outer, inside) {
		t.Error("expected inner range to be contained")
	}
	if rangeContains(outer, outside) {
		t.Error("expected outer range to NOT contain outside range")
	}
}

func TestDiagnosticsContain(t *testing.T) {
	diags := []protocol.Diagnostic{
		{Message: "Missing required field `info.title`"},
		{Message: "Unknown property foo"},
	}
	if !diagnosticsContain(diags, "`info.") {
		t.Error("expected match for info. needle")
	}
	if diagnosticsContain(diags, "nonexistent") {
		t.Error("expected no match for nonexistent needle")
	}
}

func TestNormalizeRelativeRefPath(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", ""},
		{"../models.yaml", "../models.yaml"},
		{"./models.yaml", "./models.yaml"},
		{"models.yaml", "./models.yaml"},
	}
	for _, tt := range tests {
		got := normalizeRelativeRefPath(tt.in)
		if got != tt.want {
			t.Errorf("normalizeRelativeRefPath(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestLeadingWhitespace(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"  hello", "  "},
		{"\thello", "\t"},
		{"hello", ""},
		{"", ""},
	}
	for _, tt := range tests {
		got := leadingWhitespace(tt.in)
		if got != tt.want {
			t.Errorf("leadingWhitespace(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestNestedIndent(t *testing.T) {
	got := nestedIndent("    key: value")
	if got != "      " {
		t.Errorf("expected 6 spaces, got %q", got)
	}
}
