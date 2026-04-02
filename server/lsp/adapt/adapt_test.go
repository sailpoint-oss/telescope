package adapt_test

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/lsp/adapt"
)

func TestPositionRoundTrip(t *testing.T) {
	cases := []ctypes.Position{
		{Line: 0, Character: 0},
		{Line: 10, Character: 42},
		{Line: 999, Character: 80},
	}
	for _, c := range cases {
		p := adapt.PositionToProtocol(c)
		back := adapt.PositionFromProtocol(p)
		if back != c {
			t.Errorf("round-trip failed: got %+v, want %+v", back, c)
		}
	}
}

func TestRangeRoundTrip(t *testing.T) {
	r := ctypes.Range{
		Start: ctypes.Position{Line: 1, Character: 5},
		End:   ctypes.Position{Line: 3, Character: 10},
	}
	pr := adapt.RangeToProtocol(r)
	back := adapt.RangeFromProtocol(pr)
	if back != r {
		t.Errorf("round-trip failed: got %+v, want %+v", back, r)
	}
}

func TestSeverityRoundTrip(t *testing.T) {
	severities := []ctypes.Severity{1, 2, 3, 4}
	for _, s := range severities {
		ps := adapt.SeverityToProtocol(s)
		back := adapt.SeverityFromProtocol(ps)
		if back != s {
			t.Errorf("round-trip failed for severity %d", s)
		}
	}
}

func TestDiagnosticToProtocol_FullFields(t *testing.T) {
	d := ctypes.Diagnostic{
		Range: ctypes.Range{
			Start: ctypes.Position{Line: 1, Character: 0},
			End:   ctypes.Position{Line: 1, Character: 10},
		},
		Severity:        2,
		Code:            "test-rule",
		CodeDescription: "https://example.com/rules/test",
		Source:          "telescope",
		Message:         "test message",
		Tags:            []ctypes.DiagnosticTag{1},
		Related: []ctypes.RelatedInformation{
			{
				URI:     "file:///other.yaml",
				Range:   ctypes.Range{Start: ctypes.Position{Line: 5, Character: 0}, End: ctypes.Position{Line: 5, Character: 5}},
				Message: "related info",
			},
		},
		Data: map[string]string{"key": "value"},
	}

	pd := adapt.DiagnosticToProtocol(d)

	if pd.Range.Start.Line != 1 || pd.Range.End.Character != 10 {
		t.Errorf("range mismatch: %+v", pd.Range)
	}
	if pd.Severity != 2 {
		t.Errorf("severity mismatch: got %d", pd.Severity)
	}
	if pd.Code != "test-rule" {
		t.Errorf("code mismatch: got %v", pd.Code)
	}
	if pd.CodeDescription == nil || string(pd.CodeDescription.Href) != "https://example.com/rules/test" {
		t.Error("code description mismatch")
	}
	if pd.Source != "telescope" {
		t.Errorf("source mismatch: got %s", pd.Source)
	}
	if pd.Message != "test message" {
		t.Errorf("message mismatch: got %s", pd.Message)
	}
	if len(pd.Tags) != 1 || pd.Tags[0] != 1 {
		t.Errorf("tags mismatch: got %v", pd.Tags)
	}
	if len(pd.RelatedInformation) != 1 || pd.RelatedInformation[0].Message != "related info" {
		t.Errorf("related info mismatch: got %v", pd.RelatedInformation)
	}
	if pd.Data == nil {
		t.Error("data should be preserved")
	}
}

func TestDiagnosticToProtocol_MinimalFields(t *testing.T) {
	d := ctypes.Diagnostic{
		Message: "simple",
	}
	pd := adapt.DiagnosticToProtocol(d)
	if pd.Message != "simple" {
		t.Errorf("message mismatch: got %s", pd.Message)
	}
	if pd.Code != nil {
		t.Errorf("code should be nil for empty code, got %v", pd.Code)
	}
	if pd.CodeDescription != nil {
		t.Error("code description should be nil")
	}
	if pd.Tags != nil {
		t.Error("tags should be nil")
	}
	if pd.RelatedInformation != nil {
		t.Error("related info should be nil")
	}
}

