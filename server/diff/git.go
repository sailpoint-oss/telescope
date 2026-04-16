package diff

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ReadAtRef reads a file at ref:path from a git repository using git show.
// repoRoot is the working tree root; ref is a branch, tag, or commit; filePath is relative to repo root.
func ReadAtRef(repoRoot, ref, filePath string) ([]byte, error) {
	if ref == "" || filePath == "" {
		return nil, fmt.Errorf("diff: ref and filePath required")
	}
	spec := ref + ":" + strings.TrimPrefix(filepath.ToSlash(filePath), "/")
	cmd := exec.Command("git", "-C", repoRoot, "show", spec)
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("diff: git show %q: %w", spec, err)
	}
	return out, nil
}

// ParseGitSpec parses "REF:path/to/file.yaml" into ref and path.
// On Windows, paths like "C:\foo" are not treated as git specs (single-letter drive + colon).
func ParseGitSpec(arg string) (ref, path string, ok bool) {
	if !strings.Contains(arg, ":") {
		return "", "", false
	}
	parts := strings.SplitN(arg, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	// Windows absolute path: X:\... or X:/...
	if len(parts[0]) == 1 {
		r := parts[0][0]
		if (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z') {
			if len(parts[1]) > 0 && (parts[1][0] == '\\' || parts[1][0] == '/') {
				return "", "", false
			}
		}
	}
	return parts[0], parts[1], true
}

// ResolveArg loads bytes for a CLI argument: either a filesystem path or REF:path for git.
func ResolveArg(arg, repoRoot string) ([]byte, error) {
	if ref, p, ok := ParseGitSpec(arg); ok {
		return ReadAtRef(repoRoot, ref, p)
	}
	b, err := os.ReadFile(arg)
	if err != nil {
		return nil, fmt.Errorf("diff: read file %q: %w", arg, err)
	}
	return b, nil
}
