package lsp

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/lsp/bun"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestDoubleStarMatch(t *testing.T) {
	tests := []struct {
		name    string
		pattern string
		path    string
		want    bool
	}{
		{"no doublestar delegates to filepath.Match", "*.yaml", "openapi.yaml", true},
		{"no doublestar mismatch", "*.yaml", "openapi.json", false},
		{"doublestar matches everything when suffix empty", "**", "a/b/c.yaml", true},
		{"prefix and suffix match", "src/**/*.yaml", "src/v3/openapi.yaml", true},
		{"prefix and suffix deep nesting", "src/**/*.yaml", "src/a/b/c/openapi.yaml", true},
		{"prefix mismatch", "src/**/*.yaml", "lib/v3/openapi.yaml", false},
		{"suffix mismatch", "src/**/*.yaml", "src/v3/openapi.json", false},
		{"suffix only match", "**/*.json", "deep/nested/file.json", true},
		{"suffix only mismatch", "**/*.json", "deep/nested/file.yaml", false},
		{"prefix only no suffix", "docs/**", "docs/readme.md", true},
		{"empty path with doublestar", "**", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := doubleStarMatch(tt.pattern, tt.path)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Errorf("doubleStarMatch(%q, %q) = %v, want %v", tt.pattern, tt.path, got, tt.want)
			}
		})
	}
}

func TestMatchesFilePatterns(t *testing.T) {
	root := "/workspace"

	tests := []struct {
		name     string
		docURI   string
		patterns []string
		want     bool
	}{
		{"empty patterns matches everything", "file:///workspace/api.yaml", nil, true},
		{"simple glob match", "file:///workspace/openapi.yaml", []string{"*.yaml"}, true},
		{"simple glob no match", "file:///workspace/openapi.json", []string{"*.yaml"}, false},
		{"doublestar pattern match", "file:///workspace/specs/v3/api.yaml", []string{"**/*.yaml"}, true},
		{"outside workspace returns false", "file:///other/api.yaml", []string{"*.yaml"}, false},
		{"nested file matches directory glob", "file:///workspace/src/api.yaml", []string{"src/*.yaml"}, true},
		{"multiple patterns first matches", "file:///workspace/a.json", []string{"*.json", "*.yaml"}, true},
		{"multiple patterns second matches", "file:///workspace/a.yaml", []string{"*.json", "*.yaml"}, true},
		{"multiple patterns none match", "file:///workspace/a.txt", []string{"*.json", "*.yaml"}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := matchesFilePatterns(tt.docURI, root, tt.patterns)
			if got != tt.want {
				t.Errorf("matchesFilePatterns(%q, %q, %v) = %v, want %v",
					tt.docURI, root, tt.patterns, got, tt.want)
			}
		})
	}
}

func TestSidecarDiagsToProtocol_Empty(t *testing.T) {
	result := sidecarDiagsToProtocol(nil)
	if len(result) != 0 {
		t.Fatalf("expected empty slice, got %d items", len(result))
	}
}

func TestSidecarDiagsToProtocol_ValidSeverities(t *testing.T) {
	diags := []bun.SidecarDiagnostic{
		{Severity: 1, StartLine: 0, StartChar: 0, EndLine: 0, EndChar: 5, Source: "test", Message: "error", Code: "E001"},
		{Severity: 2, StartLine: 1, StartChar: 0, EndLine: 1, EndChar: 10, Source: "test", Message: "warning"},
		{Severity: 3, StartLine: 2, StartChar: 0, EndLine: 2, EndChar: 8, Source: "test", Message: "info"},
		{Severity: 4, StartLine: 3, StartChar: 0, EndLine: 3, EndChar: 3, Source: "test", Message: "hint"},
	}

	result := sidecarDiagsToProtocol(diags)
	if len(result) != 4 {
		t.Fatalf("expected 4 diagnostics, got %d", len(result))
	}

	wantSeverities := []protocol.DiagnosticSeverity{
		protocol.SeverityError,
		protocol.SeverityWarning,
		protocol.SeverityInformation,
		protocol.SeverityHint,
	}
	for i, want := range wantSeverities {
		if result[i].Severity != want {
			t.Errorf("diag[%d].Severity = %d, want %d", i, result[i].Severity, want)
		}
	}

	if result[0].Code != "E001" {
		t.Errorf("diag[0].Code = %q, want %q", result[0].Code, "E001")
	}
	if result[1].Code != nil {
		t.Errorf("diag[1].Code should be nil when input code is empty, got %v", result[1].Code)
	}
}

