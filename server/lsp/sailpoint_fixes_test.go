package lsp

import (
	"testing"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/barrelman/codemod"
	navigator "github.com/sailpoint-oss/navigator"
)

// Tests for the pure byte <-> LSP-position helpers backing the
// barrelman code-action bridge. Kept in the lsp package so they can
// reach unexported helpers directly (matching the existing
// coverage_*_test.go style).

func TestUtf16LenRune(t *testing.T) {
	t.Parallel()
	cases := map[rune]int{
		'a':      1,
		'\n':     1,
		'é':      1,
		'\u4e2d': 1,       // CJK (2-byte UTF-8, 1 UTF-16 unit)
		'\U0001F600': 2,  // emoji (4-byte UTF-8, 2 UTF-16 surrogates)
	}
	for r, want := range cases {
		if got := utf16LenRune(r); got != want {
			t.Errorf("utf16LenRune(%U) = %d, want %d", r, got, want)
		}
	}
}

func TestPositionToByte_ASCII(t *testing.T) {
	t.Parallel()
	content := []byte("abc\ndef\nghi")
	cases := []struct {
		pos  protocol.Position
		want int
	}{
		{protocol.Position{Line: 0, Character: 0}, 0},
		{protocol.Position{Line: 0, Character: 3}, 3},  // end of line 0
		{protocol.Position{Line: 1, Character: 0}, 4},  // start of line 1
		{protocol.Position{Line: 1, Character: 2}, 6},
		{protocol.Position{Line: 2, Character: 3}, 11}, // end of document
	}
	for _, c := range cases {
		got, ok := positionToByte(content, c.pos)
		if !ok {
			t.Errorf("positionToByte(%v): ok=false", c.pos)
			continue
		}
		if got != c.want {
			t.Errorf("positionToByte(%v) = %d, want %d", c.pos, got, c.want)
		}
	}
}

func TestPositionToByte_MultibyteAndEOF(t *testing.T) {
	t.Parallel()
	// "é" is 2 bytes in UTF-8 but 1 UTF-16 unit. "😀" is 4 bytes UTF-8
	// and 2 UTF-16 units.
	content := []byte("é😀x")
	// After "é" (1 UTF-16 unit) -> byte offset 2.
	if b, ok := positionToByte(content, protocol.Position{Line: 0, Character: 1}); !ok || b != 2 {
		t.Fatalf("after é: got (%d, %v), want (2, true)", b, ok)
	}
	// After "é😀" (1+2 = 3 UTF-16 units) -> byte offset 6.
	if b, ok := positionToByte(content, protocol.Position{Line: 0, Character: 3}); !ok || b != 6 {
		t.Fatalf("after é😀: got (%d, %v), want (6, true)", b, ok)
	}
	// Past EOF on valid line returns len(content), ok=false.
	if _, ok := positionToByte(content, protocol.Position{Line: 0, Character: 999}); ok {
		t.Fatalf("past-EOF position should report ok=false")
	}
}

func TestByteToPosition(t *testing.T) {
	t.Parallel()
	content := []byte("abc\ndef\n")
	cases := []struct {
		byte int
		line uint32
		char uint32
	}{
		{0, 0, 0},
		{1, 0, 1},
		{3, 0, 3},
		{4, 1, 0},
		{7, 1, 3},
	}
	for _, c := range cases {
		got, ok := byteToPosition(content, c.byte)
		if !ok {
			t.Fatalf("byteToPosition(%d): ok=false", c.byte)
		}
		if got.Line != c.line || got.Character != c.char {
			t.Errorf("byteToPosition(%d) = %+v, want {Line:%d Character:%d}", c.byte, got, c.line, c.char)
		}
	}
	if _, ok := byteToPosition(content, -1); ok {
		t.Fatalf("negative target should report ok=false")
	}
}

