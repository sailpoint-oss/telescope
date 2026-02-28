// Package openapi provides a typed OpenAPI model built directly on tree-sitter
// parse trees. It supports OpenAPI 2.0 (Swagger), 3.0.x, 3.1.x, and 3.2.x
// with incremental index updates driven by tree-sitter TreeDiff.
package openapi

// Version represents a known OpenAPI specification version.
type Version string

const (
	VersionUnknown Version = ""
	Version20      Version = "2.0"
	Version30      Version = "3.0"
	Version31      Version = "3.1"
	Version32      Version = "3.2"
)

// Format is used in rule metadata to indicate which spec versions a rule applies to.
type Format string

const (
	FormatOAS2  Format = "oas2"
	FormatOAS3  Format = "oas3"
	FormatOAS31 Format = "oas3.1"
	FormatOAS32 Format = "oas3.2"
)

// DocType classifies a document's role in an OpenAPI project.
type DocType int

const (
	DocTypeUnknown  DocType = iota
	DocTypeRoot             // Has openapi/swagger version field at root
	DocTypeFragment         // Referenced via $ref, no root version field
)

// VersionFromString parses a version string (e.g. "3.1.0") into a Version constant.
func VersionFromString(s string) Version {
	if len(s) == 0 {
		return VersionUnknown
	}
	switch {
	case s == "2.0" || (len(s) >= 3 && s[:2] == "2."):
		return Version20
	case len(s) >= 3 && s[:3] == "3.0":
		return Version30
	case len(s) >= 3 && s[:3] == "3.1":
		return Version31
	case len(s) >= 3 && s[:3] == "3.2":
		return Version32
	default:
		return VersionUnknown
	}
}

// FormatsForVersion returns the Format tags that apply to a given version.
func FormatsForVersion(v Version) []Format {
	switch v {
	case Version20:
		return []Format{FormatOAS2}
	case Version30:
		return []Format{FormatOAS3}
	case Version31:
		return []Format{FormatOAS3, FormatOAS31}
	case Version32:
		return []Format{FormatOAS3, FormatOAS32}
	default:
		return nil
	}
}
