package config

import (
	"path/filepath"
	"strings"
)

const telescopeDirName = ".telescope"

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

// WorkspaceRootForConfigPath derives the workspace root from a config path.
// Config files under .telescope/ resolve to the parent directory.
func WorkspaceRootForConfigPath(configPath string) string {
	configPath = strings.TrimSpace(configPath)
	if configPath == "" {
		return ""
	}
	dir := filepath.Dir(filepath.Clean(configPath))
	if filepath.Base(dir) == telescopeDirName {
		return filepath.Dir(dir)
	}
	return dir
}

// TelescopeAssetRef converts a v2 asset path into a workspace-relative
// reference under .telescope/, preserving absolute paths.
func TelescopeAssetRef(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p)
	}
	clean := filepath.ToSlash(filepath.Clean(p))
	if strings.HasPrefix(clean, telescopeDirName+"/") {
		return clean
	}
	return telescopeDirName + "/" + clean
}

// ResolveTelescopePath resolves a Telescope-owned asset path under .telescope/,
// preserving absolute paths and explicit .telescope/ prefixes.
func ResolveTelescopePath(workspaceRoot, p string) string {
	return ResolveWorkspacePath(workspaceRoot, TelescopeAssetRef(p))
}
