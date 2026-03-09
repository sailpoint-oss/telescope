package analyzers

import (
	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	additionalPropertiesMeta = rules.RuleMeta{
		ID:          "additional-properties",
		Description: "Object schemas should define additionalProperties explicitly.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Add 'additionalProperties: false' or define allowed additional properties.",
		DocURL:      rules.DocBaseURL + "additional-properties",
	}

	allOfMixedTypesMeta = rules.RuleMeta{
		ID:          "allof-mixed-types",
		Description: "allOf should not combine schemas of different types.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Ensure all schemas in allOf have compatible types.",
		DocURL:      rules.DocBaseURL + "allof-mixed-types",
	}

	allOfStructureMeta = rules.RuleMeta{
		ID:          "allof-structure",
		Description: "allOf schemas must be structurally valid.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Review the allOf composition for structural issues.",
		DocURL:      rules.DocBaseURL + "allof-structure",
	}

	arrayItemsMeta = rules.RuleMeta{
		ID:          "array-items",
		Description: "Array schemas must define items.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Add an 'items' definition to the array schema.",
		DocURL:      rules.DocBaseURL + "array-items",
	}

	discriminatorMappingMeta = rules.RuleMeta{
		ID:          "discriminator-mapping",
		Description: "Discriminator mapping values must reference valid schemas.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Ensure each discriminator mapping value references an existing schema.",
		DocURL:      rules.DocBaseURL + "discriminator-mapping",
	}

	requestBodyContentMeta = rules.RuleMeta{
		ID:          "request-body-content",
		Description: "Request bodies must have content defined.",
		Severity:    ctypes.SeverityError,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Add a 'content' section to the request body.",
		DocURL:      rules.DocBaseURL + "request-body-content",
	}

	typeRequiredMeta = rules.RuleMeta{
		ID:          "type-required",
		Description: "Schemas should have a 'type' field defined.",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryStructure,
		Recommended: true,
		HowToFix:    "Add the 'type' field to the schema.",
		DocURL:      rules.DocBaseURL + "type-required",
	}
)

func registerStructureAnalyzers(s *gossip.Server) {
	rules.Define("additional-properties", additionalPropertiesMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && schema.Type == "object" && len(schema.Properties) > 0 && schema.AdditionalProperties == nil {
				r.At(schema.Loc, "Schema '%s' should define additionalProperties", name)
			}
		},
	).Register(s)

	rules.Define("allof-mixed-types", allOfMixedTypesMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name == "" || len(schema.AllOf) < 2 {
				return
			}
			var types []string
			for _, sub := range schema.AllOf {
				if sub.Type != "" {
					types = append(types, sub.Type)
				}
			}
			if len(types) >= 2 {
				first := types[0]
				for _, t := range types[1:] {
					if t != first {
						r.At(schema.Loc, "Schema '%s' allOf mixes types: %s and %s", name, first, t)
						break
					}
				}
			}
		},
	).Register(s)

	rules.Define("allof-structure", allOfStructureMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && len(schema.AllOf) == 1 && schema.AllOf[0].Ref == "" {
				r.At(schema.Loc, "Schema '%s' uses allOf with a single non-$ref item; consider inlining", name)
			}
		},
	).Register(s)

	rules.Define("array-items", arrayItemsMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "array" && schema.Items == nil && schema.Ref == "" {
				r.At(schema.Loc, "Array schema at %s must define 'items'", pointer)
			}
		},
	).Register(s)

	rules.Define("discriminator-mapping", discriminatorMappingMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.Components == nil {
				return
			}
			for name, schema := range idx.Document.Components.Schemas {
				if schema.Discriminator == nil || schema.Discriminator.Mapping == nil {
					continue
				}
				for key, ref := range schema.Discriminator.Mapping {
					if _, err := idx.Resolve(ref); err != nil {
						r.At(schema.Discriminator.Loc, "Discriminator mapping '%s' in '%s' references unresolvable: %s", key, name, ref)
					}
				}
			}
		},
	).Register(s)

	rules.Define("request-body-content", requestBodyContentMeta).RequestBodies(
		func(path, method string, rb *openapi.RequestBody, r *rules.Reporter) {
			if rb.Ref == "" && len(rb.Content) == 0 {
				r.At(rb.Loc, "Request body for %s %s must define content", method, path)
			}
		},
	).Register(s)

	rules.Define("type-required", typeRequiredMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if name != "" && schema.Type == "" && schema.Ref == "" &&
				len(schema.AllOf) == 0 && len(schema.AnyOf) == 0 && len(schema.OneOf) == 0 {
				r.At(schema.Loc, "Schema '%s' should define a 'type'", name)
			}
		},
	).Register(s)
}
