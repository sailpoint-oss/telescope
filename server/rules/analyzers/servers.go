package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	serversDefinedMeta = rules.RuleMeta{
		ID:          "oas3-api-servers",
		Description: "OpenAPI document should define at least one server.",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryServers,
		Recommended: true,
		HowToFix:    "Add a 'servers' section with at least one server URL.",
		DocURL:      rules.DocBaseURL + "oas3-api-servers",
	}

	serverURLHTTPSMeta = rules.RuleMeta{
		ID:          "server-url-https",
		Description: "Server URLs should use HTTPS.",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryServers,
		Recommended: true,
		HowToFix:    "Change the server URL to use https:// instead of http://.",
		DocURL:      rules.DocBaseURL + "server-url-https",
	}
)

func registerServersAnalyzers(s *gossip.Server) {
	rules.Define("oas3-api-servers", serversDefinedMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if !idx.IsOpenAPI() {
				return
			}
			if len(idx.Document.Servers) == 0 {
				r.At(idx.Document.Loc, "No servers defined; add a 'servers' section")
			}
		},
	).Register(s)

	rules.Define("server-url-https", serverURLHTTPSMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if !idx.IsOpenAPI() {
				return
			}
			for _, srv := range idx.Document.Servers {
				if srv.URL != "" && !isHTTPS(srv.URL) {
					r.At(srv.URLLoc, "Server URL '%s' should use HTTPS", srv.URL)
				}
			}
		},
	).Register(s)
}
