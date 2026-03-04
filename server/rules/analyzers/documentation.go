package analyzers

import (
	"fmt"
	"strings"

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

	deprecatedOperationMeta = rules.RuleMeta{
		ID:          "deprecated-operation",
		Description: "Deprecated operations are marked with strikethrough in the IDE.",
		Severity:    protocol.SeverityHint,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
		DocURL:      rules.DocBaseURL + "deprecated-operation",
	}

	deprecatedSchemaMeta = rules.RuleMeta{
		ID:          "deprecated-schema",
		Description: "Deprecated schemas are marked with strikethrough in the IDE.",
		Severity:    protocol.SeverityHint,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
		DocURL:      rules.DocBaseURL + "deprecated-schema",
	}

	deprecatedRefUsageMeta = rules.RuleMeta{
		ID:          "deprecated-ref-usage",
		Description: "References to deprecated components are flagged.",
		Severity:    protocol.SeverityInformation,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
		HowToFix:    "Consider migrating to a non-deprecated alternative.",
		DocURL:      rules.DocBaseURL + "deprecated-ref-usage",
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

	// Deprecation tracking: tag deprecated operations with DiagnosticTag.Deprecated
	rules.Define("deprecated-operation", deprecatedOperationMeta).
		Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if op.Deprecated {
				r.WithTags(protocol.DiagnosticTagDeprecated).
					At(op.Loc, "Operation %s %s is deprecated", strings.ToUpper(method), path)
			}
		}).
		Register(s)

	// Tag deprecated schemas with DiagnosticTag.Deprecated
	rules.Define("deprecated-schema", deprecatedSchemaMeta).
		Schemas(func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && schema.Deprecated {
				r.WithTags(protocol.DiagnosticTagDeprecated).
					At(schema.NameLoc, "Schema '%s' is deprecated", name)
			}
		}).
		Register(s)

	// Detect $ref to deprecated components and flag the usage
	rules.Define("deprecated-ref-usage", deprecatedRefUsageMeta).
		Custom(func(idx *openapi.Index, r *rules.Reporter) {
			for target, usages := range idx.Refs {
				resolved, err := idx.Resolve(target)
				if err != nil {
					continue
				}

				var isDeprecated bool
				var replacement string
				switch t := resolved.(type) {
				case *openapi.Schema:
					isDeprecated = t.Deprecated
					if ext, ok := t.Extensions["x-telescope-replacement"]; ok {
						replacement = ext.Value
					}
				case *openapi.Parameter:
					isDeprecated = t.Deprecated
				}

				if !isDeprecated {
					continue
				}

				for _, usage := range usages {
					msg := fmt.Sprintf("References deprecated component '%s'", refBaseName(target))
					if replacement != "" {
						msg += fmt.Sprintf(". Consider using '%s' instead", replacement)
					}
					r.WithTags(protocol.DiagnosticTagDeprecated).At(usage.Loc, "%s", msg)
				}
			}
		}).
		Register(s)
}

// refBaseName extracts the last segment from a $ref path.
func refBaseName(ref string) string {
	parts := strings.Split(ref, "/")
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return ref
}
