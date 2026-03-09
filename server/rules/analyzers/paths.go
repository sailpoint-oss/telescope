package analyzers

import (
	"regexp"
	"strings"

	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	kebabCaseMeta = rules.RuleMeta{
		ID:          "kebab-case",
		Description: "Path segments should use kebab-case.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Rename path segments to use kebab-case (lowercase with hyphens).",
		DocURL:      rules.DocBaseURL + "kebab-case",
	}

	noTrailingSlashMeta = rules.RuleMeta{
		ID:          "path-keys-no-trailing-slash",
		Description: "Paths should not have trailing slashes.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Remove the trailing slash from the path.",
		DocURL:      rules.DocBaseURL + "path-keys-no-trailing-slash",
	}

	noHTTPVerbsMeta = rules.RuleMeta{
		ID:          "no-http-verbs",
		Description: "Path segments should not contain HTTP verbs.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Remove the HTTP verb from the path segment; the HTTP method already defines the action.",
		DocURL:      rules.DocBaseURL + "no-http-verbs",
	}

	paramsMatchMeta = rules.RuleMeta{
		ID:          "path-params",
		Description: "Path parameters must match those declared in the operation.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Ensure path template parameters and operation parameter definitions match.",
		DocURL:      rules.DocBaseURL + "path-params",
	}

	templateValidMeta = rules.RuleMeta{
		ID:          "path-declarations-must-exist",
		Description: "Path templates must be syntactically valid.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Fix the path template syntax (e.g., matching braces).",
		DocURL:      rules.DocBaseURL + "path-declarations-must-exist",
	}

	idUniqueInPathMeta = rules.RuleMeta{
		ID:          "id-unique-in-path",
		Description: "Path parameter names must be unique within a path.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Rename duplicate path parameter names.",
		DocURL:      rules.DocBaseURL + "id-unique-in-path",
	}

	casingConsistencyMeta = rules.RuleMeta{
		ID:          "casing-consistency",
		Description: "Path segments should use consistent casing across the API.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Use consistent casing (preferably kebab-case) across all paths.",
		DocURL:      rules.DocBaseURL + "casing-consistency",
	}

	noGenericParamNamesMeta = rules.RuleMeta{
		ID:          "path-param-values-no-generic-syntax",
		Description: "Path parameter names should not use generic syntax like <id> or :id.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryPaths,
		Recommended: true,
		HowToFix:    "Use OpenAPI path template syntax: {paramName}.",
		DocURL:      rules.DocBaseURL + "path-param-values-no-generic-syntax",
	}
)

var genericSyntaxRe = regexp.MustCompile(`<[^>]+>|:[a-zA-Z_]+`)

func registerPathsAnalyzers(s *gossip.Server) {
	rules.Define("kebab-case", kebabCaseMeta).Paths(func(path string, item *openapi.PathItem, r *rules.Reporter) {
		for _, seg := range rules.NonParamSegments(path) {
			if !isKebabCase(seg) {
				r.At(item.PathLoc, "Path segment '%s' in %s should use kebab-case", seg, path)
			}
		}
	}).Register(s)

	rules.Define("path-keys-no-trailing-slash", noTrailingSlashMeta).Paths(
		func(path string, item *openapi.PathItem, r *rules.Reporter) {
			if hasTrailingSlash(path) {
				r.At(item.PathLoc, "Path '%s' should not have a trailing slash", path)
			}
		},
	).Register(s)

	rules.Define("no-http-verbs", noHTTPVerbsMeta).Paths(
		func(path string, item *openapi.PathItem, r *rules.Reporter) {
			if containsHTTPVerb(path) {
				r.At(item.PathLoc, "Path '%s' contains an HTTP verb in a segment", path)
			}
		},
	).Register(s)

	rules.Define("path-params", paramsMatchMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			for path, item := range idx.Document.Paths {
				templateParams := rules.ExtractPathParams(path)
				for _, mo := range item.Operations() {
					declaredParams := make(map[string]bool)
					for _, p := range item.Parameters {
						if p.In == "path" {
							declaredParams[p.Name] = true
						}
					}
					for _, p := range mo.Operation.Parameters {
						if p.In == "path" {
							declaredParams[p.Name] = true
						}
					}
					for _, tp := range templateParams {
						if !declaredParams[tp] {
							r.At(openapi.LocOrFallback(mo.Operation.ParametersLoc, mo.Operation.Loc), "Path parameter '{%s}' in %s not declared in %s operation", tp, path, mo.Method)
						}
					}
				}
			}
		},
	).Register(s)

	rules.Define("path-declarations-must-exist", templateValidMeta).Paths(
		func(path string, item *openapi.PathItem, r *rules.Reporter) {
			opens := strings.Count(path, "{")
			closes := strings.Count(path, "}")
			if opens != closes {
				r.At(item.PathLoc, "Path '%s' has mismatched braces", path)
			}
		},
	).Register(s)

	rules.Define("id-unique-in-path", idUniqueInPathMeta).Paths(
		func(path string, item *openapi.PathItem, r *rules.Reporter) {
			params := rules.ExtractPathParams(path)
			seen := make(map[string]bool)
			for _, p := range params {
				if seen[p] {
					r.At(item.PathLoc, "Duplicate path parameter '{%s}' in %s", p, path)
				}
				seen[p] = true
			}
		},
	).Register(s)

	rules.Define("casing-consistency", casingConsistencyMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if len(idx.Document.Paths) < 2 {
				return
			}
			casingCounts := map[string]int{"kebab": 0, "camel": 0, "snake": 0, "other": 0}
			for path := range idx.Document.Paths {
			for _, seg := range rules.NonParamSegments(path) {
				switch {
				case rules.IsKebabCase(seg) && strings.Contains(seg, "-"):
						casingCounts["kebab"]++
					case strings.Contains(seg, "_"):
						casingCounts["snake"]++
					case seg != strings.ToLower(seg):
						casingCounts["camel"]++
					default:
						casingCounts["other"]++
					}
				}
			}

			dominant := "kebab"
			max := 0
			for style, count := range casingCounts {
				if count > max {
					max = count
					dominant = style
				}
			}

			for path, item := range idx.Document.Paths {
			for _, seg := range rules.NonParamSegments(path) {
				mismatch := false
				switch dominant {
				case "kebab":
					mismatch = !rules.IsKebabCase(seg)
					case "snake":
						mismatch = strings.Contains(seg, "-") || seg != strings.ToLower(seg)
					case "camel":
						mismatch = strings.Contains(seg, "-") || strings.Contains(seg, "_")
					}
					if mismatch {
						r.At(item.PathLoc, "Path segment '%s' in %s uses different casing than the dominant style (%s)", seg, path, dominant)
					}
				}
			}
		},
	).Register(s)

	rules.Define("path-param-values-no-generic-syntax", noGenericParamNamesMeta).Paths(
		func(path string, item *openapi.PathItem, r *rules.Reporter) {
			if genericSyntaxRe.MatchString(path) {
				r.At(item.PathLoc, "Path '%s' uses non-OpenAPI parameter syntax; use {param} instead", path)
			}
		},
	).Register(s)
}

