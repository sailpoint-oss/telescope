; OpenAPI YAML highlights (extends generic YAML with OpenAPI key awareness)

(boolean_scalar) @boolean
(null_scalar) @constant.builtin

[
  (double_quote_scalar)
  (single_quote_scalar)
  (block_scalar)
  (string_scalar)
] @string

[
  (integer_scalar)
  (float_scalar)
] @number

(comment) @comment

[
  (anchor_name)
  (alias_name)
] @label

(tag) @type

[
  (yaml_directive)
  (tag_directive)
  (reserved_directive)
] @attribute

; OpenAPI / Swagger top-level and semantic keys
; OpenAPI 3.0, 3.1, 3.2: openapi, info, servers, paths, webhooks, components, etc.
; Swagger 2.0: swagger, host, basePath, schemes, definitions, securityDefinitions, etc.
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @keyword))
  (#any-of? @keyword
    "openapi" "info" "servers" "paths" "webhooks" "components"
    "security" "tags" "externalDocs" "jsonSchemaDialect"
    "swagger" "host" "basePath" "schemes" "consumes" "produces"
    "definitions" "parameters" "responses" "securityDefinitions"))

(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @property.definition))
  (#any-of? @property.definition "description" "summary" "title"))

(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @keyword))
  (#any-of? @keyword "get" "put" "post" "delete" "patch" "options" "head" "trace"))

(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @keyword))
  (#eq? @keyword "$ref"))

; Schema / JSON Schema structural keys (fragment files)
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @keyword))
  (#any-of? @keyword
    "type" "properties" "required" "items" "schema"
    "allOf" "oneOf" "anyOf" "not"
    "additionalProperties" "discriminator"))

; Operation, parameter, response, media-type keys (fragment files)
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @keyword))
  (#any-of? @keyword
    "operationId" "requestBody" "callbacks"
    "content" "headers" "links" "encoding"
    "name" "in"))

(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @property))
  (#match? @property "^x-"))

; Value/constraint keys (fragment files)
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @property.definition))
  (#any-of? @property.definition
    "format" "default" "example" "examples" "enum"
    "nullable" "readOnly" "writeOnly" "deprecated"
    "pattern" "minimum" "maximum" "minLength" "maxLength"
    "minItems" "maxItems" "exclusiveMinimum" "exclusiveMaximum"))

; Generic mapping keys (property)
(block_mapping_pair
  key: (flow_node
    [
      (double_quote_scalar)
      (single_quote_scalar)
    ] @property))

(block_mapping_pair
  key: (flow_node
    (plain_scalar
      (string_scalar) @property)))

(flow_mapping
  (_
    key: (flow_node
      [
        (double_quote_scalar)
        (single_quote_scalar)
      ] @property)))

(flow_mapping
  (_
    key: (flow_node
      (plain_scalar
        (string_scalar) @property))))

[
  ","
  "-"
  ":"
  ">"
  "?"
  "|"
] @punctuation.delimiter

[
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  "*"
  "&"
  "---"
  "..."
] @punctuation.special
