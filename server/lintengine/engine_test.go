package lintengine

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestRun_ReturnsDiagnosticsForInvalidSpec(t *testing.T) {
	dir := t.TempDir()
	specPath := filepath.Join(dir, "invalid.yaml")
	const invalid = `openapi: "3.1.0"
paths: {}
`
	if err := os.WriteFile(specPath, []byte(invalid), 0o644); err != nil {
		t.Fatalf("write spec: %v", err)
	}

	result, err := Run(context.Background(), Options{
		Paths:         []string{specPath},
		WorkingDir:    dir,
		NoExternalLSP: true,
	}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if result == nil {
		t.Fatal("expected result")
	}
	if result.Workspace != dir {
		t.Fatalf("workspace = %q, want %q", result.Workspace, dir)
	}
	if len(result.Files) != 1 || result.Files[0] != specPath {
		t.Fatalf("unexpected files: %+v", result.Files)
	}
	if len(result.Results) == 0 {
		t.Fatal("expected diagnostics for invalid OpenAPI document")
	}
	if result.Results[0].Path != specPath {
		t.Fatalf("diagnostic path = %q, want %q", result.Results[0].Path, specPath)
	}
	if len(result.Results[0].Diagnostics) == 0 {
		t.Fatal("expected at least one diagnostic")
	}
}
