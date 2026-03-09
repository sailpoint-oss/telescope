package analyzers

import (
	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	noAPIKeyInQueryMeta = rules.RuleMeta{
		ID:          "no-api-key-in-query",
		Description: "API keys should not be passed in query parameters.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategorySecurity,
		Recommended: true,
		HowToFix:    "Use header or cookie authentication instead of query parameters.",
		DocURL:      rules.DocBaseURL + "no-api-key-in-query",
	}

	oauthFlowURLsMeta = rules.RuleMeta{
		ID:          "oauth-flow-urls",
		Description: "OAuth flow URLs should be absolute and use HTTPS.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategorySecurity,
		Recommended: true,
		HowToFix:    "Use absolute HTTPS URLs for OAuth flow endpoints.",
		DocURL:      rules.DocBaseURL + "oauth-flow-urls",
	}

	securityGlobalOrOperationMeta = rules.RuleMeta{
		ID:          "security-global-or-operation",
		Description: "Security should be defined globally or on every operation.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategorySecurity,
		Recommended: true,
		HowToFix:    "Add security requirements either globally or to each operation.",
		DocURL:      rules.DocBaseURL + "security-global-or-operation",
	}

	securitySchemesDefinedMeta = rules.RuleMeta{
		ID:          "security-schemes-defined",
		Description: "Security requirements must reference defined security schemes.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategorySecurity,
		Recommended: true,
		HowToFix:    "Define the security scheme in components/securitySchemes.",
		DocURL:      rules.DocBaseURL + "security-schemes-defined",
	}
)

func registerSecurityAnalyzers(s *gossip.Server) {
	rules.Define("no-api-key-in-query", noAPIKeyInQueryMeta).SecuritySchemes(
		func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "apiKey" && ss.In == "query" {
				r.At(ss.Loc, "Security scheme '%s' passes API key in query; use header instead", name)
			}
		},
	).Register(s)

	rules.Define("oauth-flow-urls", oauthFlowURLsMeta).SecuritySchemes(
		func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Flows == nil {
				return
			}
			flows := []*openapi.OAuthFlow{
				ss.Flows.Implicit,
				ss.Flows.Password,
				ss.Flows.ClientCredentials,
				ss.Flows.AuthorizationCode,
			}
			for _, flow := range flows {
				if flow == nil {
					continue
				}
				if flow.AuthorizationURL != "" && !isHTTPS(flow.AuthorizationURL) {
					r.At(flow.AuthorizationURLLoc, "OAuth authorizationUrl in '%s' should use HTTPS", name)
				}
				if flow.TokenURL != "" && !isHTTPS(flow.TokenURL) {
					r.At(flow.TokenURLLoc, "OAuth tokenUrl in '%s' should use HTTPS", name)
				}
			}
		},
	).Register(s)

	rules.Define("security-global-or-operation", securityGlobalOrOperationMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if len(idx.Document.Security) > 0 {
				return
			}
			for path, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					if len(mo.Operation.Security) == 0 {
						r.At(mo.Operation.Loc, "Operation %s %s has no security (and none defined globally)", mo.Method, path)
					}
				}
			}
		},
	).Register(s)

	rules.Define("security-schemes-defined", securitySchemesDefinedMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			allReqs := append([]openapi.SecurityRequirement{}, idx.Document.Security...)
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					allReqs = append(allReqs, mo.Operation.Security...)
				}
			}

			// Collect available scheme names for suggestions
			var availableSchemes []string
			for name := range idx.SecuritySchemes {
				availableSchemes = append(availableSchemes, name)
			}

			for _, req := range allReqs {
				for _, entry := range req.Entries {
					if _, ok := idx.SecuritySchemes[entry.Name]; !ok {
						loc := entry.NameLoc
						if loc.Node == nil {
							loc = openapi.Loc{Range: ctypes.FileStartRange}
						}
						// Suggest closest match
						suggestion := closestString(entry.Name, availableSchemes)
						if suggestion != "" {
							r.At(loc, "Security requirement references undefined scheme '%s'. Did you mean '%s'?", entry.Name, suggestion)
						} else {
							r.At(loc, "Security requirement references undefined scheme '%s'", entry.Name)
						}
					}
				}
			}
		},
	).Register(s)
}
