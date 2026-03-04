package analyzers

import (
	"strings"

	"github.com/sailpoint-oss/telescope/server/rules"
)

func isCapitalized(s string) bool     { return rules.IsCapitalized(s) }
func isKebabCase(s string) bool       { return rules.IsKebabCase(s) }
func containsHTTPVerb(s string) bool   { return rules.ContainsHTTPVerb(s) }
func hasTrailingSlash(path string) bool { return rules.HasTrailingSlash(path) }
func isHTTPS(url string) bool          { return rules.IsHTTPS(url) }
func containsCredentials(url string) bool { return rules.ContainsCredentials(url) }

// closestString finds the closest match for target in candidates using Levenshtein distance.
func closestString(target string, candidates []string) string {
	bestDist := len(target)/2 + 1
	bestMatch := ""
	tLower := strings.ToLower(target)
	for _, c := range candidates {
		d := levenshtein(tLower, strings.ToLower(c))
		if d < bestDist {
			bestDist = d
			bestMatch = c
		}
	}
	return bestMatch
}
