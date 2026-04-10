package validation

import (
	"testing"
)

func TestDetectSchemaType_AdditionalCoverage(t *testing.T) {
	tests := []struct {
		name     string
		filename string
		want     SchemaType
	}{
		{"yml extension", "schema.yml", SchemaTypeJSON},
		{"MTS uppercase", "schema.MTS", SchemaTypeZod},
		{"nested ts path", "dir/nested/validator.ts", SchemaTypeZod},
		{"no extension", "my-schema", SchemaTypeJSON},
		{"empty string", "", SchemaTypeJSON},
		{"js is not zod", "schema.js", SchemaTypeJSON},
		{"hidden file .ts", ".hidden.ts", SchemaTypeZod},
		{"double extension", "model.schema.ts", SchemaTypeZod},
		{"path with spaces", "my schemas/file.ts", SchemaTypeZod},
		{"dot only", ".", SchemaTypeJSON},
		{"mixed case Ts", "schema.Ts", SchemaTypeZod},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := DetectSchemaType(tt.filename); got != tt.want {
				t.Errorf("DetectSchemaType(%q) = %q, want %q", tt.filename, got, tt.want)
			}
		})
	}
}

func TestMatchesPatterns_AdditionalCoverage(t *testing.T) {
	tests := []struct {
		name     string
		path     string
		patterns []string
		want     bool
	}{
		{"exact match", "config.yaml", []string{"config.yaml"}, true},
		{"glob star", "config.yaml", []string{"*.yaml"}, true},
		{"no match", "config.json", []string{"*.yaml"}, false},
		{"empty patterns", "config.yaml", nil, false},
		{"double star pattern", "a/b/c.yaml", []string{"**/*.yaml"}, true},
		{"multiple patterns first hit", "foo.json", []string{"*.json", "*.yaml"}, true},
		{"multiple patterns second hit", "foo.yaml", []string{"*.json", "*.yaml"}, true},
		{"prefix double star", "deep/nested/file.ts", []string{"**/*.ts"}, true},
		{"question mark glob", "config.yml", []string{"config.y?l"}, true},
		{"empty path empty pattern", "", []string{""}, true},
		{"single char pattern", "x", []string{"?"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := matchesPatterns(tt.path, tt.patterns); got != tt.want {
				t.Errorf("matchesPatterns(%q, %v) = %v, want %v", tt.path, tt.patterns, got, tt.want)
			}
		})
	}
}

func TestDoubleStarMatch(t *testing.T) {
	tests := []struct {
		name    string
		pattern string
		path    string
		want    bool
		wantErr bool
	}{
		{
			name:    "no double star delegates to filepath.Match",
			pattern: "*.yaml",
			path:    "spec.yaml",
			want:    true,
		},
		{
			name:    "no double star no match",
			pattern: "*.yaml",
			path:    "spec.json",
			want:    false,
		},
		{
			name:    "double star matches nested path",
			pattern: "**/*.yaml",
			path:    "a/b/c.yaml",
			want:    true,
		},
		{
			name:    "double star matches top-level",
			pattern: "**/*.yaml",
			path:    "spec.yaml",
			want:    true,
		},
		{
			name:    "double star with prefix",
			pattern: "schemas/**/*.json",
			path:    "schemas/v1/spec.json",
			want:    true,
		},
		{
			name:    "double star prefix mismatch",
			pattern: "schemas/**/*.json",
			path:    "other/v1/spec.json",
			want:    false,
		},
		{
			name:    "double star only matches everything",
			pattern: "**",
			path:    "any/path/here",
			want:    true,
		},
		{
			name:    "double star empty suffix matches any",
			pattern: "src/**",
			path:    "src/foo/bar",
			want:    true,
		},
		{
			name:    "double star empty suffix prefix mismatch",
			pattern: "src/**",
			path:    "lib/foo/bar",
			want:    false,
		},
		{
			name:    "empty pattern empty path",
			pattern: "",
			path:    "",
			want:    true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := doubleStarMatch(tt.pattern, tt.path)
			if (err != nil) != tt.wantErr {
				t.Errorf("doubleStarMatch(%q, %q) error = %v, wantErr %v", tt.pattern, tt.path, err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("doubleStarMatch(%q, %q) = %v, want %v", tt.pattern, tt.path, got, tt.want)
			}
		})
	}
}

func TestUriToRelPath(t *testing.T) {
	tests := []struct {
		name    string
		uri     string
		rootDir string
		want    string
	}{
		{
			name:    "file URI scheme stripped",
			uri:     "file:///workspace/spec.yaml",
			rootDir: "/workspace",
			want:    "spec.yaml",
		},
		{
			name:    "nested path",
			uri:     "file:///workspace/api/v1/spec.yaml",
			rootDir: "/workspace",
			want:    "api/v1/spec.yaml",
		},
		{
			name:    "plain path no scheme",
			uri:     "/workspace/config.yaml",
			rootDir: "/workspace",
			want:    "config.yaml",
		},
		{
			name:    "path outside root returns empty",
			uri:     "file:///other/spec.yaml",
			rootDir: "/workspace",
			want:    "",
		},
		{
			name:    "exact root returns current dir",
			uri:     "file:///workspace",
			rootDir: "/workspace",
			want:    ".",
		},
		{
			name:    "parent traversal returns empty",
			uri:     "/workspace/../etc/passwd",
			rootDir: "/workspace",
			want:    "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := uriToRelPath(tt.uri, tt.rootDir)
			if got != tt.want {
				t.Errorf("uriToRelPath(%q, %q) = %q, want %q", tt.uri, tt.rootDir, got, tt.want)
			}
		})
	}
}

func TestUriToRelPath_AdditionalCoverage(t *testing.T) {
	tests := []struct {
		name    string
		uri     string
		rootDir string
		want    string
	}{
		{
			name:    "path outside root returns empty",
			uri:     "file:///other/spec.yaml",
			rootDir: "/workspace",
			want:    "",
		},
		{
			name:    "exact root returns dot",
			uri:     "file:///workspace",
			rootDir: "/workspace",
			want:    ".",
		},
		{
			name:    "parent traversal returns empty",
			uri:     "/workspace/../etc/passwd",
			rootDir: "/workspace",
			want:    "",
		},
		{
			name:    "short uri under 7 chars",
			uri:     "/w/a.y",
			rootDir: "/w",
			want:    "a.y",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := uriToRelPath(tt.uri, tt.rootDir)
			if got != tt.want {
				t.Errorf("uriToRelPath(%q, %q) = %q, want %q", tt.uri, tt.rootDir, got, tt.want)
			}
		})
	}
}
