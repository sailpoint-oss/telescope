package cli

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiffCommand_JSON(t *testing.T) {
	dir := t.TempDir()
	withWorkingDir(t, dir)
	a := filepath.Join(dir, "a.yaml")
	b := filepath.Join(dir, "b.yaml")
	spec := `openapi: "3.0.3"
info:
  title: T
  version: "1.0"
paths:
  /x:
    get:
      responses:
        "200":
          description: ok
`
	if err := os.WriteFile(a, []byte(spec), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(b, []byte(strings.ReplaceAll(spec, "/x", "/y")), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(dir, "out.json")
	resetCLIState()
	if err := runCLISubprocess(t, dir, "diff", a, b, "--format", "json", "-o", out); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), `"totalChanges"`) {
		t.Fatalf("output: %s", raw)
	}
}
