package analyzers

import (
	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	migrationNullableMeta = rules.RuleMeta{
		ID:          "migration-nullable",
		Description: "In OpenAPI 3.1, use type array ['string', 'null'] instead of nullable: true.",
		Severity:    ctypes.SeverityInfo,
		Category:    rules.CategoryTypes,
		Recommended: false,
		Formats:     []openapi.Format{openapi.Format(openapi.Version30)},
		HowToFix:    "When migrating to 3.1, replace `nullable: true` with `type: ['string', 'null']`.",
		DocURL:      rules.DocBaseURL + "migration-nullable",
	}
)

func registerMigrationAnalyzers(s *gossip.Server) {
	// nullable → type array migration hint (only for 3.0 specs)
	rules.Define("migration-nullable", migrationNullableMeta).
		Custom(func(idx *openapi.Index, r *rules.Reporter) {
			// Only suggest migration for 3.0 specs
			if idx.Version != openapi.Version30 {
				return
			}
			// Walk all schemas looking for nullable usage
			if idx.Document.Components != nil {
				for _, schema := range idx.Document.Components.Schemas {
					checkNullable(schema, r)
				}
			}
			for _, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					for _, p := range mo.Operation.Parameters {
						if p.Schema != nil {
							checkNullable(p.Schema, r)
						}
					}
					if mo.Operation.RequestBody != nil {
						for _, mt := range mo.Operation.RequestBody.Content {
							if mt.Schema != nil {
								checkNullable(mt.Schema, r)
							}
						}
					}
					for _, resp := range mo.Operation.Responses {
						for _, mt := range resp.Content {
							if mt.Schema != nil {
								checkNullable(mt.Schema, r)
							}
						}
					}
				}
			}
		}).
		Register(s)
}

func checkNullable(schema *openapi.Schema, r *rules.Reporter) {
	if schema.Nullable && schema.Type != "" {
		r.At(schema.Loc,
			"OpenAPI 3.1 migration: replace `nullable: true` with `type: ['%s', 'null']`",
			schema.Type,
		)
	}
	for _, prop := range schema.Properties {
		checkNullable(prop, r)
	}
	if schema.Items != nil {
		checkNullable(schema.Items, r)
	}
}
