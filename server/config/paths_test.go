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

func TestWorkspaceRootForConfigPath(t *testing.T) {
	root := filepath.Join(string(filepath.Separator), "workspace")
	nested := filepath.Join(root, ".telescope", "config.yaml")
	if got := WorkspaceRootForConfigPath(nested); got != root {
		t.Fatalf("nested config root = %q, want %q", got, root)
	}
	legacy := filepath.Join(root, ".telescope.yaml")
	if got := WorkspaceRootForConfigPath(legacy); got != root {
		t.Fatalf("legacy config root = %q, want %q", got, root)
	}
}

func TestTelescopeAssetRef(t *testing.T) {
	if got := TelescopeAssetRef("rulesets/breaking.yaml"); got != ".telescope/rulesets/breaking.yaml" {
		t.Fatalf("relative asset = %q", got)
	}
	if got := TelescopeAssetRef(".telescope/rulesets/breaking.yaml"); got != ".telescope/rulesets/breaking.yaml" {
		t.Fatalf("prefixed asset = %q", got)
	}
}
