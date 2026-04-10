package navadapt_test

import (
	"testing"

	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	navigator "github.com/sailpoint-oss/navigator"
	navgraph "github.com/sailpoint-oss/navigator/graph"

	"github.com/sailpoint-oss/telescope/server/lsp/navadapt"
)

func TestPositionToProtocol(t *testing.T) {
	tests := []struct {
		name string
		in   navigator.Position
		want protocol.Position
	}{
		{"zero", navigator.Position{Line: 0, Character: 0}, protocol.Position{Line: 0, Character: 0}},
		{"nonzero", navigator.Position{Line: 10, Character: 42}, protocol.Position{Line: 10, Character: 42}},
		{"large", navigator.Position{Line: 99999, Character: 500}, protocol.Position{Line: 99999, Character: 500}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := navadapt.PositionToProtocol(tt.in)
			if got != tt.want {
				t.Errorf("PositionToProtocol(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestPositionFromProtocol(t *testing.T) {
	tests := []struct {
		name string
		in   protocol.Position
		want navigator.Position
	}{
		{"zero", protocol.Position{Line: 0, Character: 0}, navigator.Position{Line: 0, Character: 0}},
		{"nonzero", protocol.Position{Line: 5, Character: 20}, navigator.Position{Line: 5, Character: 20}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := navadapt.PositionFromProtocol(tt.in)
			if got != tt.want {
				t.Errorf("PositionFromProtocol(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestPositionRoundtrip(t *testing.T) {
	orig := navigator.Position{Line: 7, Character: 33}
	got := navadapt.PositionFromProtocol(navadapt.PositionToProtocol(orig))
	if got != orig {
		t.Errorf("roundtrip = %v, want %v", got, orig)
	}
}

func TestRangeToProtocol(t *testing.T) {
	tests := []struct {
		name string
		in   navigator.Range
		want protocol.Range
	}{
		{
			"single line",
			navigator.Range{
				Start: navigator.Position{Line: 1, Character: 0},
				End:   navigator.Position{Line: 1, Character: 10},
			},
			protocol.Range{
				Start: protocol.Position{Line: 1, Character: 0},
				End:   protocol.Position{Line: 1, Character: 10},
			},
		},
		{
			"multi line",
			navigator.Range{
				Start: navigator.Position{Line: 5, Character: 3},
				End:   navigator.Position{Line: 12, Character: 0},
			},
			protocol.Range{
				Start: protocol.Position{Line: 5, Character: 3},
				End:   protocol.Position{Line: 12, Character: 0},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := navadapt.RangeToProtocol(tt.in)
			if got != tt.want {
				t.Errorf("RangeToProtocol(%v) = %v, want %v", tt.in, got, tt.want)
			}
		})
	}
}

func TestRangeFromProtocol(t *testing.T) {
	in := protocol.Range{
		Start: protocol.Position{Line: 2, Character: 5},
		End:   protocol.Position{Line: 4, Character: 0},
	}
	want := navigator.Range{
		Start: navigator.Position{Line: 2, Character: 5},
		End:   navigator.Position{Line: 4, Character: 0},
	}
	got := navadapt.RangeFromProtocol(in)
	if got != want {
		t.Errorf("RangeFromProtocol(%v) = %v, want %v", in, got, want)
	}
}

func TestRangeRoundtrip(t *testing.T) {
	orig := navigator.Range{
		Start: navigator.Position{Line: 3, Character: 8},
		End:   navigator.Position{Line: 9, Character: 15},
	}
	got := navadapt.RangeFromProtocol(navadapt.RangeToProtocol(orig))
	if got != orig {
		t.Errorf("roundtrip = %v, want %v", got, orig)
	}
}

func TestBuildIndex_NilInputs(t *testing.T) {
	if got := navadapt.BuildIndex(nil, nil); got != nil {
		t.Errorf("BuildIndex(nil, nil) = %v, want nil", got)
	}
	if got := navadapt.BuildIndex(nil, &document.Document{}); got != nil {
		t.Errorf("BuildIndex(nil, doc) = %v, want nil", got)
	}
}

func TestIndexCacheAdapter_SetGetDelete(t *testing.T) {
	adapter := navadapt.NewIndexCacheAdapter()
	uri := protocol.DocumentURI("file:///test.yaml")

	if got := adapter.Get(uri); got != nil {
		t.Fatal("expected nil for missing key")
	}

	idx := &navigator.Index{}
	adapter.Set(uri, idx)

	if got := adapter.Get(uri); got != idx {
		t.Error("Get after Set returned wrong index")
	}

	adapter.Delete(uri)

	if got := adapter.Get(uri); got != nil {
		t.Error("Get after Delete should be nil")
	}
}

func TestIndexCacheAdapter_All(t *testing.T) {
	adapter := navadapt.NewIndexCacheAdapter()

	uri1 := protocol.DocumentURI("file:///a.yaml")
	uri2 := protocol.DocumentURI("file:///b.yaml")
	idx1 := &navigator.Index{}
	idx2 := &navigator.Index{}

	adapter.Set(uri1, idx1)
	adapter.Set(uri2, idx2)

	all := adapter.All()
	if len(all) != 2 {
		t.Fatalf("All() returned %d entries, want 2", len(all))
	}
}

func TestIndexCacheAdapter_FindByOperationID_NotFound(t *testing.T) {
	adapter := navadapt.NewIndexCacheAdapter()
	uri, ref := adapter.FindByOperationID("nonexistent")
	if uri != "" || ref != nil {
		t.Errorf("expected empty uri and nil ref, got %q, %v", uri, ref)
	}
}

func TestIndexCacheAdapter_FindRefTarget_NotFound(t *testing.T) {
	adapter := navadapt.NewIndexCacheAdapter()
	uri, val := adapter.FindRefTarget("#/components/schemas/Missing")
	if uri != "" || val != nil {
		t.Errorf("expected empty uri and nil val, got %q, %v", uri, val)
	}
}

func TestIndexCacheAdapter_SetBuilder(t *testing.T) {
	adapter := navadapt.NewIndexCacheAdapter()
	built := &navigator.Index{}

	adapter.SetBuilder(func(uri protocol.DocumentURI) *navigator.Index {
		if uri == "file:///lazy.yaml" {
			return built
		}
		return nil
	})

	got := adapter.Get("file:///lazy.yaml")
	if got != built {
		t.Error("SetBuilder: Get should invoke builder for missing key")
	}

	// Once built, it should be cached.
	got2 := adapter.Get("file:///lazy.yaml")
	if got2 != built {
		t.Error("SetBuilder: second Get should return cached value")
	}
}

func TestNormalizeDocURI(t *testing.T) {
	tests := []struct {
		name string
		in   protocol.DocumentURI
	}{
		{"file uri", "file:///home/user/spec.yaml"},
		{"empty", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := navadapt.NormalizeDocURI(tt.in)
			if tt.in == "" && got != "" {
				t.Errorf("NormalizeDocURI(%q) = %q, want empty", tt.in, got)
			}
			if tt.in != "" && got == "" {
				t.Errorf("NormalizeDocURI(%q) should not be empty", tt.in)
			}
		})
	}
}

func TestNormalizeURI(t *testing.T) {
	tests := []struct {
		name string
		in   string
	}{
		{"file uri", "file:///home/user/spec.yaml"},
		{"empty", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := navadapt.NormalizeURI(tt.in)
			if tt.in == "" && got != "" {
				t.Errorf("NormalizeURI(%q) = %q, want empty", tt.in, got)
			}
			if tt.in != "" && got == "" {
				t.Errorf("NormalizeURI(%q) should not be empty", tt.in)
			}
		})
	}
}

func TestNormalizeDocURI_Idempotent(t *testing.T) {
	uri := protocol.DocumentURI("file:///some/path.yaml")
	first := navadapt.NormalizeDocURI(uri)
	second := navadapt.NormalizeDocURI(protocol.DocumentURI(first))
	if first != second {
		t.Errorf("not idempotent: %q != %q", first, second)
	}
}

func TestStoreProvider_Content(t *testing.T) {
	store := document.NewStore()
	uri := protocol.DocumentURI("file:///doc.yaml")

	provider := &navadapt.StoreProvider{Store: store}

	if _, _, ok := provider.Content(string(uri)); ok {
		t.Error("Content should return ok=false for missing doc")
	}

	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        uri,
			LanguageID: "yaml",
			Version:    1,
			Text:       "openapi: 3.1.0",
		},
	})

	text, ver, ok := provider.Content(string(uri))
	if !ok {
		t.Fatal("Content should return ok=true after Open")
	}
	if text != "openapi: 3.1.0" {
		t.Errorf("text = %q, want %q", text, "openapi: 3.1.0")
	}
	if ver != 1 {
		t.Errorf("version = %d, want 1", ver)
	}
}

func TestDiagnosticToProtocol(t *testing.T) {
	d := navgraph.Diagnostic{
		URI: "file:///spec.yaml",
		Range: navigator.Range{
			Start: navigator.Position{Line: 10, Character: 2},
			End:   navigator.Position{Line: 10, Character: 20},
		},
		Severity: 1,
		Code:     "rule-001",
		Source:   "telescope",
		Message:  "missing description",
	}

	got := navadapt.DiagnosticToProtocol(d)

	if got.Range.Start.Line != 10 || got.Range.Start.Character != 2 {
		t.Errorf("range start = %v, want {10, 2}", got.Range.Start)
	}
	if got.Range.End.Line != 10 || got.Range.End.Character != 20 {
		t.Errorf("range end = %v, want {10, 20}", got.Range.End)
	}
	if got.Severity != protocol.SeverityError {
		t.Errorf("severity = %d, want %d", got.Severity, protocol.SeverityError)
	}
	if got.Code != "rule-001" {
		t.Errorf("code = %v, want %q", got.Code, "rule-001")
	}
	if got.Source != "telescope" {
		t.Errorf("source = %q, want %q", got.Source, "telescope")
	}
	if got.Message != "missing description" {
		t.Errorf("message = %q, want %q", got.Message, "missing description")
	}
}

func TestDiagnosticFromProtocol(t *testing.T) {
	d := protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: 5, Character: 0},
			End:   protocol.Position{Line: 5, Character: 15},
		},
		Severity: protocol.SeverityWarning,
		Code:     "rule-002",
		Source:   "telescope",
		Message:  "should use lowercase",
	}

	got := navadapt.DiagnosticFromProtocol(d, "file:///spec.yaml")

	if got.URI != "file:///spec.yaml" {
		t.Errorf("uri = %q, want %q", got.URI, "file:///spec.yaml")
	}
	if got.Range.Start.Line != 5 || got.Range.Start.Character != 0 {
		t.Errorf("range start = %v, want {5, 0}", got.Range.Start)
	}
	if got.Severity != 2 {
		t.Errorf("severity = %d, want 2", got.Severity)
	}
	if got.Code != "rule-002" {
		t.Errorf("code = %q, want %q", got.Code, "rule-002")
	}
	if got.Source != "telescope" {
		t.Errorf("source = %q, want %q", got.Source, "telescope")
	}
	if got.Message != "should use lowercase" {
		t.Errorf("message = %q, want %q", got.Message, "should use lowercase")
	}
}

