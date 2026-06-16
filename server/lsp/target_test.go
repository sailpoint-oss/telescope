package lsp

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/sailpoint-oss/telescope/server/config"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func TestLooksLikeKnownNonOpenAPI(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    bool
	}{
		{"package.json shape", `{"name":"app","version":"1.0.0","dependencies":{}}`, true},
		{"kubernetes manifest", "apiVersion: v1\nkind: Pod\n", true},
		{"docker compose", "version: \"3\"\nservices:\n  web:\n    image: nginx\n", true},
		{"openapi root", "openapi: \"3.1.0\"\ninfo:\n  title: API\n  version: \"1.0.0\"\npaths: {}\n", false},
		{"schema fragment", "type: object\nproperties:\n  id:\n    type: string\n", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := looksLikeKnownNonOpenAPI([]byte(tt.content)); got != tt.want {
				t.Fatalf("looksLikeKnownNonOpenAPI() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestTargetDeps_IsOpenAPIDiagnosticTarget(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "openapi.yaml"), "openapi: \"3.1.0\"\ninfo:\n  title: API\n  version: \"1.0.0\"\npaths: {}\n")
	writeFile(t, filepath.Join(root, "package.json"), `{"name":"app","version":"1.0.0","dependencies":{}}`)
	writeFile(t, filepath.Join(root, "manifest.yaml"), "apiVersion: v1\nkind: ConfigMap\n")
	if err := os.MkdirAll(filepath.Join(root, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(root, "nested", "spec.yaml"), "openapi: \"3.1.0\"\ninfo:\n  title: Nested\n  version: \"1.0.0\"\npaths: {}\n")

	bridge, err := NewGraphBridge(nil)
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.DefaultConfig()
	cfg.OpenAPI.Patterns = []string{"**/*.yaml", "**/*.yml", "**/*.json"}
	deps := &TargetDeps{
		Config:        func() *config.Config { return cfg },
		Bridge:        bridge,
		WorkspaceRoot: func() string { return root },
	}

	openAPIURI := targetTestURI(filepath.Join(root, "openapi.yaml"))
	packageURI := targetTestURI(filepath.Join(root, "package.json"))
	k8sURI := targetTestURI(filepath.Join(root, "manifest.yaml"))
	nestedURI := targetTestURI(filepath.Join(root, "nested", "spec.yaml"))

	tests := []struct {
		name    string
		uri     string
		content []byte
		idx     *openapi.Index
		want    bool
	}{
		{"valid openapi root", openAPIURI, readFile(t, filepath.Join(root, "openapi.yaml")), nil, true},
		{"package.json rejected", packageURI, readFile(t, filepath.Join(root, "package.json")), nil, false},
		{"kubernetes rejected", k8sURI, readFile(t, filepath.Join(root, "manifest.yaml")), nil, false},
		{"nested openapi accepted", nestedURI, readFile(t, filepath.Join(root, "nested", "spec.yaml")), nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := deps.IsOpenAPIDiagnosticTarget(tt.uri, tt.content, tt.idx)
			if got != tt.want {
				t.Fatalf("IsOpenAPIDiagnosticTarget(%q) = %v, want %v", tt.name, got, tt.want)
			}
		})
	}
}

func TestTargetDeps_PatternScope(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "scoped"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "other"), 0o755); err != nil {
		t.Fatal(err)
	}
	spec := "openapi: \"3.1.0\"\ninfo:\n  title: X\n  version: \"1.0.0\"\npaths: {}\n"
	writeFile(t, filepath.Join(root, "scoped", "spec.yaml"), spec)
	writeFile(t, filepath.Join(root, "other", "spec.yaml"), spec)

	cfg := config.DefaultConfig()
	cfg.OpenAPI.Patterns = []string{"scoped/**/*.yaml"}
	bridge, err := NewGraphBridge(nil)
	if err != nil {
		t.Fatal(err)
	}
	deps := &TargetDeps{
		Config:        func() *config.Config { return cfg },
		Bridge:        bridge,
		WorkspaceRoot: func() string { return root },
	}
	if !deps.IsOpenAPIDiagnosticTarget(targetTestURI(filepath.Join(root, "scoped", "spec.yaml")), []byte(spec), nil) {
		t.Fatal("expected scoped openapi file to match patterns")
	}
	if deps.IsOpenAPIDiagnosticTarget(targetTestURI(filepath.Join(root, "other", "spec.yaml")), []byte(spec), nil) {
		t.Fatal("expected file outside scoped patterns to be rejected")
	}
}

func TestTargetDeps_IsAdditionalValidationTarget(t *testing.T) {
	root := t.TempDir()
	cfg := config.DefaultConfig()
	cfg.AdditionalValidation = map[string]config.ValidationGroup{
		"custom": {Patterns: []string{"custom/*.yaml"}},
	}
	deps := &TargetDeps{
		Config:        func() *config.Config { return cfg },
		WorkspaceRoot: func() string { return root },
	}
	if !deps.IsAdditionalValidationTarget(targetTestURI(filepath.Join(root, "custom", "item.yaml"))) {
		t.Fatal("expected custom/*.yaml to match additional validation")
	}
	if deps.IsAdditionalValidationTarget(targetTestURI(filepath.Join(root, "openapi.yaml"))) {
		t.Fatal("expected openapi.yaml outside custom patterns to not match additional validation")
	}
}

func TestTargetDeps_ExcludePatterns(t *testing.T) {
	root := t.TempDir()
	vendorPath := filepath.Join(root, "vendor", "openapi.yaml")
	if err := os.MkdirAll(filepath.Dir(vendorPath), 0o755); err != nil {
		t.Fatal(err)
	}
	content := []byte("openapi: \"3.1.0\"\ninfo:\n  title: API\n  version: \"1.0.0\"\npaths: {}\n")
	writeFile(t, vendorPath, string(content))

	cfg := config.DefaultConfig()
	cfg.Exclude = []string{"vendor/**"}
	bridge, err := NewGraphBridge(nil)
	if err != nil {
		t.Fatal(err)
	}
	deps := &TargetDeps{
		Config:        func() *config.Config { return cfg },
		Bridge:        bridge,
		WorkspaceRoot: func() string { return root },
	}
	uri := targetTestURI(vendorPath)
	if deps.IsOpenAPIDiagnosticTarget(uri, content, nil) {
		t.Fatal("expected excluded vendor file to be rejected")
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func readFile(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func targetTestURI(path string) string {
	p := filepath.ToSlash(filepath.Clean(path))
	return "file://" + p
}
