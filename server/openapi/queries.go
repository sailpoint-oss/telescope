package openapi

// Reusable tree-sitter query patterns for extracting OpenAPI structures from
// YAML and JSON parse trees. These patterns are used by the parser, classifier,
// and diagnostic analyzers.

// YAML queries - target tree-sitter-yaml node types
const (
	// YAMLBlockMappingPair matches key-value pairs in YAML block mappings.
	YAMLBlockMappingPair = `(block_mapping_pair
		key: (flow_node) @key
		value: (_) @value)`

	// YAMLRefValue matches $ref key-value pairs in YAML.
	YAMLRefValue = `(block_mapping_pair
		key: (flow_node) @key
		(#eq? @key "$ref")
		value: (_) @value)`

	// YAMLFlowMappingPair matches key-value pairs in YAML flow mappings.
	YAMLFlowMappingPair = `(flow_pair
		key: (flow_node) @key
		value: (_) @value)`

	// YAMLFlowRefValue matches $ref in flow mappings.
	YAMLFlowRefValue = `(flow_pair
		key: (flow_node) @key
		(#eq? @key "$ref")
		value: (_) @value)`

	// YAMLDocumentRoot matches the top-level mapping in a YAML document.
	YAMLDocumentRoot = `(stream (document (block_node (block_mapping) @root)))`

	// YAMLBlockMapping matches any block mapping.
	YAMLBlockMapping = `(block_mapping) @mapping`

	// YAMLError matches syntax errors.
	YAMLError = `(ERROR) @error`
)

// JSON queries - target tree-sitter-json node types
const (
	// JSONPair matches key-value pairs in JSON objects.
	JSONPair = `(pair
		key: (string) @key
		value: (_) @value)`

	// JSONRefPair matches $ref key-value pairs in JSON.
	JSONRefPair = `(pair
		key: (string) @key
		(#eq? @key "\"$ref\"")
		value: (_) @value)`

	// JSONObject matches object nodes.
	JSONObject = `(object) @obj`

	// JSONDocumentRoot matches the top-level object in a JSON document.
	JSONDocumentRoot = `(document (object) @root)`

	// JSONError matches syntax errors.
	JSONError = `(ERROR) @error`
)

// FileFormat identifies whether a document is YAML or JSON based on file extension.
type FileFormat int

const (
	FormatUnknown FileFormat = iota
	FormatYAML
	FormatJSON
)

// FormatFromURI determines the file format from a URI or file path.
func FormatFromURI(uri string) FileFormat {
	for i := len(uri) - 1; i >= 0; i-- {
		if uri[i] == '.' {
			ext := uri[i:]
			switch ext {
			case ".yaml", ".yml":
				return FormatYAML
			case ".json":
				return FormatJSON
			}
			break
		}
		if uri[i] == '/' || uri[i] == '\\' {
			break
		}
	}
	return FormatUnknown
}
