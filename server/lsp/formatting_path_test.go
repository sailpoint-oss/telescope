package lsp

import (
	"net/url"
	"os"
	"path/filepath"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

func fileURI(t *testing.T, absPath string) protocol.DocumentURI {
	t.Helper()
	p := filepath.Clean(absPath)
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(p)}
	return protocol.DocumentURI(u.String())
}

func TestPathsEqualOrSameFile_symlink(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "spec.json")
	if err := os.WriteFile(real, []byte(`{"x":1}`), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "via-link.json")
	if err := os.Symlink(real, link); err != nil {
		t.Fatal(err)
	}
	if pathsEqualOrSameFile(real, link) != true {
		t.Fatal("expected same file for path and symlink")
	}
	if pathsEqualOrSameFile(real, filepath.Join(dir, "other.json")) != false {
		t.Fatal("expected different file")
	}
}

func TestFormattingHandler_JSON_symlinkPathFallback(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "format.json")
	content := `{"openapi":"3.1.0","info":{"title":"T","version":"1.0.0"},"paths":{}}`
	if err := os.WriteFile(real, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(dir, "alias.json")
	if err := os.Symlink(real, link); err != nil {
		t.Fatal(err)
	}

	opened := fileURI(t, real)
	alt := fileURI(t, link)
	if opened == alt {
		t.Fatal("URIs should differ for real path vs symlink path")
	}

	store := document.NewStore()
	store.Open(&protocol.DidOpenTextDocumentParams{
		TextDocument: protocol.TextDocumentItem{
			URI:        opened,
			LanguageID: "openapi-json",
			Version:    1,
			Text:       content,
		},
	})

	cache := openapi.NewIndexCache()
	ctx := &gossip.Context{
		Context:   t.Context(),
		Documents: store,
	}
	handler := NewFormattingHandler(cache, nil)
	result, err := handler(ctx, &protocol.DocumentFormattingParams{
		TextDocument: protocol.TextDocumentIdentifier{URI: alt},
		Options: protocol.FormattingOptions{
			TabSize:      2,
			InsertSpaces: true,
		},
	})
	if err != nil {
		t.Fatalf("formatting error: %v", err)
	}
	if len(result) != 1 {
		t.Fatalf("expected one formatting edit (symlink path fallback), got %d", len(result))
	}
}
