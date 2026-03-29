package config

import (
	"path/filepath"
	"testing"
)

func TestResolveWorkspacePath(t *testing.T) {
	root := "/workspace"
	if got := ResolveWorkspacePath(root, "certs/client.pem"); got != filepath.Join(root, "certs/client.pem") {
		t.Fatalf("relative: %q", got)
	}
	if got := ResolveWorkspacePath(root, "/abs/pem"); got != filepath.Clean("/abs/pem") {
		t.Fatalf("absolute: %q", got)
	}
}
