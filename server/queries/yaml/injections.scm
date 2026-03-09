; Inject markdown into description fields
; Matches: description: |
;            Markdown content here
(block_mapping_pair
  key: (flow_node) @_key
  value: (block_node
    (block_scalar) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))

; Matches: description: "inline markdown"
(block_mapping_pair
  key: (flow_node) @_key
  value: (flow_node
    (double_quote_scalar) @injection.content)
  (#eq? @_key "description")
  (#set! injection.language "markdown"))
