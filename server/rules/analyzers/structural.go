package analyzers

import (
	"sync"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/jsonschema"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/schemas"
)

var structuralMeta = rules.RuleMeta{
	ID:          "oas3-schema",
	Description: "Validates the document structure against the OpenAPI JSON Schema.",
	Severity:    protocol.SeverityError,
	Category:    rules.CategoryStructure,
	Recommended: true,
	HowToFix:    "Fix the invalid or unknown properties flagged by the validator.",
	DocURL:      rules.DocBaseURL + "oas3-schema",
}

var (
	schemaOnce    sync.Once
	compiledCache map[openapi.Version]*jsonschema.CompiledSchema
)

func loadSchemas() {
	compiledCache = make(map[openapi.Version]*jsonschema.CompiledSchema, 4)

	schemaFiles := map[openapi.Version]string{
		openapi.Version20: "generated/openapi-2.0-root.json",
		openapi.Version30: "generated/openapi-3.0-root.json",
		openapi.Version31: "generated/openapi-3.1-root.json",
		openapi.Version32: "generated/openapi-3.2-root.json",
	}

	for ver, path := range schemaFiles {
		data, err := schemas.FS.ReadFile(path)
		if err != nil {
			continue
		}
		compiled, err := jsonschema.Load(data)
		if err != nil {
			continue
		}
		compiledCache[ver] = compiled
	}
}

func getSchema(ver openapi.Version) *jsonschema.CompiledSchema {
	schemaOnce.Do(loadSchemas)
	return compiledCache[ver]
}

// GetSchemaForVersion returns the compiled JSON Schema for the given OpenAPI
// version, or nil if no schema is available. Intended for use in tests.
func GetSchemaForVersion(ver openapi.Version) *jsonschema.CompiledSchema {
	return getSchema(ver)
}

func registerStructuralValidation(s *gossip.Server) {
	rules.DefaultRegistry.Register(structuralMeta)

	s.Analyze("oas3-schema", treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx := rules.GetIndex(ctx)
			if idx == nil || idx.Version == openapi.VersionUnknown {
				return nil
			}

			schema := getSchema(idx.Version)
			if schema == nil {
				return nil
			}

			result := jsonschema.Validate(ctx.Tree, schema, jsonschema.ValidateOptions{
				Source:         "oas3-schema",
				Severity:       protocol.SeverityError,
				MaxDiagnostics: 100,
			})

			return result.Diagnostics
		},
	})
}
