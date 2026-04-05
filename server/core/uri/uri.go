// Package uri provides file URI normalization without LSP or gossip imports,
// so core packages stay free of github.com/LukasParke/gossip/protocol.
package uri

import (
	"net/url"
	"path/filepath"
	"runtime"
	"strings"
)

// Normalize matches gossip/protocol.NormalizeURI and openapi.NormalizeURI:
// canonical file:// URIs for map keys; non-file URIs are returned unchanged.
func Normalize(s string) string {
	if s == "" {
		return s
	}
	u, err := url.Parse(s)
	if err != nil {
		return s
	}
	if u.Scheme != "file" {
		return s
	}
	path := u.Path
	if path == "" {
		return s
	}
	cleaned := filepath.Clean(filepath.FromSlash(path))
	if runtime.GOOS == "windows" && len(cleaned) >= 2 && cleaned[1] == ':' {
		cleaned = strings.ToUpper(cleaned[:1]) + cleaned[1:]
	}
	result := &url.URL{
		Scheme: "file",
		Path:   filepath.ToSlash(cleaned),
	}
	return result.String()
}
