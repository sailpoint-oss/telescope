// Package openapi provides a typed OpenAPI model built directly on tree-sitter
// parse trees. It supports OpenAPI 2.0 (Swagger), 3.0.x, 3.1.x, and 3.2.x
// with incremental index updates driven by tree-sitter TreeDiff.
package openapi

import navigator "github.com/sailpoint-oss/navigator"

// Version and related types are aliases to navigator's canonical definitions.
type (
	Version      = navigator.Version
	Format       = navigator.Format
	DocType      = navigator.DocType
	DocumentKind = navigator.DocumentKind
)

// Version constants.
const (
	VersionUnknown = navigator.VersionUnknown
	Version20      = navigator.Version20
	Version30      = navigator.Version30
	Version31      = navigator.Version31
	Version32      = navigator.Version32
)

// Format constants.
const (
	FormatOAS2  = navigator.FormatOAS2
	FormatOAS3  = navigator.FormatOAS3
	FormatOAS31 = navigator.FormatOAS31
	FormatOAS32 = navigator.FormatOAS32
)

// DocType constants.
const (
	DocTypeUnknown    = navigator.DocTypeUnknown
	DocTypeRoot       = navigator.DocTypeRoot
	DocTypeFragment   = navigator.DocTypeFragment
	DocTypeNonOpenAPI = navigator.DocTypeNonOpenAPI
)

// DocumentKind constants.
const (
	DocumentKindUnknown = navigator.DocumentKindUnknown
	DocumentKindOpenAPI = navigator.DocumentKindOpenAPI
	DocumentKindArazzo  = navigator.DocumentKindArazzo
)

// VersionFromString delegates to navigator.VersionFromString.
var VersionFromString = navigator.VersionFromString

// FormatsForVersion delegates to navigator.FormatsForVersion.
var FormatsForVersion = navigator.FormatsForVersion
