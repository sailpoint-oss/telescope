package analyzers

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var unresolvedRefMeta = rules.RuleMeta{
	ID:          "unresolved-ref",
	Description: "Reports $ref values that cannot be resolved.",
	Severity:    protocol.SeverityError,
	Category:    rules.CategoryReferences,
	Recommended: true,
	HowToFix:    "Check the $ref path and ensure the target component exists.",
	DocURL:      rules.DocBaseURL + "unresolved-ref",
}

func registerUnresolvedRef(s *gossip.Server) {
	rules.DefaultRegistry.Register(unresolvedRefMeta)

	_, analyzer := unresolvedRefAnalyzer()
	s.Analyze("unresolved-ref", analyzer)
}

func unresolvedRefAnalyzer() (string, treesitter.Analyzer) {
	return "unresolved-ref", treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx := rules.GetIndex(ctx)
			if idx == nil {
				return nil
			}

			data := rules.GetAnalysisData(ctx)

			r := rules.NewReporter("unresolved-ref", unresolvedRefMeta.Severity)

			for target, usages := range idx.Refs {
				if _, err := idx.Resolve(target); err == nil {
					continue // resolved locally
				}

				if strings.HasPrefix(target, "#") {
					// Local ref that failed to resolve — suggest closest match
					suggestion := findClosestRef(target, idx)
					for _, usage := range usages {
						if suggestion != "" {
							r.At(usage.Loc, "Cannot resolve $ref: %s. Did you mean '%s'?", target, suggestion)
						} else {
							r.At(usage.Loc, "Cannot resolve $ref: %s", target)
						}
					}
					continue
				}

				// External ref: try cross-file resolver if available
				if data != nil && data.Resolver != nil && data.DocURI != "" {
					if data.Resolver.CanResolve(data.DocURI, target) {
						continue // resolved cross-file
					}
				}

				for _, usage := range usages {
					r.At(usage.Loc, "Cannot resolve $ref: %s", target)
				}
			}

			return r.Diagnostics()
		},
	}
}

// findClosestRef finds the closest matching component ref for a local $ref target.
func findClosestRef(target string, idx *openapi.Index) string {
	if idx.Document.Components == nil {
		return ""
	}

	// Extract the component kind and name from the target
	parts := strings.Split(strings.TrimPrefix(target, "#/"), "/")
	if len(parts) < 2 {
		return ""
	}
	kind := parts[len(parts)-2]
	name := parts[len(parts)-1]

	// Collect available names for this component kind
	var available []string
	switch kind {
	case "schemas":
		for n := range idx.Schemas {
			available = append(available, n)
		}
	case "parameters":
		for n := range idx.Parameters {
			available = append(available, n)
		}
	case "responses":
		for n := range idx.Responses {
			available = append(available, n)
		}
	case "securitySchemes":
		for n := range idx.SecuritySchemes {
			available = append(available, n)
		}
	default:
		return ""
	}

	bestDist := len(name)/2 + 1 // only suggest if distance < half the name length
	bestMatch := ""
	for _, a := range available {
		d := levenshtein(strings.ToLower(name), strings.ToLower(a))
		if d < bestDist {
			bestDist = d
			bestMatch = openapi.ComponentRefPath(kind, a)
		}
	}
	return bestMatch
}

// levenshtein computes the edit distance between two strings.
func levenshtein(a, b string) int {
	la, lb := len(a), len(b)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	prev := make([]int, lb+1)
	curr := make([]int, lb+1)

	for j := 0; j <= lb; j++ {
		prev[j] = j
	}

	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			curr[j] = min3(curr[j-1]+1, prev[j]+1, prev[j-1]+cost)
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

func min3(a, b, c int) int {
	if a < b {
		if a < c {
			return a
		}
		return c
	}
	if b < c {
		return b
	}
	return c
}
