package diff

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestReadAtRef(t *testing.T) {
	dir := t.TempDir()
	init := exec.Command("git", "init")
	init.Dir = dir
	if err := init.Run(); err != nil {
		t.Fatal(err)
	}
	_ = exec.Command("git", "-C", dir, "config", "user.email", "t@t").Run()
	_ = exec.Command("git", "-C", dir, "config", "user.name", "t").Run()
	p := filepath.Join(dir, "a.yaml")
	if err := os.WriteFile(p, []byte("v1"), 0o644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", "a.yaml").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "c1").Run()
	if err := os.WriteFile(p, []byte("v2"), 0o644); err != nil {
		t.Fatal(err)
	}
	exec.Command("git", "-C", dir, "add", "a.yaml").Run()
	exec.Command("git", "-C", dir, "commit", "-m", "c2").Run()

	b, err := ReadAtRef(dir, "HEAD~1", "a.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if string(b) != "v1" {
		t.Fatalf("got %q", b)
	}
}

func TestParseGitSpec(t *testing.T) {
	ref, p, ok := ParseGitSpec("main:api/foo.yaml")
	if !ok || ref != "main" || p != "api/foo.yaml" {
		t.Fatalf("got %q %q %v", ref, p, ok)
	}
	_, _, ok = ParseGitSpec(`C:\foo\bar.yaml`)
	if ok {
		t.Fatal("windows path should not parse as git spec")
	}
}
