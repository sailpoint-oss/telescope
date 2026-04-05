; Inject Markdown into OpenAPI description fields (YAML)

; Block scalar (| or >) as description value
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @_key))
  value: (block_node (block_scalar) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))

; Double-quoted string as description value
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @_key))
  value: (flow_node (double_quote_scalar) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))

; Single-quoted string as description value
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @_key))
  value: (flow_node (single_quote_scalar) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))

; Plain scalar (string) as description value
(block_mapping_pair
  key: (flow_node (plain_scalar (string_scalar) @_key))
  value: (flow_node (plain_scalar (string_scalar)) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))

; Flow mapping pair (e.g. inside flow mapping) - double-quoted key "description"
(flow_pair
  key: (flow_node (double_quote_scalar) @_key)
  value: (flow_node (double_quote_scalar) @injection.content)
  (#eq? @_key "\"description\"")
  (#set! injection.language "markdown"))

(flow_pair
  key: (flow_node (plain_scalar (string_scalar) @_key))
  value: (flow_node (double_quote_scalar) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))

(flow_pair
  key: (flow_node (plain_scalar (string_scalar) @_key))
  value: (flow_node (plain_scalar (string_scalar)) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))
