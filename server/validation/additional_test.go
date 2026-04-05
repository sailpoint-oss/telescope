package validation

import (
	"log/slog"
	"os"
	"testing"
)

func TestDetectSchemaType(t *testing.T) {
	tests := []struct {
		filename string
		want     SchemaType
	}{
		{"schema.json", SchemaTypeJSON},
		{"schema.yaml", SchemaTypeJSON},
		{"schema.ts", SchemaTypeZod},
		{"schema.mts", SchemaTypeZod},
		{"my-schema.JSON", SchemaTypeJSON},
		{"my-schema.TS", SchemaTypeZod},
	}
	for _, tt := range tests {
		t.Run(tt.filename, func(t *testing.T) {
			got := DetectSchemaType(tt.filename)
			if got != tt.want {
				t.Errorf("DetectSchemaType(%q) = %q, want %q", tt.filename, got, tt.want)
			}
		})
	}
}

func TestMatchesFileForSidecar(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	v := NewAdditionalValidator(logger)
	v.rootDir = "/workspace"
	v.schemasDir = "/workspace/.telescope/schemas"
	v.groups = map[string]ValidationGroup{
		"config-files": {
			Patterns: []string{"*.config.yaml"},
			Schemas: []SchemaPatternMapping{
				{Schema: "config-schema.json"},
			},
		},
		"zod-validated": {
			Patterns: []string{"*.manifest.yaml"},
			Schemas: []SchemaPatternMapping{
				{Schema: "manifest.ts"},
			},
		},
	}

	t.Run("matches JSON Schema", func(t *testing.T) {
		matches, ok := v.MatchesFileForSidecar("file:///workspace/app.config.yaml")
		if !ok {
			t.Fatal("expected match for app.config.yaml")
		}
		if len(matches) != 1 {
			t.Fatalf("expected 1 match, got %d", len(matches))
		}
		if matches[0].SchemaType != SchemaTypeJSON {
			t.Errorf("expected SchemaTypeJSON, got %q", matches[0].SchemaType)
		}
		if matches[0].GroupName != "config-files" {
			t.Errorf("expected group config-files, got %q", matches[0].GroupName)
		}
	})

	t.Run("matches Zod Schema", func(t *testing.T) {
		matches, ok := v.MatchesFileForSidecar("file:///workspace/app.manifest.yaml")
		if !ok {
			t.Fatal("expected match for app.manifest.yaml")
		}
		if len(matches) != 1 {
			t.Fatalf("expected 1 match, got %d", len(matches))
		}
		if matches[0].SchemaType != SchemaTypeZod {
			t.Errorf("expected SchemaTypeZod, got %q", matches[0].SchemaType)
		}
	})

	t.Run("no match for unrelated file", func(t *testing.T) {
		_, ok := v.MatchesFileForSidecar("file:///workspace/README.md")
		if ok {
			t.Error("expected no match for README.md")
		}
	})

	t.Run("no match for file outside workspace", func(t *testing.T) {
		_, ok := v.MatchesFileForSidecar("file:///other/app.config.yaml")
		if ok {
			t.Error("expected no match for file outside workspace root")
		}
	})
}

func TestMatchesFile(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError}))
	v := NewAdditionalValidator(logger)
	v.rootDir = "/workspace"
	v.schemasDir = "/workspace/.telescope/schemas"
	v.groups = map[string]ValidationGroup{
		"test-group": {
			Patterns: []string{"*.test.yaml"},
			Schemas: []SchemaPatternMapping{
				{Schema: "test-schema.json"},
				{Schema: "test-schema.ts"},
			},
		},
	}

	match, ok := v.MatchesFile("file:///workspace/my.test.yaml")
	if !ok || match == nil {
		t.Fatal("expected match")
	}
	if match.group != "test-group" {
		t.Errorf("expected group test-group, got %q", match.group)
	}
}

func TestMatchesPatterns(t *testing.T) {
	tests := []struct {
		path     string
		patterns []string
		want     bool
	}{
		{"app.config.yaml", []string{"*.config.yaml"}, true},
		{"deep/nested/app.config.yaml", []string{"**/*.config.yaml"}, true},
		{"README.md", []string{"*.yaml"}, false},
		{"api.yaml", []string{"*.yaml", "*.json"}, true},
		{"api.json", []string{"*.yaml", "*.json"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			got := matchesPatterns(tt.path, tt.patterns)
			if got != tt.want {
				t.Errorf("matchesPatterns(%q, %v) = %v, want %v", tt.path, tt.patterns, got, tt.want)
			}
		})
	}
}

func TestURIToRelPath(t *testing.T) {
	tests := []struct {
		uri     string
		rootDir string
		want    string
	}{
		{"file:///workspace/api.yaml", "/workspace", "api.yaml"},
		{"file:///workspace/deep/nested/api.yaml", "/workspace", "deep/nested/api.yaml"},
		{"/workspace/api.yaml", "/workspace", "api.yaml"},
	}
	for _, tt := range tests {
		t.Run(tt.uri, func(t *testing.T) {
			got := uriToRelPath(tt.uri, tt.rootDir)
			if got != tt.want {
				t.Errorf("uriToRelPath(%q, %q) = %q, want %q", tt.uri, tt.rootDir, got, tt.want)
			}
		})
	}
}
