; Inject Markdown into OpenAPI description fields (JSON)

(pair
  key: (string) @_key
  value: (string) @injection.content
  (#eq? @_key "\"description\"")
  (#set! injection.language "markdown"))
