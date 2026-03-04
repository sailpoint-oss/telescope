package analyzers

import (
	"strconv"
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	exampleTypeMismatchMeta = rules.RuleMeta{
		ID:          "example-type-mismatch",
		Description: "Example values should match the declared schema type.",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryTypes,
		Recommended: true,
		HowToFix:    "Update the example value to match the schema type.",
		DocURL:      rules.DocBaseURL + "example-type-mismatch",
	}

	exampleEnumMismatchMeta = rules.RuleMeta{
		ID:          "example-enum-mismatch",
		Description: "Example values should be one of the declared enum values.",
		Severity:    protocol.SeverityWarning,
		Category:    rules.CategoryTypes,
		Recommended: true,
		HowToFix:    "Use one of the declared enum values in the example.",
		DocURL:      rules.DocBaseURL + "example-enum-mismatch",
	}
)

func registerExampleValidationAnalyzers(s *gossip.Server) {
	// Validate example values against schema types
	rules.Define("example-type-mismatch", exampleTypeMismatchMeta).
		RecursiveSchemas(func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Example == nil || schema.Type == "" {
				return
			}
			val := strings.TrimSpace(schema.Example.Value)
			if val == "" {
				return
			}
			if !valueMatchesType(val, schema.Type) {
				r.At(schema.Example.Loc, "Example value '%s' does not match schema type '%s'", truncateVal(val), schema.Type)
			}
		}).
		Register(s)

	// Validate example values against enum constraints
	rules.Define("example-enum-mismatch", exampleEnumMismatchMeta).
		RecursiveSchemas(func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Example == nil || len(schema.Enum) == 0 {
				return
			}
			val := strings.Trim(strings.TrimSpace(schema.Example.Value), "\"'")
			found := false
			for _, e := range schema.Enum {
				if e == val {
					found = true
					break
				}
			}
			if !found {
				r.At(schema.Example.Loc, "Example value '%s' is not in enum [%s]", truncateVal(val), strings.Join(schema.Enum, ", "))
			}
		}).
		Register(s)
}

// valueMatchesType does a best-effort check that a YAML/JSON value matches the declared type.
func valueMatchesType(val, schemaType string) bool {
	// Remove quotes for string comparisons
	unquoted := strings.Trim(val, "\"'")

	switch schemaType {
	case "string":
		// In YAML, strings can be unquoted. Most values are valid strings unless
		// they're clearly a different type.
		return true // strings are very permissive in YAML
	case "integer":
		_, err := strconv.ParseInt(unquoted, 10, 64)
		return err == nil
	case "number":
		_, err := strconv.ParseFloat(unquoted, 64)
		return err == nil
	case "boolean":
		lower := strings.ToLower(unquoted)
		return lower == "true" || lower == "false"
	case "array":
		return strings.HasPrefix(val, "[") || strings.HasPrefix(val, "-")
	case "object":
		return strings.HasPrefix(val, "{") || strings.Contains(val, ":")
	default:
		return true
	}
}

func truncateVal(v string) string {
	if len(v) > 40 {
		return v[:37] + "..."
	}
	return v
}
