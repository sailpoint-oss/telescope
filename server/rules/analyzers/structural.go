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
	fragmentCache map[openapi.Version]map[openapi.FragmentType]*jsonschema.CompiledSchema
)

var fragmentVersions = []openapi.Version{openapi.Version30, openapi.Version31, openapi.Version32}

func loadSchemas() {
	compiledCache = make(map[openapi.Version]*jsonschema.CompiledSchema, 4)
	fragmentCache = make(map[openapi.Version]map[openapi.FragmentType]*jsonschema.CompiledSchema, 3)

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

	fragmentTypes := map[openapi.FragmentType]string{
		openapi.FragmentSchema:         "schema",
		openapi.FragmentPathItem:       "path-item",
		openapi.FragmentOperation:      "operation",
		openapi.FragmentParameter:      "parameter",
		openapi.FragmentRequestBody:    "request-body",
		openapi.FragmentResponse:       "response",
		openapi.FragmentHeader:         "header",
		openapi.FragmentSecurityScheme: "security-scheme",
		openapi.FragmentComponents:     "components",
		openapi.FragmentServer:         "server",
	}

	for _, ver := range fragmentVersions {
		versionPrefix := string(ver)
		vmap := make(map[openapi.FragmentType]*jsonschema.CompiledSchema, len(fragmentTypes))
		for fragType, suffix := range fragmentTypes {
			path := "generated/openapi-" + versionPrefix + "-" + suffix + ".json"
			data, err := schemas.FS.ReadFile(path)
			if err != nil {
				continue
			}
			compiled, err := jsonschema.Load(data)
			if err != nil {
				continue
			}
			vmap[fragType] = compiled
		}
		fragmentCache[ver] = vmap
	}
}

func getSchema(ver openapi.Version) *jsonschema.CompiledSchema {
	schemaOnce.Do(loadSchemas)
	return compiledCache[ver]
}

func getFragmentSchema(ver openapi.Version, ft openapi.FragmentType) *jsonschema.CompiledSchema {
	schemaOnce.Do(loadSchemas)
	vmap := fragmentCache[ver]
	if vmap == nil {
		return nil
	}
	return vmap[ft]
}

// GetSchemaForVersion returns the compiled JSON Schema for the given OpenAPI
// version, or nil if no schema is available. Intended for use in tests.
func GetSchemaForVersion(ver openapi.Version) *jsonschema.CompiledSchema {
	return getSchema(ver)
}

// GetFragmentSchema returns the compiled JSON Schema for the given version and
// fragment type, or nil if no schema is available. Intended for use in tests.
func GetFragmentSchema(ver openapi.Version, ft openapi.FragmentType) *jsonschema.CompiledSchema {
	return getFragmentSchema(ver, ft)
}

// defaultFragmentVersion is used when no version can be determined from the
// document or configuration. 3.1 is chosen as the most widely used OAS version.
const defaultFragmentVersion = openapi.Version31

func registerStructuralValidation(s *gossip.Server) {
	rules.DefaultRegistry.Register(structuralMeta)

	s.Analyze("oas3-schema", treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx := rules.GetIndex(ctx)

			// Root document validation
			if idx != nil && idx.Version != openapi.VersionUnknown {
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
			}

			// Fragment validation: detect fragment type and validate against
			// the version-specific standalone schema.
			if ctx.Tree == nil {
				return nil
			}
			format := openapi.FormatUnknown
			if idx != nil {
				format = idx.Format
			}
			if format == openapi.FormatUnknown {
				if data := rules.GetAnalysisData(ctx); data != nil {
					format = openapi.FormatFromURI(data.DocURI)
				}
			}
			fragType := openapi.DetectFragmentType(ctx.Tree, format)
			if fragType == openapi.FragmentUnknown {
				return nil
			}

			ver := resolveFragmentVersion(ctx)
			fragSchema := getFragmentSchema(ver, fragType)
			if fragSchema == nil {
				return nil
			}
			result := jsonschema.Validate(ctx.Tree, fragSchema, jsonschema.ValidateOptions{
				Source:         "oas3-schema",
				Severity:       protocol.SeverityWarning,
				MaxDiagnostics: 100,
			})
			return result.Diagnostics
		},
	})
}

// resolveFragmentVersion determines which OAS version's fragment schema to use.
// Priority: 1) AnalysisData.TargetVersion (from config), 2) default 3.1.
func resolveFragmentVersion(ctx *treesitter.AnalysisContext) openapi.Version {
	if data := rules.GetAnalysisData(ctx); data != nil {
		if data.TargetVersion != "" {
			return data.TargetVersion
		}
	}
	return defaultFragmentVersion
}