func TestDiagnosticFromProtocol_NonStringCode(t *testing.T) {
	d := protocol.Diagnostic{
		Range: protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 5},
		},
		Code:    42,
		Message: "numeric code",
	}

	got := navadapt.DiagnosticFromProtocol(d, "file:///test.yaml")
	if got.Code != "" {
		t.Errorf("non-string code should yield empty string, got %q", got.Code)
	}
}

func TestDiagnosticRoundtrip(t *testing.T) {
	orig := navgraph.Diagnostic{
		URI: "file:///roundtrip.yaml",
		Range: navigator.Range{
			Start: navigator.Position{Line: 3, Character: 4},
			End:   navigator.Position{Line: 3, Character: 12},
		},
		Severity: 2,
		Code:     "warn-01",
		Source:   "test",
		Message:  "roundtrip test",
	}

	proto := navadapt.DiagnosticToProtocol(orig)
	back := navadapt.DiagnosticFromProtocol(proto, orig.URI)

	if back.URI != orig.URI {
		t.Errorf("uri = %q, want %q", back.URI, orig.URI)
	}
	if back.Range != orig.Range {
		t.Errorf("range = %v, want %v", back.Range, orig.Range)
	}
	if back.Severity != orig.Severity {
		t.Errorf("severity = %d, want %d", back.Severity, orig.Severity)
	}
	if back.Code != orig.Code {
		t.Errorf("code = %q, want %q", back.Code, orig.Code)
	}
	if back.Message != orig.Message {
		t.Errorf("message = %q, want %q", back.Message, orig.Message)
	}
}
