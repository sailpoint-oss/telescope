package lsp

import (
	"os"
	"path/filepath"
	"testing"
)

type typedNilLineDoc struct{}

func (*typedNilLineDoc) LineAt(uint32) string { return "unreachable" }

func TestDefinitionLineAt_TypedNilAccessorFallsBackToDisk(t *testing.T) {
	t.Helper()

	tmp := t.TempDir()
	path := filepath.Join(tmp, "openapi.yaml")
	if err := os.WriteFile(path, []byte("line-0\nline-1\nline-2\n"), 0o600); err != nil {
		t.Fatalf("write temp file: %v", err)
	}

	var nilDoc *typedNilLineDoc
	var accessor interface{ LineAt(uint32) string } = nilDoc

	got := definitionLineAt(accessor, filePathToURI(path), 1)
	if got != "line-1" {
		t.Fatalf("expected fallback line from disk, got %q", got)
	}
}