func TestSidecarDiagsToProtocol_InvalidSeverity(t *testing.T) {
	diags := []bun.SidecarDiagnostic{
		{Severity: 0, Message: "too low"},
		{Severity: 5, Message: "too high"},
		{Severity: 99, Message: "way too high"},
	}

	result := sidecarDiagsToProtocol(diags)
	for i, d := range result {
		if d.Severity != protocol.SeverityWarning {
			t.Errorf("diag[%d].Severity = %d, want %d (SeverityWarning)", i, d.Severity, protocol.SeverityWarning)
		}
	}
}

func TestSidecarDiagsToProtocol_RangeMapping(t *testing.T) {
	diags := []bun.SidecarDiagnostic{
		{Severity: 1, StartLine: 10, StartChar: 5, EndLine: 12, EndChar: 20, Source: "src", Message: "msg"},
	}

	result := sidecarDiagsToProtocol(diags)
	r := result[0].Range
	if r.Start.Line != 10 || r.Start.Character != 5 {
		t.Errorf("start = (%d,%d), want (10,5)", r.Start.Line, r.Start.Character)
	}
	if r.End.Line != 12 || r.End.Character != 20 {
		t.Errorf("end = (%d,%d), want (12,20)", r.End.Line, r.End.Character)
	}
}

func TestCompositionVariantNames(t *testing.T) {
	tests := []struct {
		name    string
		schemas []*openapi.Schema
		want    []string
	}{
		{"nil schemas", nil, nil},
		{"ref schemas", []*openapi.Schema{
			{Ref: "#/components/schemas/Pet"},
			{Ref: "#/components/schemas/Dog"},
		}, []string{"Pet", "Dog"}},
		{"typed schemas", []*openapi.Schema{
			{Type: "string"},
			{Type: "integer"},
		}, []string{"string", "integer"}},
		{"bare object fallback", []*openapi.Schema{
			{},
		}, []string{"object"}},
		{"mixed ref and type and bare", []*openapi.Schema{
			{Ref: "#/components/schemas/Cat"},
			{Type: "string"},
			{},
		}, []string{"Cat", "string", "object"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := compositionVariantNames(tt.schemas)
			if len(got) != len(tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("got[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestSortedPropertyNames(t *testing.T) {
	tests := []struct {
		name  string
		props map[string]*openapi.Schema
		want  []string
	}{
		{"nil map", nil, []string{}},
		{"empty map", map[string]*openapi.Schema{}, []string{}},
		{"single key", map[string]*openapi.Schema{"alpha": {}}, []string{"alpha"}},
		{"multiple keys sorted", map[string]*openapi.Schema{
			"charlie": {},
			"alpha":   {},
			"bravo":   {},
		}, []string{"alpha", "bravo", "charlie"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sortedPropertyNames(tt.props)
			if len(got) != len(tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("got[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func TestTruncateList(t *testing.T) {
	tests := []struct {
		name   string
		names  []string
		maxLen int
		want   string
	}{
		{"short list unchanged", []string{"a", "b"}, 50, "a, b"},
		{"exact length unchanged", []string{"abc"}, 3, "abc"},
		{"long list truncated", []string{"alpha", "bravo", "charlie", "delta"}, 15, "alpha, bravo..."},
		{"single long item truncated", []string{"abcdefghijklmnop"}, 10, "abcdefg..."},
		{"empty list", nil, 10, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := truncateList(tt.names, tt.maxLen)
			if got != tt.want {
				t.Errorf("truncateList(%v, %d) = %q, want %q", tt.names, tt.maxLen, got, tt.want)
			}
		})
	}
}

func TestCursorOnWordFirstOccurrence(t *testing.T) {
	tests := []struct {
		name string
		line string
		word string
		pos  protocol.Position
		want bool
	}{
		{"empty word", "some line", "", protocol.Position{Character: 0}, false},
		{"word not in line", "hello world", "xyz", protocol.Position{Character: 0}, false},
		{"cursor at start of word", "hello world", "world", protocol.Position{Character: 6}, true},
		{"cursor in middle of word", "hello world", "world", protocol.Position{Character: 8}, true},
		{"cursor at last char of word", "hello world", "world", protocol.Position{Character: 10}, true},
		{"cursor past end of word", "hello world", "world", protocol.Position{Character: 11}, false},
		{"cursor before word", "hello world", "world", protocol.Position{Character: 4}, false},
		{"cursor on first char of line", "hello", "hello", protocol.Position{Character: 0}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := cursorOnWordFirstOccurrence(tt.line, tt.word, tt.pos)
			if got != tt.want {
				t.Errorf("cursorOnWordFirstOccurrence(%q, %q, {Char:%d}) = %v, want %v",
					tt.line, tt.word, tt.pos.Character, got, tt.want)
			}
		})
	}
}
