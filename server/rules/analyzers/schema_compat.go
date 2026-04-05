package analyzers

import (
	"sync"

	"github.com/LukasParke/gossip/jsonschema"
	"github.com/sailpoint-oss/barrelman/schemas"
	navigator "github.com/sailpoint-oss/navigator"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

var (
	gossipSchemaOnce    sync.Once
	gossipCompiled      map[navigator.Version]*jsonschema.CompiledSchema
	gossipFragmentCache map[navigator.Version]map[navigator.FragmentType]*jsonschema.CompiledSchema
)

func loadGossipSchemas() {
	gossipCompiled = make(map[navigator.Version]*jsonschema.CompiledSchema, 4)
	gossipFragmentCache = make(map[navigator.Version]map[navigator.FragmentType]*jsonschema.CompiledSchema, 3)

	schemaFiles := map[navigator.Version]string{
		navigator.Version20: "generated/openapi-2.0-root.json",
		navigator.Version30: "generated/openapi-3.0-root.json",
		navigator.Version31: "generated/openapi-3.1-root.json",
		navigator.Version32: "generated/openapi-3.2-root.json",
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
		gossipCompiled[ver] = compiled
	}

	fragmentTypes := map[navigator.FragmentType]string{
		navigator.FragmentSchema:         "schema",
		navigator.FragmentPathItem:       "path-item",
		navigator.FragmentOperation:      "operation",
		navigator.FragmentParameter:      "parameter",
		navigator.FragmentRequestBody:    "request-body",
		navigator.FragmentResponse:       "response",
		navigator.FragmentHeader:         "header",
		navigator.FragmentSecurityScheme: "security-scheme",
		navigator.FragmentComponents:     "components",
		navigator.FragmentServer:         "server",
	}

	fragmentVersions := []navigator.Version{navigator.Version30, navigator.Version31, navigator.Version32}
	for _, ver := range fragmentVersions {
		versionPrefix := string(ver)
		vmap := make(map[navigator.FragmentType]*jsonschema.CompiledSchema, len(fragmentTypes))
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
		gossipFragmentCache[ver] = vmap
	}
}

// GetSchemaForVersion returns the compiled gossip JSON Schema for an OpenAPI version.
func GetSchemaForVersion(ver openapi.Version) *jsonschema.CompiledSchema {
	gossipSchemaOnce.Do(loadGossipSchemas)
	return gossipCompiled[ver]
}

// GetFragmentSchema returns the compiled gossip JSON Schema for a specific
// OpenAPI fragment type and version.
func GetFragmentSchema(ver openapi.Version, ft openapi.FragmentType) *jsonschema.CompiledSchema {
	gossipSchemaOnce.Do(loadGossipSchemas)
	vmap := gossipFragmentCache[navigator.Version(ver)]
	if vmap == nil {
		return nil
	}
	return vmap[navigator.FragmentType(ft)]
}
