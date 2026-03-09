package validate

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/santhosh-tekuri/jsonschema/v6"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
)

// ValidationError represents a single validation error with source location.
type ValidationError struct {
	Range        ctypes.Range
	Message      string
	SchemaPath   string // schema URL or path where validation failed
	InstancePath string // JSON pointer into the document that failed
	Keyword      string // JSON Schema keyword (e.g. "required", "type")
	ActualValue  string // string representation of the actual value (for enrichment)
	EnumValues   []string        // valid enum values (populated for enum errors)
	Fixes        []ctypes.Fix    // suggested fixes
}

// SchemaValidator validates document content against JSON Schema.
type SchemaValidator struct {
	compiler *jsonschema.Compiler
	schemas  map[string]*jsonschema.Schema // version -> compiled schema
}

// NewSchemaValidator creates a new schema validator.
func NewSchemaValidator() *SchemaValidator {
	c := jsonschema.NewCompiler()
	return &SchemaValidator{
		compiler: c,
		schemas:  make(map[string]*jsonschema.Schema),
	}
}

// RegisterSchema compiles and caches a JSON Schema for a specific OpenAPI version.
func (v *SchemaValidator) RegisterSchema(version string, schemaBytes []byte) error {
	var schemaDoc any
	if err := json.Unmarshal(schemaBytes, &schemaDoc); err != nil {
		return fmt.Errorf("invalid schema JSON for version %s: %w", version, err)
	}

	uri := fmt.Sprintf("telescope://openapi/%s", version)
	if err := v.compiler.AddResource(uri, schemaDoc); err != nil {
		return fmt.Errorf("add resource for version %s: %w", version, err)
	}

	compiled, err := v.compiler.Compile(uri)
	if err != nil {
		return fmt.Errorf("compile schema for version %s: %w", version, err)
	}

	v.schemas[version] = compiled
	return nil
}

// Validate checks content against the schema for the given version.
// pointerIndex maps JSON pointers to source ranges for error location mapping.
func (v *SchemaValidator) Validate(content []byte, version string, pointerIndex map[string]ctypes.Range) []ValidationError {
	schema, ok := v.schemas[version]
	if !ok {
		return nil
	}

	var doc any
	if err := json.Unmarshal(content, &doc); err != nil {
		return nil
	}

	err := schema.Validate(doc)
	if err == nil {
		return nil
	}

	valErr, ok := err.(*jsonschema.ValidationError)
	if !ok {
		return []ValidationError{{
			Message: err.Error(),
			Range:   ctypes.Range{},
		}}
	}

	return flattenValidationErrors(valErr, pointerIndex)
}

func flattenValidationErrors(root *jsonschema.ValidationError, pointerIndex map[string]ctypes.Range) []ValidationError {
	var results []ValidationError

	var walk func(err *jsonschema.ValidationError)
	walk = func(err *jsonschema.ValidationError) {
		if len(err.Causes) > 0 {
			for _, cause := range err.Causes {
				walk(cause)
			}
			return
		}

		instancePath := instancePathFromTokens(err.InstanceLocation)
		keyword := ""
		schemaPath := err.SchemaURL
		if err.ErrorKind != nil {
			kp := err.ErrorKind.KeywordPath()
			if len(kp) > 0 {
				keyword = kp[len(kp)-1]
			}
			if schemaPath == "" {
				schemaPath = strings.Join(kp, "/")
			}
		}

		r, _ := pointerIndex[instancePath]

		results = append(results, ValidationError{
			Range:        r,
			Message:      err.Error(),
			SchemaPath:   schemaPath,
			InstancePath: instancePath,
			Keyword:      keyword,
		})
	}

	walk(root)
	return results
}

func instancePathFromTokens(tokens []string) string {
	if len(tokens) == 0 {
		return "/"
	}
	return "/" + strings.Join(tokens, "/")
}
