// This file wires barrelman's unified validation engine in as the
// default backend for additional-file validation, per the rollout plan.
//
// Callers still interact with AdditionalValidator as before. When
// telescope starts up with --validator=engine the engine adapter is
// registered via gossip/jsonschema.RegisterAdapter; additional validation
// then routes through barrelman/validation/engine transparently. The
// legacy gossip/jsonschema interpreter remains in place as a fallback
// (when no adapter is registered) so the sidecar/Bun + AJV path and
// existing call sites keep working unchanged during the staged rollout.

package validation

import (
	"encoding/json"

	"github.com/LukasParke/gossip/jsonschema"
	"github.com/sailpoint-oss/barrelman/validation/engine"
)

// InstallEngineAdapter registers the barrelman validation engine as
// gossip/jsonschema's validator adapter. Pass nil to restore the built-in
// gossip interpreter. Safe to call once from telescope's startup code.
func InstallEngineAdapter() {
	jsonschema.RegisterAdapter(&jsonschema.Adapter{
		Validate: func(schemaBytes []byte, instance any) []jsonschema.AdapterIssue {
			var schema any
			if err := json.Unmarshal(schemaBytes, &schema); err != nil {
				return []jsonschema.AdapterIssue{{
					Code:    "schema-parse",
					Message: "failed to parse schema: " + err.Error(),
				}}
			}
			compiled, err := engine.Compile(schema, engine.CompileOpts{
				OpenAPI: engine.OpenAPIOptions{
					NullableRewrite:     true,
					RecognizeExtensions: true,
				},
			})
			if err != nil {
				return []jsonschema.AdapterIssue{{
					Code:    "schema-compile",
					Message: "failed to compile schema: " + err.Error(),
				}}
			}
			issues := compiled.Validate(instance)
			if len(issues) == 0 {
				return nil
			}
			out := make([]jsonschema.AdapterIssue, 0, len(issues))
			for _, is := range issues {
				out = append(out, jsonschema.AdapterIssue{
					Code:       is.Code,
					Message:    is.Message,
					Pointer:    is.Pointer,
					Path:       is.Path,
					Expected:   is.Expected,
					Received:   is.Received,
					Suggestion: is.Suggestion,
				})
			}
			return out
		},
	})
}

// UninstallEngineAdapter clears the registered adapter, restoring the
// built-in gossip jsonschema interpreter. Mainly useful in tests.
func UninstallEngineAdapter() {
	jsonschema.RegisterAdapter(nil)
}
