package lsp

import (
	"testing"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/barrelman"
	"github.com/sailpoint-oss/barrelman/codemod"
	navigator "github.com/sailpoint-oss/navigator"
)

func TestPositionToByteASCII(t *testing.T) {
	t.Parallel()
	content := []byte("abc\ndef\nghi")
	cases := []struct {
		pos  protocol.Position
		want int
	}{
		{protocol.Position{Line: 0, Character: 0}, 0},
		{protocol.Position{Line: 0, Character: 3}, 3},
		{protocol.Position{Line: 1, Character: 0}, 4},
		{protocol.Position{Line: 1, Character: 2}, 6},
		{protocol.Position{Line: 2, Character: 3}, 11},
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

func TestRangeToByteSpan(t *testing.T) {
	t.Parallel()
	content := []byte("abc\ndef\nghi")
	r := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 1},
		End:   protocol.Position{Line: 1, Character: 3},
	}
	s, e, ok := rangeToByteSpan(content, r)
	if !ok || s != 5 || e != 7 {
		t.Fatalf("normal range: got (%d,%d,%v), want (5,7,true)", s, e, ok)
	}

	inv := protocol.Range{
		Start: protocol.Position{Line: 1, Character: 3},
		End:   protocol.Position{Line: 1, Character: 1},
	}
	s, e, ok = rangeToByteSpan(content, inv)
	if !ok || s != 7 || e != 7 {
		t.Fatalf("inverted range: got (%d,%d,%v), want (7,7,true)", s, e, ok)
	}
}

func TestRuleFixActionsNilInputs(t *testing.T) {
	t.Parallel()
	uri := protocol.DocumentURI("file:///x.yaml")
	if got := ruleFixActions(uri, nil, nil, protocol.Diagnostic{}); got != nil {
		t.Errorf("nil index and doc: expected nil, got %v", got)
	}
}

func TestFindBarrelmanRuleNotFound(t *testing.T) {
	t.Parallel()
	if _, ok := findBarrelmanRule("definitely-not-a-real-test-rule"); ok {
		t.Errorf("expected not-found for fabricated rule slug")
	}
}

const testRuleID = "telescope-test-autofix-insert"

func newTestDoc(text string) *document.Document {
	return document.New(protocol.TextDocumentItem{
		URI:        protocol.DocumentURI("file:///test.yaml"),
		LanguageID: "yaml",
		Version:    1,
		Text:       text,
	})
}

func TestRuleFixActionsAppliesFix(t *testing.T) {
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

	actions := ruleFixActions(protocol.DocumentURI("file:///test.yaml"), idx, doc, diag)
	if len(actions) != 1 {
		t.Fatalf("expected 1 action, got %d", len(actions))
	}
	a := actions[0]
	if a.Kind != "quickfix" {
		t.Errorf("expected Kind=quickfix, got %q", a.Kind)
	}
	if !a.IsPreferred {
		t.Error("expected IsPreferred=true for auto-fix quickfix")
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
}

func TestRuleFixActionsNoPatches(t *testing.T) {
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
	if got := ruleFixActions(protocol.DocumentURI("file:///t.yaml"), idx, doc, diag); got != nil {
		t.Errorf("rule with empty Fix output should produce no actions, got %d", len(got))
	}
}
