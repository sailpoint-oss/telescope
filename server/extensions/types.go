// Package extensions provides a framework for validating OpenAPI vendor
// extensions (x-* properties) against JSON Schema definitions. Extensions
// can be scoped to specific OpenAPI constructs (operations, schemas, etc.)
// and are loaded from .telescope/extensions/ or embedded as built-in
// vendor extension schemas.
package extensions

import "encoding/json"

// Scope identifies where in an OpenAPI document an extension is valid.
type Scope string

const (
	ScopeRoot           Scope = "root"
	ScopeInfo           Scope = "info"
	ScopePaths          Scope = "paths"
	ScopePathItem       Scope = "pathItem"
	ScopeOperation      Scope = "operation"
	ScopeParameter      Scope = "parameter"
	ScopeSchema         Scope = "schema"
	ScopeResponse       Scope = "response"
	ScopeRequestBody    Scope = "requestBody"
	ScopeComponents     Scope = "components"
	ScopeHeader         Scope = "header"
	ScopeMediaType      Scope = "mediaType"
	ScopeSecurityScheme Scope = "securityScheme"
	ScopeTag            Scope = "tag"
	ScopeServer         Scope = "server"
	ScopeAny            Scope = "any"
)

// AllScopes lists every known scope except ScopeAny (which matches all).
var AllScopes = []Scope{
	ScopeRoot, ScopeInfo, ScopePaths, ScopePathItem, ScopeOperation,
	ScopeParameter, ScopeSchema, ScopeResponse, ScopeRequestBody,
	ScopeComponents, ScopeHeader, ScopeMediaType, ScopeSecurityScheme,
	ScopeTag, ScopeServer,
}

// ExtensionMeta describes a single registered extension and its JSON Schema.
type ExtensionMeta struct {
	Name        string          `json:"name"`
	Scopes      []Scope         `json:"scope"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
}

// ExtensionFile is the on-disk format for .telescope/extensions/*.json.
type ExtensionFile struct {
	Name        string          `json:"name"`
	Scopes      []Scope         `json:"scope"`
	Description string          `json:"description"`
	Schema      json.RawMessage `json:"schema"`
}

// CompiledExtension pairs an extension definition with its parsed JSON Schema.
type CompiledExtension struct {
	Meta       ExtensionMeta
	SchemaData map[string]interface{}
}
