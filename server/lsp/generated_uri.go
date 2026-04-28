package lsp

import (
	"net/url"
	"path/filepath"
	"runtime"
	"strings"
	"unicode"

	"github.com/LukasParke/gossip/protocol"
)

// GeneratedURIScheme is the virtual-document URI scheme the extension uses
// to display the in-memory spec when no disk path is configured.
const GeneratedURIScheme = "telescope-generated"

// isWindowsDriveURLHost reports whether the URL host is a single-letter
// Windows drive (e.g. "C:") as produced for the file://C:/... URI form.
func isWindowsDriveURLHost(host string) bool {
	if len(host) != 2 || host[1] != ':' {
		return false
	}
	r := rune(host[0])
	return unicode.IsLetter(r)
}

// localPathFromFileURI returns a cleaned filesystem path for a file:// URI, or
// "" on parse failure or a non-file scheme. Handles both file:///C:/... and
// file://C:/... (drive in Host per net/url.Parse on any GOOS).
func localPathFromFileURI(uri protocol.DocumentURI) string {
	raw := string(uri)
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "file" {
		return ""
	}
	p := u.Path
	if isWindowsDriveURLHost(u.Host) {
		p = u.Host + p
	} else if len(p) >= 3 && p[0] == '/' && p[2] == ':' {
		// file:///C:/... (path is /C:/...)
		p = p[1:]
	}
	if p == "" {
		return ""
	}
	return filepath.Clean(filepath.FromSlash(p))
}

func pathEqualForOS(a, b string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(a, b)
	}
	return a == b
}

// uriMatchesGeneratedSpec reports whether the given URI should be served by
// the generation-loop builder. Matches the telescope-generated:// virtual
// URI and any file:// URI whose resolved path equals the loop's resolved
// output path.
func uriMatchesGeneratedSpec(uri protocol.DocumentURI, outputPath, root string) bool {
	raw := string(uri)
	if raw == "" {
		return false
	}
	if strings.HasPrefix(raw, GeneratedURIScheme+":") {
		return true
	}
	if outputPath == "" {
		return false
	}
	abs := outputPath
	if !filepath.IsAbs(abs) && root != "" {
		abs = filepath.Join(root, outputPath)
	}
	want := filepath.Clean(abs)
	got := localPathFromFileURI(uri)
	if got == "" {
		return false
	}
	return pathEqualForOS(want, got)
}

// isSourceFileURI reports whether a URI points at a Go/Java/TS source file
// the generation loop should watch for cartographer re-extraction.
func isSourceFileURI(uri string) bool {
	lower := strings.ToLower(uri)
	switch {
	case strings.HasSuffix(lower, ".go"),
		strings.HasSuffix(lower, ".java"),
		strings.HasSuffix(lower, ".ts"),
		strings.HasSuffix(lower, ".tsx"):
		return true
	}
	return false
}

// sourceGlobsForLanguages returns the file globs that map to the set of
// cartographer-enabled languages.
func sourceGlobsForLanguages(langs []string) []string {
	if len(langs) == 0 {
		return []string{"**/*.go", "**/*.java", "**/*.ts", "**/*.tsx"}
	}
	var globs []string
	for _, l := range langs {
		switch strings.ToLower(l) {
		case "go":
			globs = append(globs, "**/*.go")
		case "java":
			globs = append(globs, "**/*.java")
		case "typescript", "ts":
			globs = append(globs, "**/*.ts", "**/*.tsx")
		}
	}
	return globs
}
