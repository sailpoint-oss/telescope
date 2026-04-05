package uri

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestNormalize_fileURI(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("path expectations are unix-style")
	}
	cases := []struct {
		in, want string
	}{
		{"", ""},
		{"file:///tmp/foo/../bar.yaml", "file:///tmp/bar.yaml"},
	}
	for _, tc := range cases {
		got := Normalize(tc.in)
		if got != tc.want {
			t.Errorf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalize_nonFileUnchanged(t *testing.T) {
	if got := Normalize("https://example.com/x"); got != "https://example.com/x" {
		t.Errorf("got %q", got)
	}
}

func TestNormalize_roundTripWithFilepath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("path expectations are unix-style")
	}
	dir := t.TempDir()
	p := filepath.Join(dir, "a.yaml")
	in := "file://" + filepath.ToSlash(p)
	n := Normalize(in)
	if n != in {
		t.Fatalf("normalize changed %q -> %q", in, n)
	}
}
