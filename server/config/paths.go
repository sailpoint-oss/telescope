package config

import (
	"path/filepath"
	"strings"
)

// ResolveWorkspacePath joins workspaceRoot with p when p is relative; absolute paths are cleaned as-is.
func ResolveWorkspacePath(workspaceRoot, p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	if strings.TrimSpace(workspaceRoot) == "" {
		return filepath.Clean(p)
	}
	return filepath.Join(workspaceRoot, filepath.Clean(p))
}