func TestDiagnosticFromProtocol_StringCode(t *testing.T) {
	pd := protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: 2, Character: 0},
			End:   protocol.Position{Line: 2, Character: 5},
		},
		Severity: 1,
		Code:     "my-code",
		CodeDescription: &protocol.CodeDescription{
			Href: "https://example.com",
		},
		Source:  "test",
		Message: "test message",
		Tags:    []protocol.DiagnosticTag{2},
		RelatedInformation: []protocol.DiagnosticRelatedInformation{
			{
				Location: protocol.Location{
					URI:   "file:///rel.yaml",
					Range: protocol.Range{Start: protocol.Position{Line: 0}, End: protocol.Position{Line: 0}},
				},
				Message: "related",
			},
		},
	}

	cd := adapt.DiagnosticFromProtocol(pd)
	if cd.Code != "my-code" {
		t.Errorf("code mismatch: got %q", cd.Code)
	}
	if cd.CodeDescription != "https://example.com" {
		t.Errorf("code description mismatch: got %q", cd.CodeDescription)
	}
	if len(cd.Tags) != 1 || cd.Tags[0] != 2 {
		t.Errorf("tags mismatch: %v", cd.Tags)
	}
	if len(cd.Related) != 1 || cd.Related[0].URI != "file:///rel.yaml" {
		t.Errorf("related mismatch: %v", cd.Related)
	}
}

func TestDiagnosticsToProtocol_Nil(t *testing.T) {
	result := adapt.DiagnosticsToProtocol(nil)
	if result != nil {
		t.Error("expected nil for nil input")
	}
}

func TestDiagnosticsToProtocol_Empty(t *testing.T) {
	result := adapt.DiagnosticsToProtocol([]ctypes.Diagnostic{})
	if result != nil {
		t.Error("expected nil for empty input")
	}
}

func TestDiagnosticsFromProtocol_Nil(t *testing.T) {
	result := adapt.DiagnosticsFromProtocol(nil)
	if result != nil {
		t.Error("expected nil for nil input")
	}
}

func TestTextEditRoundTrip(t *testing.T) {
	e := ctypes.TextEdit{
		Range: ctypes.Range{
			Start: ctypes.Position{Line: 1, Character: 0},
			End:   ctypes.Position{Line: 1, Character: 5},
		},
		NewText: "replaced",
	}
	pe := adapt.TextEditToProtocol(e)
	back := adapt.TextEditFromProtocol(pe)
	if back.Range != e.Range || back.NewText != e.NewText {
		t.Errorf("round-trip failed: got %+v, want %+v", back, e)
	}
}

func TestTextEditsToProtocol_Nil(t *testing.T) {
	result := adapt.TextEditsToProtocol(nil)
	if result != nil {
		t.Error("expected nil for nil input")
	}
}

func TestTextEditsToProtocol_Multiple(t *testing.T) {
	edits := []ctypes.TextEdit{
		{Range: ctypes.Range{Start: ctypes.Position{Line: 0}}, NewText: "a"},
		{Range: ctypes.Range{Start: ctypes.Position{Line: 1}}, NewText: "b"},
	}
	result := adapt.TextEditsToProtocol(edits)
	if len(result) != 2 {
		t.Fatalf("expected 2 edits, got %d", len(result))
	}
	if result[0].NewText != "a" || result[1].NewText != "b" {
		t.Error("text mismatch")
	}
}

func TestDiagnosticRoundTrip(t *testing.T) {
	d := ctypes.Diagnostic{
		Range: ctypes.Range{
			Start: ctypes.Position{Line: 10, Character: 5},
			End:   ctypes.Position{Line: 10, Character: 20},
		},
		Severity: 1,
		Code:     "round-trip-code",
		Source:   "test",
		Message:  "round-trip test",
	}
	pd := adapt.DiagnosticToProtocol(d)
	back := adapt.DiagnosticFromProtocol(pd)
	if back.Range != d.Range {
		t.Errorf("range mismatch: got %+v, want %+v", back.Range, d.Range)
	}
	if back.Code != d.Code {
		t.Errorf("code mismatch: got %q, want %q", back.Code, d.Code)
	}
	if back.Message != d.Message {
		t.Errorf("message mismatch: got %q, want %q", back.Message, d.Message)
	}
}

func TestDiagnosticsSliceRoundTrip(t *testing.T) {
	diags := []ctypes.Diagnostic{
		{Message: "first", Source: "a"},
		{Message: "second", Source: "b"},
	}
	pds := adapt.DiagnosticsToProtocol(diags)
	back := adapt.DiagnosticsFromProtocol(pds)
	if len(back) != 2 {
		t.Fatalf("expected 2, got %d", len(back))
	}
	if back[0].Message != "first" || back[1].Message != "second" {
		t.Error("message mismatch after round-trip")
	}
}
