package rules

import (
	"regexp"
	"strings"
	"unicode"
)

// IsCapitalized reports whether s starts with an uppercase letter.
func IsCapitalized(s string) bool {
	if s == "" {
		return false
	}
	return unicode.IsUpper(rune(s[0]))
}

// IsKebabCase reports whether s uses kebab-case (lowercase with hyphens, no
// underscores or uppercase letters).
func IsKebabCase(s string) bool {
	for _, r := range s {
		if unicode.IsUpper(r) || r == '_' {
			return false
		}
	}
	return true
}

// ContainsHTTPVerb reports whether a path string contains an HTTP method name
// as a standalone segment.
func ContainsHTTPVerb(s string) bool {
	lower := strings.ToLower(s)
	verbs := []string{"get", "put", "post", "delete", "patch", "head", "options", "trace"}
	parts := strings.Split(lower, "/")
	for _, part := range parts {
		part = strings.Trim(part, "{}")
		for _, v := range verbs {
			if part == v {
				return true
			}
		}
	}
	return false
}

// HasTrailingSlash reports whether a path has a trailing slash (ignoring root "/").
func HasTrailingSlash(path string) bool {
	return len(path) > 1 && strings.HasSuffix(path, "/")
}

// IsHTTPS reports whether a URL starts with https://.
func IsHTTPS(url string) bool {
	return strings.HasPrefix(strings.ToLower(url), "https://")
}

// ContainsCredentials reports whether a URL embeds credentials (user@host).
func ContainsCredentials(rawURL string) bool {
	schemeEnd := strings.Index(rawURL, "://")
	if schemeEnd < 0 {
		return false
	}
	rest := rawURL[schemeEnd+3:]
	slashIdx := strings.Index(rest, "/")
	hostPart := rest
	if slashIdx >= 0 {
		hostPart = rest[:slashIdx]
	}
	return strings.Contains(hostPart, "@")
}

var PathParamRegex = regexp.MustCompile(`\{([^}]+)\}`)

// ExtractPathParams returns the names of all path template parameters in path.
func ExtractPathParams(path string) []string {
	matches := PathParamRegex.FindAllStringSubmatch(path, -1)
	params := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) > 1 {
			params = append(params, m[1])
		}
	}
	return params
}

// NonParamSegments returns the path segments that are not template parameters.
func NonParamSegments(path string) []string {
	parts := strings.Split(path, "/")
	var segments []string
	for _, p := range parts {
		if p == "" || strings.HasPrefix(p, "{") {
			continue
		}
		segments = append(segments, p)
	}
	return segments
}
