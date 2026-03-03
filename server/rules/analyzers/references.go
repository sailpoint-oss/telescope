package analyzers

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
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
					// Local ref that failed to resolve
					for _, usage := range usages {
						r.At(usage.Loc, "Cannot resolve $ref: %s", target)
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
