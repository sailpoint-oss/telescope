package analyzers

import "github.com/sailpoint-oss/telescope/server/rules"

func isCapitalized(s string) bool     { return rules.IsCapitalized(s) }
func isKebabCase(s string) bool       { return rules.IsKebabCase(s) }
func containsHTTPVerb(s string) bool   { return rules.ContainsHTTPVerb(s) }
func hasTrailingSlash(path string) bool { return rules.HasTrailingSlash(path) }
func isHTTPS(url string) bool          { return rules.IsHTTPS(url) }
func containsCredentials(url string) bool { return rules.ContainsCredentials(url) }
