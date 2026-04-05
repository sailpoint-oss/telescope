package openapi

import (
	"strings"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"

	"github.com/LukasParke/gossip/treesitter"
)

// FragmentType classifies a non-root OpenAPI file by the kind of object it
// represents. Used to select the appropriate JSON Schema for validation.
type FragmentType int

const (
	FragmentUnknown        FragmentType = iota
	FragmentSchema                      // Schema Object (type, properties, items, etc.)
	FragmentPathItem                    // Path Item (get, post, put, delete, etc.)
	FragmentOperation                   // Operation (operationId, responses, etc.)
	FragmentParameter                   // Parameter (in + name)
	FragmentRequestBody                 // Request Body (content without in)
	FragmentResponse                    // Response (description + content/headers)
	FragmentHeader                      // Header (schema without in/name/methods)
	FragmentSecurityScheme              // Security Scheme (type: apiKey|http|oauth2|openIdConnect)
	FragmentComponents                  // Components (schemas, responses, parameters, etc.)
	FragmentServer                      // Server (url)
)

var httpMethods = map[string]bool{
	"get": true, "post": true, "put": true, "delete": true,
	"patch": true, "options": true, "head": true, "trace": true,
}

var componentSections = map[string]bool{
	"schemas": true, "responses": true, "parameters": true,
	"examples": true, "requestBodies": true, "headers": true,
	"securitySchemes": true, "links": true, "callbacks": true,
	"pathItems": true,
}

var schemaKeywords = map[string]bool{
	"type": true, "properties": true, "items": true,
	"allOf": true, "oneOf": true, "anyOf": true,
	"$ref": true, "enum": true, "not": true,
	"additionalProperties": true, "required": true,
	"minimum": true, "maximum": true, "pattern": true,
	"minLength": true, "maxLength": true, "minItems": true,
	"maxItems": true, "format": true, "nullable": true,
	"discriminator": true,
}

var securitySchemeTypes = map[string]bool{
	"apikey": true, "http": true, "oauth2": true, "openidconnect": true,
}

// DetectFragmentType examines the root-level keys of a tree-sitter AST and
// returns the most likely OpenAPI fragment type. Returns FragmentUnknown if the
// file does not appear to be an OpenAPI fragment.
func DetectFragmentType(tree *treesitter.Tree, format FileFormat) FragmentType {
	if tree == nil {
		return FragmentUnknown
	}

	keys, values := extractRootKeysAndValues(tree, format)
	if len(keys) == 0 {
		return FragmentUnknown
	}

	keySet := make(map[string]bool, len(keys))
	for _, k := range keys {
		keySet[k] = true
	}

	valueMap := make(map[string]string, len(keys))
	for i, k := range keys {
		if i < len(values) {
			valueMap[k] = values[i]
		}
	}

	// Root documents are not fragments.
	if keySet["openapi"] || keySet["swagger"] {
		return FragmentUnknown
	}

	// Path Item: has HTTP method keys -- very distinctive, check first.
	for _, k := range keys {
		if httpMethods[k] {
			return FragmentPathItem
		}
	}

	// Security Scheme: has "type" with a known security scheme value.
	// Checked before Parameter because apiKey schemes also have "in" + "name".
	if keySet["type"] {
		typeVal := strings.ToLower(unquote(valueMap["type"]))
		if securitySchemeTypes[typeVal] {
			return FragmentSecurityScheme
		}
	}

	// Parameter: has "in" AND "name"
	if keySet["in"] && keySet["name"] {
		return FragmentParameter
	}

	// Operation: has operationId, or responses + other operation keys
	if keySet["operationId"] {
		return FragmentOperation
	}
	if keySet["responses"] && (keySet["summary"] || keySet["description"] || keySet["parameters"] || keySet["requestBody"] || keySet["tags"]) {
		return FragmentOperation
	}

	// Request Body: has "content" + "required" without "in". The "required"
	// field is unique to RequestBody among the content-bearing types.
	if keySet["content"] && keySet["required"] && !keySet["in"] {
		return FragmentRequestBody
	}

	// Response: has "description" AND (content OR headers), without "in".
	// Checked before Components because a response can have "headers" which
	// also appears as a component section key.
	if keySet["description"] && !keySet["in"] {
		if keySet["content"] || keySet["headers"] {
			return FragmentResponse
		}
	}

	// Request Body fallback: has "content" + "description" without "in"
	if keySet["content"] && keySet["description"] && !keySet["in"] {
		return FragmentRequestBody
	}

	// Components: has component section keys (schemas, securitySchemes, etc.)
	for _, k := range keys {
		if componentSections[k] {
			return FragmentComponents
		}
	}

	// Server: has "url" without openapi/swagger
	if keySet["url"] {
		if keySet["description"] || keySet["variables"] {
			return FragmentServer
		}
	}

	// Header: has "schema" without "in", "name", or HTTP methods
	if keySet["schema"] && !keySet["in"] && !keySet["name"] {
		hasMethod := false
		for _, k := range keys {
			if httpMethods[k] {
				hasMethod = true
				break
			}
		}
		if !hasMethod {
			return FragmentHeader
		}
	}

	// Schema Object (fallback): has any schema keywords
	for _, k := range keys {
		if schemaKeywords[k] {
			return FragmentSchema
		}
	}

	return FragmentUnknown
}

// extractRootKeysAndValues walks the top-level mapping of the tree and returns
// the key names and their raw text values.
func extractRootKeysAndValues(tree *treesitter.Tree, format FileFormat) ([]string, []string) {
	p := NewParser(tree, format)
	root := tree.RootNode()
	if root == nil {
		return nil, nil
	}

	var mappingNode *tree_sitter.Node
	switch format {
	case FormatYAML:
		mappingNode = p.findYAMLRoot(root)
	case FormatJSON:
		mappingNode = p.findJSONRoot(root)
	default:
		return nil, nil
	}
	if mappingNode == nil {
		return nil, nil
	}

	var keys []string
	var values []string
	p.walkMapping(mappingNode, func(key, value *tree_sitter.Node) {
		k := unquote(p.nodeText(key))
		keys = append(keys, k)
		if value != nil {
			values = append(values, p.nodeText(value))
		} else {
			values = append(values, "")
		}
	})
	return keys, values
}

// String returns a human-readable name for the fragment type.
func (f FragmentType) String() string {
	switch f {
	case FragmentSchema:
		return "Schema"
	case FragmentPathItem:
		return "PathItem"
	case FragmentOperation:
		return "Operation"
	case FragmentParameter:
		return "Parameter"
	case FragmentRequestBody:
		return "RequestBody"
	case FragmentResponse:
		return "Response"
	case FragmentHeader:
		return "Header"
	case FragmentSecurityScheme:
		return "SecurityScheme"
	case FragmentComponents:
		return "Components"
	case FragmentServer:
		return "Server"
	default:
		return "Unknown"
	}
}
