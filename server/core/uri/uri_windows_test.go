//go:build windows

package uri

import (
	"net/url"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalize_fileURI_windows(t *testing.T) {
	dir := filepath.Clean(t.TempDir())
	ps := filepath.ToSlash(dir)
	if len(ps) >= 2 && ps[1] == ':' {
		ps = "/" + ps
	}
	in := (&url.URL{Scheme: "file", Path: ps + "/sub/../a.yaml"}).String()
	out := Normalize(in)
	if out == "" || !strings.HasPrefix(out, "file:") {
		t.Fatalf("Normalize(%q) = %q", in, out)
	}
	if Normalize(out) != out {
		t.Fatalf("Normalize not idempotent: %q -> %q -> %q", in, out, Normalize(out))
	}
}

func TestNormalize_roundTripWithFilepath_windows(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "a.yaml")
	ps := filepath.ToSlash(filepath.Clean(p))
	if len(ps) >= 2 && ps[1] == ':' {
		ps = "/" + ps
	}
	in := (&url.URL{Scheme: "file", Path: ps}).String()
	n := Normalize(in)
	if n == "" {
		t.Fatal("empty normalized URI")
	}
	if Normalize(n) != n {
		t.Fatalf("expected idempotent normalize: %q -> %q", n, Normalize(n))
	}
}
