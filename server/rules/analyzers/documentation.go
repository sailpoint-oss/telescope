package analyzers

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	deprecatedDescriptionMeta = rules.RuleMeta{
		ID:          "deprecated-description",
		Description: "Deprecated items should include a description explaining the deprecation.",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
		HowToFix:    "Add a description to the deprecated item explaining why it is deprecated and what to use instead.",
		DocURL:      rules.DocBaseURL + "deprecated-description",
	}

	enumDescriptionMeta = rules.RuleMeta{
		ID:          "enum-description",
		Description: "Enum schemas should include a description.",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
		HowToFix:    "Add a description explaining the enum values.",
		DocURL:      rules.DocBaseURL + "enum-description",
	}
)

func registerDocumentationAnalyzers(s *gossip.Server) {
	rules.Define("deprecated-description", deprecatedDescriptionMeta).
		Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if op.Deprecated && op.Description.Text == "" {
				r.At(op.Loc, "Deprecated operation %s %s should have a description", method, path)
			}
		}).
		Schemas(func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && schema.Deprecated && schema.Description.Text == "" {
				r.At(schema.Loc, "Deprecated schema '%s' should have a description", name)
			}
		}).
		Register(s)

	rules.Define("enum-description", enumDescriptionMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && len(schema.Enum) > 0 && schema.Description.Text == "" {
				r.At(schema.Loc, "Enum schema '%s' should have a description", name)
			}
		},
	).Register(s)
}