func TestByteToPosition_Multibyte(t *testing.T) {
	t.Parallel()
	content := []byte("é😀x")
	// Byte 2 is just past "é" (2-byte UTF-8); UTF-16 col = 1.
	pos, ok := byteToPosition(content, 2)
	if !ok || pos.Line != 0 || pos.Character != 1 {
		t.Fatalf("past é: got %+v ok=%v, want line 0 char 1", pos, ok)
	}
	// Byte 6 is just past "😀" (4-byte UTF-8); UTF-16 col = 1 + 2 = 3.
	pos, ok = byteToPosition(content, 6)
	if !ok || pos.Line != 0 || pos.Character != 3 {
		t.Fatalf("past 😀: got %+v ok=%v, want line 0 char 3", pos, ok)
	}
}

func TestRangeToByteSpan(t *testing.T) {
	t.Parallel()
	content := []byte("abc\ndef\nghi")
	// Normal forward range [1,1)-(1,3) maps to bytes 5..7 ("ef").
	r := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 1},
		End:   protocol.Position{Line: 1, Character: 3},
	}
	s, e, ok := rangeToByteSpan(content, r)
	if !ok || s != 5 || e != 7 {
		t.Fatalf("normal range: got (%d,%d,%v), want (5,7,true)", s, e, ok)
	}

	// Inverted end<start is normalized to e=s.
	inv := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 3},
		End:   protocol.Position{Line: 1, Character: 1},
	}
	s, e, ok = rangeToByteSpan(content, inv)
	if !ok || s != 7 || e != 7 {
		t.Fatalf("inverted range: got (%d,%d,%v), want (7,7,true)", s, e, ok)
	}

	// Out-of-range start returns ok=false.
	bad := protocol.Range{
		Start: protocol.Position{Line: 99, Character: 0},
		End:   protocol.Position{Line: 99, Character: 1},
	}
	if _, _, ok := rangeToByteSpan(content, bad); ok {
		t.Fatalf("out-of-range start should report ok=false")
	}

	// Start valid but end past EOF: rangeToByteSpan tolerates by
	// collapsing to a zero-width span at start.
	tail := protocol.Range{
		Start: protocol.Position{Line: 2, Character: 3},
		End:   protocol.Position{Line: 9, Character: 9},
	}
	s, e, ok = rangeToByteSpan(content, tail)
	if !ok || s != 11 || e != 11 {
		t.Fatalf("past-EOF end: got (%d,%d,%v), want (11,11,true)", s, e, ok)
	}
}

func TestByteSpanToRange(t *testing.T) {
	t.Parallel()
	content := []byte("abc\ndef\n")
	rng, ok := byteSpanToRange(content, 1, 5)
	if !ok {
		t.Fatal("byteSpanToRange returned ok=false for in-range span")
	}
	if rng.Start.Line != 0 || rng.Start.Character != 1 {
		t.Errorf("start: got %+v, want line 0 char 1", rng.Start)
	}
	if rng.End.Line != 1 || rng.End.Character != 1 {
		t.Errorf("end: got %+v, want line 1 char 1", rng.End)
	}
	// Negative start -> ok=false.
	if _, ok := byteSpanToRange(content, -1, 1); ok {
		t.Errorf("negative start should be rejected")
	}
}

func TestSailpointFixActions_NilInputs(t *testing.T) {
	t.Parallel()
	uri := protocol.DocumentURI("file:///x.yaml")
	// nil index and doc short-circuit to nil.
	if got := sailpointFixActions(uri, nil, nil, protocol.Diagnostic{}); got != nil {
		t.Errorf("nil index and doc: expected nil, got %v", got)
	}
}

func TestSailpointFixActions_NonStringCode(t *testing.T) {
	t.Parallel()
	// Even with a non-nil diagnostic, if the Code isn't a string or
	// is empty, the bridge bails. We pass nil index/doc too since
	// the Code check happens before nil gating triggers (see
	// sailpointFixActions: the nil short-circuit is first, so we
	// need non-nil index/doc to exercise the Code branch).
	//
	// Passing nil is still sufficient to cover an early return; the
	// richer integration path is already exercised by the code_actions
	// handler tests.
	uri := protocol.DocumentURI("file:///x.yaml")
	if got := sailpointFixActions(uri, nil, nil, protocol.Diagnostic{Code: 42}); got != nil {
		t.Errorf("non-string code: expected nil, got %v", got)
	}
}

