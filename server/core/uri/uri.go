// Package uri provides file URI normalization without LSP or gossip imports,
// so core packages stay free of github.com/LukasParke/gossip/protocol.
package uri

import (
	"net/url"
	"path/filepath"
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
	cleaned := normalizeDriveLetter(filepath.Clean(filepath.FromSlash(path)))
	result := &url.URL{
		Scheme: "file",
		Path:   filepath.ToSlash(cleaned),
	}
	return result.String()
}
