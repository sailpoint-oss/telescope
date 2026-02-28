package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var noUnknownFormatsMeta = rules.RuleMeta{
	ID:          "no-unknown-formats",
	Description: "Schema format values should be known/standard formats.",
	Severity:    protocol.SeverityWarning,
	Category:    rules.CategoryTypes,
	Recommended: true,
	HowToFix:    "Use a known format (e.g., date-time, email, uri, uuid, int32, int64, float, double).",
	DocURL:      rules.DocBaseURL + "no-unknown-formats",
}

var knownFormats = map[string]bool{
	"int32": true, "int64": true,
	"float": true, "double": true,
	"byte": true, "binary": true,
	"date": true, "date-time": true,
	"password": true, "email": true,
	"hostname": true, "uri": true,
	"uri-reference": true, "uuid": true,
	"ipv4": true, "ipv6": true,
	"uri-template": true, "json-pointer": true,
	"relative-json-pointer": true, "regex": true,
	"duration": true, "time": true,
}

func registerTypesAnalyzers(s *gossip.Server) {
	rules.Define("no-unknown-formats", noUnknownFormatsMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Format != "" && !knownFormats[schema.Format] {
				r.At(schema.Loc, "Unknown format '%s' at %s", schema.Format, pointer)
			}
		},
	).Register(s)
}
