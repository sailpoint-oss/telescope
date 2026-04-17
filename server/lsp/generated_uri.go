package lsp

import (
	"path/filepath"
	"strings"

	"github.com/LukasParke/gossip/protocol"
)

// GeneratedURIScheme is the virtual-document URI scheme the extension uses
// to display the in-memory spec when no disk path is configured.
const GeneratedURIScheme = "telescope-generated"

// uriMatchesGeneratedSpec reports whether the given URI should be served by
// the generation-loop builder. Matches the telescope-generated:// virtual
// URI and any file:// URI that suffix-equals the loop's resolved output
// path.
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
	clean := filepath.Clean(abs)
	norm := string(protocol.NormalizeURI(uri))
	return strings.HasSuffix(strings.ToLower(norm), strings.ToLower(filepath.ToSlash(clean)))
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
