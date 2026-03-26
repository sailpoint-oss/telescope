package extensions

import "encoding/json"

// builtinExtensions contains vendor extension definitions that are
// automatically available without user configuration.
var builtinExtensions = []ExtensionMeta{
	// --- Redocly ---
	{
		Name:        "x-logo",
		Scopes:      []Scope{ScopeInfo},
		Description: "Custom API logo for documentation",
		Schema: mustJSON(`{
			"type": "object",
			"properties": {
				"url": {"type": "string", "format": "uri"},
				"altText": {"type": "string"},
				"href": {"type": "string", "format": "uri"},
				"backgroundColor": {"type": "string"}
			},
			"required": ["url"]
		}`),
	},
	{
		Name:        "x-tagGroups",
		Scopes:      []Scope{ScopeRoot},
		Description: "Group tags for organized documentation navigation",
		Schema: mustJSON(`{
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"name": {"type": "string"},
					"tags": {"type": "array", "items": {"type": "string"}}
				},
				"required": ["name", "tags"]
			}
		}`),
	},
	{
		Name:        "x-displayName",
		Scopes:      []Scope{ScopeTag},
		Description: "Human-readable display name for a tag",
		Schema:      mustJSON(`{"type": "string"}`),
	},
	{
		Name:        "x-traitTag",
		Scopes:      []Scope{ScopeTag},
		Description: "Marks a tag as a trait tag (Redocly)",
		Schema:      mustJSON(`{"type": "boolean"}`),
	},
	{
		Name:        "x-codeSamples",
		Scopes:      []Scope{ScopeOperation},
		Description: "Custom code samples for an operation",
		Schema: mustJSON(`{
			"type": "array",
			"items": {
				"type": "object",
				"properties": {
					"lang": {"type": "string"},
					"label": {"type": "string"},
					"source": {"type": "string"}
				},
				"required": ["lang", "source"]
			}
		}`),
	},
	{
		Name:        "x-internal",
		Scopes:      []Scope{ScopeOperation, ScopeSchema, ScopeParameter, ScopePathItem},
		Description: "Marks an element as internal/hidden from public docs",
		Schema:      mustJSON(`{"type": "boolean"}`),
	},
	{
		Name:        "x-metadata",
		Scopes:      []Scope{ScopeInfo},
		Description: "Custom metadata for the API (Redocly)",
		Schema:      mustJSON(`{"type": "object"}`),
	},
	{
		Name:        "x-webhooks",
		Scopes:      []Scope{ScopeRoot},
		Description: "Webhook definitions (pre-OpenAPI 3.1)",
		Schema:      mustJSON(`{"type": "object"}`),
	},

	// --- Scalar ---
	{
		Name:        "x-scalar-environments",
		Scopes:      []Scope{ScopeRoot},
		Description: "Named environments with variable overrides (Scalar)",
		Schema: mustJSON(`{
			"type": "object",
			"additionalProperties": {
				"type": "object",
				"properties": {
					"description": {"type": "string"},
					"serverIndex": {"type": "integer"},
					"variables": {"type": "object"}
				}
			}
		}`),
	},
	{
		Name:        "x-scalar-active-environment",
		Scopes:      []Scope{ScopeRoot},
		Description: "Currently active environment name (Scalar)",
		Schema:      mustJSON(`{"type": "string"}`),
	},
	{
		Name:        "x-scalar-sdk-installation",
		Scopes:      []Scope{ScopeInfo},
		Description: "SDK installation instructions (Scalar)",
		Schema:      mustJSON(`{"type": "string"}`),
	},
	{
		Name:        "x-scalar-stability",
		Scopes:      []Scope{ScopeOperation},
		Description: "Stability level of an operation (Scalar)",
		Schema:      mustJSON(`{"type": "string", "enum": ["stable", "beta", "experimental", "deprecated"]}`),
	},
	{
		Name:        "x-scalar-icon",
		Scopes:      []Scope{ScopeRoot, ScopeTag},
		Description: "Custom icon identifier (Scalar)",
		Schema:      mustJSON(`{"type": "string"}`),
	},

	// --- Speakeasy ---
	{
		Name:        "x-speakeasy-entity",
		Scopes:      []Scope{ScopeSchema},
		Description: "Marks a schema as a Speakeasy entity",
		Schema:      mustJSON(`{"type": "string"}`),
	},
	{
		Name:        "x-speakeasy-name-override",
		Scopes:      []Scope{ScopeOperation, ScopeSchema, ScopeParameter},
		Description: "Override the generated name in SDKs (Speakeasy)",
		Schema:      mustJSON(`{"type": "string"}`),
	},
	{
		Name:        "x-speakeasy-group",
		Scopes:      []Scope{ScopeOperation},
		Description: "Group operations in generated SDK (Speakeasy)",
		Schema:      mustJSON(`{"type": "string"}`),
	},
	{
		Name:        "x-speakeasy-ignore",
		Scopes:      []Scope{ScopeOperation, ScopeSchema, ScopeParameter},
		Description: "Exclude from SDK generation (Speakeasy)",
		Schema:      mustJSON(`{"type": "boolean"}`),
	},
	{
		Name:        "x-speakeasy-retries",
		Scopes:      []Scope{ScopeOperation, ScopeRoot},
		Description: "Retry configuration for SDK generation (Speakeasy)",
		Schema: mustJSON(`{
			"type": "object",
			"properties": {
				"strategy": {"type": "string", "enum": ["backoff", "none"]},
				"backoff": {
					"type": "object",
					"properties": {
						"initialInterval": {"type": "integer"},
						"maxInterval": {"type": "integer"},
						"maxElapsedTime": {"type": "integer"},
						"exponent": {"type": "number"}
					}
				},
				"statusCodes": {"type": "array", "items": {"type": "string"}},
				"retryConnectionErrors": {"type": "boolean"}
			}
		}`),
	},
	{
		Name:        "x-speakeasy-errors",
		Scopes:      []Scope{ScopeOperation},
		Description: "Error response handling for SDK generation (Speakeasy)",
		Schema: mustJSON(`{
			"type": "object",
			"properties": {
				"statusCodes": {"type": "array", "items": {"type": "string"}},
				"override": {"type": "boolean"}
			}
		}`),
	},
	{
		Name:        "x-speakeasy-deprecation-message",
		Scopes:      []Scope{ScopeOperation, ScopeSchema, ScopeParameter},
		Description: "Custom deprecation message for SDK generation (Speakeasy)",
		Schema:      mustJSON(`{"type": "string"}`),
	},
	{
		Name:        "x-speakeasy-pagination",
		Scopes:      []Scope{ScopeOperation},
		Description: "Pagination configuration for SDK generation (Speakeasy)",
		Schema: mustJSON(`{
			"type": "object",
			"properties": {
				"type": {"type": "string", "enum": ["offsetLimit", "cursor"]},
				"inputs": {"type": "array"},
				"outputs": {"type": "array"}
			}
		}`),
	},

	// --- Stoplight ---
	{
		Name:        "x-stoplight",
		Scopes:      []Scope{ScopeRoot, ScopeOperation, ScopeSchema},
		Description: "Stoplight Studio metadata",
		Schema: mustJSON(`{
			"type": "object",
			"properties": {
				"id": {"type": "string"}
			}
		}`),
	},
	{
		Name:        "x-tags",
		Scopes:      []Scope{ScopeSchema},
		Description: "Additional schema tags (Stoplight)",
		Schema:      mustJSON(`{"type": "array", "items": {"type": "string"}}`),
	},
	{
		Name:        "x-examples",
		Scopes:      []Scope{ScopeSchema, ScopeParameter, ScopeMediaType},
		Description: "Additional examples (Stoplight)",
		Schema:      mustJSON(`{"type": "object"}`),
	},
}

// BuiltinExtensions returns a copy of the embedded extension definitions.
func BuiltinExtensions() []ExtensionMeta {
	out := make([]ExtensionMeta, len(builtinExtensions))
	copy(out, builtinExtensions)
	return out
}

func mustJSON(s string) json.RawMessage {
	var v json.RawMessage = json.RawMessage(s)
	if !json.Valid(v) {
		panic("invalid JSON in builtin extension: " + s)
	}
	return v
}
