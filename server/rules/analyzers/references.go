package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
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
	rules.Define("unresolved-ref", unresolvedRefMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if !idx.IsOpenAPI() {
				return
			}
			for target, usages := range idx.Refs {
				if _, err := idx.Resolve(target); err != nil {
					for _, usage := range usages {
						r.At(usage.Loc, "Cannot resolve $ref: %s", target)
					}
				}
			}
		},
	).Register(s)
}