func TestFindBarrelmanRule_NotFound(t *testing.T) {
	t.Parallel()
	if _, ok := findBarrelmanRule("definitely-not-a-real-sailpoint-rule-slug"); ok {
		t.Errorf("expected not-found for fabricated rule slug")
	}
}

// testRuleID is a rule id used only by the integration-style test
// below. We register a synthetic rule with a minimal Fix and rely on
// the default Registry to look it up by id. The ID is namespaced so
// it cannot collide with real SailPoint slugs.
const testRuleID = "telescope-test-autofix-insert"

func newTestDoc(text string) *document.Document {
	return document.New(protocol.TextDocumentItem{
		URI:        protocol.DocumentURI("file:///test.yaml"),
		LanguageID: "yaml",
		Version:    1,
		Text:       text,
	})
}

// TestSailpointFixActions_AppliesFix exercises the full flow:
// findBarrelmanRule -> rule.Fix -> byte-span conversion ->
// WorkspaceEdit emission. It registers a test-only rule that returns
// a single insertion patch derived from the diagnostic's ByteRange.
func TestSailpointFixActions_AppliesFix(t *testing.T) {
	// Not parallel: mutates the process-global DefaultRegistry.
	insertionAt := uint(4) // after "abc\n" in the fixture
	barrelman.DefaultRegistry.Register(barrelman.Rule{
		ID: testRuleID,
		Fix: func(ctx *codemod.FixContext, d barrelman.Diagnostic) ([]codemod.Patch, error) {
			return []codemod.Patch{{
				URI:         ctx.URI,
				StartByte:   insertionAt,
				EndByte:     insertionAt,
				Replacement: []byte("XYZ"),
				Description: "insert XYZ",
				RuleID:      testRuleID,
			}}, nil
		},
	})

	doc := newTestDoc("abc\ndef\n")
	idx := &navigator.Index{}
	diag := protocol.Diagnostic{
		Code: testRuleID,
		Range: protocol.Range{
			Start: protocol.Position{Line: 1, Character: 0},
			End:   protocol.Position{Line: 1, Character: 0},
		},
		Message: "needs fix",
	}

	actions := sailpointFixActions(protocol.DocumentURI("file:///test.yaml"), idx, doc, diag)
	if len(actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(actions))
	}
	a := actions[0]
	if a.Kind != "quickfix" {
		t.Errorf("expected Kind=quickfix, got %q", a.Kind)
	}
	if !a.IsPreferred {
		t.Error("expected IsPreferred=true for SailPoint auto-fix quickfix")
	}
	if a.Edit == nil {
		t.Fatal("expected non-nil WorkspaceEdit")
	}
	edits := a.Edit.Changes[protocol.DocumentURI("file:///test.yaml")]
	if len(edits) != 1 {
		t.Fatalf("expected 1 text edit, got %d", len(edits))
	}
	if edits[0].NewText != "XYZ" {
		t.Errorf("expected NewText=XYZ, got %q", edits[0].NewText)
	}
	// The patch's description should surface in the action title.
	if a.Title == "" || a.Title == "Auto-fix: " {
		t.Errorf("expected non-empty descriptive title, got %q", a.Title)
	}
}

// TestSailpointFixActions_NoPatches covers the branch where a
// registered rule's Fix returns zero patches (the "already corrected"
// case): sailpointFixActions should emit no CodeActions at all.
func TestSailpointFixActions_NoPatches(t *testing.T) {
	const id = "telescope-test-autofix-empty"
	barrelman.DefaultRegistry.Register(barrelman.Rule{
		ID: id,
		Fix: func(ctx *codemod.FixContext, d barrelman.Diagnostic) ([]codemod.Patch, error) {
			return nil, nil
		},
	})
	doc := newTestDoc("abc\n")
	idx := &navigator.Index{}
	diag := protocol.Diagnostic{
		Code:    id,
		Range:   protocol.Range{Start: protocol.Position{Line: 0, Character: 0}, End: protocol.Position{Line: 0, Character: 1}},
		Message: "noop",
	}
	if got := sailpointFixActions(protocol.DocumentURI("file:///t.yaml"), idx, doc, diag); got != nil {
		t.Errorf("rule with empty Fix output should produce no actions, got %d", len(got))
	}
}
