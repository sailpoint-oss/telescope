package config

import (
	"path/filepath"
	"runtime"
	"testing"
)

func TestResolveWorkspacePath(t *testing.T) {
	root := filepath.Join(string(filepath.Separator), "workspace")
	rel := filepath.Join("certs", "client.pem")
	if got := ResolveWorkspacePath(root, rel); got != filepath.Join(root, rel) {
		t.Fatalf("relative: %q", got)
	}
	var abs string
	if runtime.GOOS == "windows" {
		abs = `C:\abs\pem`
	} else {
		abs = filepath.Join(string(filepath.Separator), "abs", "pem")
	}
	if got := ResolveWorkspacePath(root, abs); got != filepath.Clean(abs) {
		t.Fatalf("absolute: %q", got)
	}
}
