package lsp

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/LukasParke/gossip/protocol"
)

func TestURIMatchesGeneratedSpec(t *testing.T) {
	if uriMatchesGeneratedSpec("", "/out.yaml", "/root") {
		t.Fatal("empty uri")
	}
	if !uriMatchesGeneratedSpec(protocol.DocumentURI(GeneratedURIScheme+":/x"), "", "") {
		t.Fatal("virtual scheme should match")
	}
	if uriMatchesGeneratedSpec("file:///x.yaml", "", "/root") {
		t.Fatal("empty outputPath")
	}
	root := filepath.Join(t.TempDir(), "proj")
	out := "gen/openapi.yaml"
	absOut := filepath.Join(root, out)
	uri := protocol.DocumentURI("file://" + filepath.ToSlash(absOut))
	if !uriMatchesGeneratedSpec(uri, out, root) {
		t.Fatalf("relative output under root should match: uri=%q out=%q root=%q", uri, out, root)
	}
	if runtime.GOOS == "windows" {
		uriThree := protocol.DocumentURI("file:///" + filepath.ToSlash(absOut))
		if !uriMatchesGeneratedSpec(uriThree, out, root) {
			t.Fatalf("three-slash Windows file URI should match: uri=%q out=%q root=%q", uriThree, out, root)
		}
	}
	if uriMatchesGeneratedSpec("file:///other/out.yaml", out, root) {
		t.Fatal("non-matching path")
	}

	absOnly := filepath.Join(t.TempDir(), "abs-only", "openapi.yaml")
	if err := os.MkdirAll(filepath.Dir(absOnly), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(absOnly, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	uriAbs := protocol.DocumentURI("file://" + filepath.ToSlash(absOnly))
	if !uriMatchesGeneratedSpec(uriAbs, absOnly, "") {
		t.Fatal("absolute outputPath without workspace root should suffix-match")
	}
}

func TestIsSourceFileURI(t *testing.T) {
	if !isSourceFileURI("file:///p/Foo.go") || !isSourceFileURI("/x.java") || !isSourceFileURI("a.TS") || !isSourceFileURI("c.tsx") {
		t.Fatal("expected source extensions")
	}
	if isSourceFileURI("file:///x.yaml") || isSourceFileURI("README.md") {
		t.Fatal("non-source should be false")
	}
}

func TestSourceGlobsForLanguages(t *testing.T) {
	def := sourceGlobsForLanguages(nil)
	if len(def) < 4 {
		t.Fatalf("default globs: %v", def)
	}
	def2 := sourceGlobsForLanguages([]string{})
	if len(def2) != len(def) {
		t.Fatalf("empty slice should match nil default")
	}
	goOnly := sourceGlobsForLanguages([]string{"go"})
	if len(goOnly) != 1 || goOnly[0] != "**/*.go" {
		t.Fatalf("go: %v", goOnly)
	}
	javaG := sourceGlobsForLanguages([]string{"Java"})
	if len(javaG) != 1 || javaG[0] != "**/*.java" {
		t.Fatalf("java: %v", javaG)
	}
	tsG := sourceGlobsForLanguages([]string{"typescript", "ts"})
	if len(tsG) != 4 {
		t.Fatalf("expected two ts globs per lang: %v", tsG)
	}
	mixed := sourceGlobsForLanguages([]string{"go", "unknown", "ruby"})
	if len(mixed) != 1 {
		t.Fatalf("unknown langs ignored: %v", mixed)
	}
}
