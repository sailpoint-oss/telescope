// Package sdk provides a batteries-included SDK for writing Telescope plugin
// binaries. Plugin authors import this single package to access the typed
// OpenAPI model, rule builder, reporter, validators, and the Serve function
// that turns their binary into a telescope-compatible plugin.
//
// Example usage:
//
//	package main
//
//	import "github.com/sailpoint-oss/telescope/server/sdk"
//
//	func main() {
//	    p := sdk.NewPlugin("my-rules", "1.0.0")
//	    sdk.Rule("require-security", sdk.Meta{
//	        Description: "Operations must define security",
//	        Severity:    sdk.Error,
//	        Category:    sdk.Security,
//	    }).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
//	        if len(op.Security) == 0 {
//	            r.At(op.Loc, "%s %s has no security", method, path)
//	        }
//	    }).Register(p)
//	    p.Serve()
//	}
package sdk

import (
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

// --- OpenAPI model types ---

type Document = openapi.Document
type Info = openapi.Info
type Server = openapi.Server
type ServerVariable = openapi.ServerVariable
type PathItem = openapi.PathItem
type Operation = openapi.Operation
type Parameter = openapi.Parameter
type RequestBody = openapi.RequestBody
type Response = openapi.Response
type Header = openapi.Header
type MediaType = openapi.MediaType
type Link = openapi.Link
type Schema = openapi.Schema
type Example = openapi.Example
type SecurityScheme = openapi.SecurityScheme
type SecurityRequirement = openapi.SecurityRequirement
type Tag = openapi.Tag
type ExternalDocs = openapi.ExternalDocs
type Components = openapi.Components
type Index = openapi.Index
type Loc = openapi.Loc
type DescriptionValue = openapi.DescriptionValue
type Node = openapi.Node

// --- Rules types ---

type Reporter = rules.Reporter
type Meta = rules.RuleMeta
type Category = rules.Category
type Validator = rules.Validator
type ValidationResult = rules.ValidationResult

// --- Severity constants ---

const (
	SeverityError   = protocol.SeverityError
	SeverityWarning = protocol.SeverityWarning
	SeverityInfo    = protocol.SeverityInformation
	SeverityHint    = protocol.SeverityHint
)

// Convenience aliases matching common usage.
const (
	Error = protocol.SeverityError
	Warn  = protocol.SeverityWarning
	Hint  = protocol.SeverityHint
)

// --- Category constants ---

const (
	Naming        = rules.CategoryNaming
	Documentation = rules.CategoryDocumentation
	Structure     = rules.CategoryStructure
	Types         = rules.CategoryTypes
	Security      = rules.CategorySecurity
	Servers       = rules.CategoryServers
	Paths         = rules.CategoryPaths
	References    = rules.CategoryReferences
	Syntax        = rules.CategorySyntax
	OWASP         = rules.CategoryOWASP
)

// V exposes composable validator constructors. Use V.Required(),
// V.MinLength(n), V.Pattern(re), etc.
var V = rules.V
