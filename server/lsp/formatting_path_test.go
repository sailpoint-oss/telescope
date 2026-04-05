package lsp

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/document"
	"github.com/LukasParke/gossip/protocol"
)

// fileURI builds a file:// URI for an absolute path (LSP-style).
func fileURI(t *testing.T, absPath string) protocol.DocumentURI {
	t.Helper()
	p := filepath.ToSlash(filepath.Clean(absPath))
	if !filepath.IsAbs(p) {
		t.Fatalf("need absolute path, got %q", p)
	}
	if runtime.GOOS == "windows" && len(p) >= 2 && p[1] == ':' {
		p = "/" + p
	}
	return protocol.DocumentURI("file://" + p)
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

func TestDocForFormatting_symlinkURIMatches(t *testing.T) {
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

	ctx := &gossip.Context{
		Context:   context.Background(),
		Documents: store,
	}
	doc := docForFormatting(ctx, alt)
	if doc == nil {
		want := protocol.URIToPath(protocol.NormalizeURI(alt))
		var uris []string
		for _, u := range store.URIs() {
			uris = append(uris, string(u)+" -> "+protocol.URIToPath(u))
		}
		t.Fatalf("docForFormatting nil for symlink URI; wantPath=%q openURIs=%s", want, strings.Join(uris, "; "))
	}
	if doc.Text() != content {
		t.Fatalf("resolved document text mismatch")
	}
}
