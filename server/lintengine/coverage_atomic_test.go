package lintengine

import (
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

// --- isOpenAPIExtension ---

func TestIsOpenAPIExtension(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"spec.yaml", true},
		{"spec.yml", true},
		{"spec.json", true},
		{"spec.YAML", true},
		{"spec.JSON", true},
		{"spec.txt", false},
		{"spec.go", false},
		{"spec", false},
		{"dir/nested/api.yaml", true},
		{"Makefile", false},
	}

	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := isOpenAPIExtension(tt.path); got != tt.want {
				t.Errorf("isOpenAPIExtension(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

// --- matchesAnyPattern ---

func TestMatchesAnyPattern(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		patterns []string
		want     bool
	}{
		{name: "no patterns", path: "file.yaml", patterns: nil, want: false},
		{name: "exact base match", path: "dir/file.yaml", patterns: []string{"file.yaml"}, want: true},
		{name: "glob match", path: "test.yaml", patterns: []string{"*.yaml"}, want: true},
		{name: "no match", path: "test.go", patterns: []string{"*.yaml", "*.json"}, want: false},
		{name: "directory pattern", path: "node_modules", patterns: []string{"node_modules"}, want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchesAnyPattern(tt.path, tt.patterns); got != tt.want {
				t.Errorf("matchesAnyPattern(%q, %v) = %v, want %v", tt.path, tt.patterns, got, tt.want)
			}
		})
	}
}

// --- filterBySeverity ---

func TestFilterBySeverity(t *testing.T) {
	diags := []protocol.Diagnostic{
		{Message: "error", Severity: protocol.SeverityError},
		{Message: "warn", Severity: protocol.SeverityWarning},
		{Message: "info", Severity: protocol.SeverityInformation},
		{Message: "hint", Severity: protocol.SeverityHint},
	}

	tests := []struct {
		name    string
		minSev  protocol.DiagnosticSeverity
		wantLen int
	}{
		{name: "error only", minSev: protocol.SeverityError, wantLen: 1},
		{name: "error+warning", minSev: protocol.SeverityWarning, wantLen: 2},
		{name: "up to info", minSev: protocol.SeverityInformation, wantLen: 3},
		{name: "all", minSev: protocol.SeverityHint, wantLen: 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := filterBySeverity(diags, tt.minSev)
			if len(got) != tt.wantLen {
				t.Errorf("filterBySeverity(minSev=%d) returned %d, want %d", tt.minSev, len(got), tt.wantLen)
			}
		})
	}

	t.Run("nil input", func(t *testing.T) {
		got := filterBySeverity(nil, protocol.SeverityWarning)
		if len(got) != 0 {
			t.Errorf("expected empty result for nil input, got %d", len(got))
		}
	})
}

// --- extractRefTarget ---

func TestExtractRefTarget(t *testing.T) {
	tests := []struct {
		name    string
		message string
		want    string
	}{
		{
			name:    "new format",
			message: "Cannot resolve $ref to Schema Object: ./models/User.yaml",
			want:    "./models/User.yaml",
		},
		{
			name:    "old format",
			message: "Cannot resolve $ref: #/components/schemas/Pet",
			want:    "#/components/schemas/Pet",
		},
		{
			name:    "with did-you-mean suffix",
			message: "Cannot resolve $ref to Schema Object: ./User.yaml. Did you mean './users/User.yaml'?",
			want:    "./User.yaml",
		},
		{
			name:    "no colon returns empty",
			message: "some unrelated message",
			want:    "",
		},
		{
			name:    "empty string",
			message: "",
			want:    "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := extractRefTarget(tt.message); got != tt.want {
				t.Errorf("extractRefTarget(%q) = %q, want %q", tt.message, got, tt.want)
			}
		})
	}
}

// --- filterExcluded ---

func TestFilterExcluded(t *testing.T) {
	tests := []struct {
		name     string
		files    []string
		patterns []string
		want     []string
	}{
		{
			name:     "no patterns keeps all",
			files:    []string{"a.yaml", "b.json"},
			patterns: nil,
			want:     []string{"a.yaml", "b.json"},
		},
		{
			name:     "exclude yaml",
			files:    []string{"a.yaml", "b.json", "c.yml"},
			patterns: []string{"*.yaml", "*.yml"},
			want:     []string{"b.json"},
		},
		{
			name:     "glob with **",
			files:    []string{"dir/spec.yaml", "other.json"},
			patterns: []string{"**/*.yaml"},
			want:     []string{"other.json"},
		},
		{
			name:     "empty files",
			files:    nil,
			patterns: []string{"*.yaml"},
			want:     nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := filterExcluded(tt.files, tt.patterns)
			if len(got) != len(tt.want) {
				t.Fatalf("len = %d, want %d: %v", len(got), len(tt.want), got)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// --- filterIncluded ---

func TestFilterIncluded(t *testing.T) {
	tests := []struct {
		name     string
		files    []string
		patterns []string
		want     []string
	}{
		{
			name:     "include yaml only",
			files:    []string{"a.yaml", "b.json", "c.yml"},
			patterns: []string{"*.yaml"},
			want:     []string{"a.yaml"},
		},
		{
			name:     "include multiple patterns",
			files:    []string{"a.yaml", "b.json", "c.txt"},
			patterns: []string{"*.yaml", "*.json"},
			want:     []string{"a.yaml", "b.json"},
		},
		{
			name:     "no patterns returns nothing",
			files:    []string{"a.yaml"},
			patterns: nil,
			want:     nil,
		},
		{
			name:     "glob with **",
			files:    []string{"specs/api.yaml", "readme.md"},
			patterns: []string{"**/*.yaml"},
			want:     []string{"specs/api.yaml"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := filterIncluded(tt.files, tt.patterns)
			if len(got) != len(tt.want) {
				t.Fatalf("len = %d, want %d: %v", len(got), len(tt.want), got)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Errorf("[%d] = %q, want %q", i, got[i], tt.want[i])
				}
			}
		})
	}
}

// --- matchGlob ---

func TestMatchGlob(t *testing.T) {
	tests := []struct {
		name    string
		pattern string
		path    string
		want    bool
	}{
		{name: "exact match", pattern: "spec.yaml", path: "spec.yaml", want: true},
		{name: "basename match", pattern: "*.yaml", path: "dir/spec.yaml", want: true},
		{name: "double star basename", pattern: "**/*.yaml", path: "deep/dir/spec.yaml", want: true},
		{name: "no match", pattern: "*.json", path: "spec.yaml", want: false},
		{name: "full path match", pattern: "dir/spec.yaml", path: "dir/spec.yaml", want: true},
		{name: "double star glob", pattern: "**/*.json", path: "a/b/c.json", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchGlob(tt.pattern, tt.path); got != tt.want {
				t.Errorf("matchGlob(%q, %q) = %v, want %v", tt.pattern, tt.path, got, tt.want)
			}
		})
	}
}

// --- pathToFileURI ---

func TestPathToFileURI(t *testing.T) {
	tests := []struct {
		name string
		path string
	}{
		{name: "absolute path", path: "/home/user/spec.yaml"},
		{name: "relative path", path: "spec.yaml"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := pathToFileURI(tt.path)
			if len(got) < len("file:///") {
				t.Fatalf("pathToFileURI(%q) = %q, too short", tt.path, got)
			}
			if got[:7] != "file://" {
				t.Errorf("pathToFileURI(%q) = %q, want file:// prefix", tt.path, got)
			}
		})
	}
}
