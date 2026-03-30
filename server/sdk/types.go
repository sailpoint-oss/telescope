// Package sdk re-exports OpenAPI model and rules types for library consumers.
package sdk

import (
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
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
	SeverityError   = ctypes.SeverityError
	SeverityWarning = ctypes.SeverityWarning
	SeverityInfo    = ctypes.SeverityInfo
	SeverityHint    = ctypes.SeverityHint
)

// Convenience aliases matching common usage.
const (
	Error = ctypes.SeverityError
	Warn  = ctypes.SeverityWarning
	Hint  = ctypes.SeverityHint
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
