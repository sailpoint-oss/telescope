// Package projection maps spec-side diagnostics back to the source files
// that contributed each spec element.
//
// A diagnostic attached to e.g. /paths/~1foo/get/responses/200 is translated
// to the Go / Java / TS source location recorded in the spec's structured
// x-source metadata (consumed through cartographer's sourcemap package). The result
// is one or more additional diagnostics that the editor can render on the
// originating source line, giving developers squiggles where the bug
// actually lives.
package projection

import (
	"strings"

	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/cartographer/sourceloc"
	"github.com/sailpoint-oss/cartographer/sourcemap"
)

// Projected is a spec diagnostic paired with any source URIs it should also
// be published on.
type Projected struct {
	Spec    SpecTarget
	Sources []SourceTarget
}

// SpecTarget names the canonical spec document for a projection. The spec
// diagnostic is always published here.
type SpecTarget struct {
	URI protocol.DocumentURI
}

// SourceTarget is a single projected publication on a source file.
type SourceTarget struct {
	URI      protocol.DocumentURI
	Location sourceloc.Location
	Pointer  string // the JSON pointer on the spec side, stored for round-trips
}

// Resolver consults a SourceMap to translate a JSON pointer into the source
// location that contributed the addressed spec element.
type Resolver struct {
	SourceMap *sourcemap.SourceMap
}

// NewResolver constructs a Resolver bound to the given SourceMap.
func NewResolver(sm *sourcemap.SourceMap) *Resolver {
	return &Resolver{SourceMap: sm}
}

// Project resolves a diagnostic's JSON pointer to its source-file location,
// if any. Returns a zero Location when the pointer does not map to an
// operation, schema, or field.
func (r *Resolver) Project(pointer string) (sourceloc.Location, bool) {
	if r == nil || r.SourceMap == nil || pointer == "" {
		return sourceloc.Location{}, false
	}
	method, path, ok := OperationFromPointer(pointer)
	if ok {
		if loc, found := r.SourceMap.FindOperation(method, path); found {
			return loc, true
		}
	}
	if schema, field, ok := FieldFromPointer(pointer); ok {
		if loc, found := r.SourceMap.FindField(schema, field); found {
			return loc, true
		}
	}
	if schema, ok := SchemaFromPointer(pointer); ok {
		if loc, found := r.SourceMap.FindSchema(schema); found {
			return loc, true
		}
	}
	return sourceloc.Location{}, false
}

// OperationFromPointer extracts (method, path) from a pointer like
// /paths/~1foo~1bar/get/responses/200.
func OperationFromPointer(pointer string) (method, path string, ok bool) {
	parts := splitPointer(pointer)
	if len(parts) < 3 || parts[0] != "paths" {
		return "", "", false
	}
	encodedPath := parts[1]
	method = strings.ToUpper(parts[2])
	switch method {
	case "GET", "PUT", "POST", "DELETE", "OPTIONS", "HEAD", "PATCH", "TRACE":
	default:
		return "", "", false
	}
	return method, unescapePointer(encodedPath), true
}

// SchemaFromPointer extracts a schema component name from a pointer like
// /components/schemas/User or /components/schemas/User/properties/age.
func SchemaFromPointer(pointer string) (string, bool) {
	parts := splitPointer(pointer)
	if len(parts) < 3 {
		return "", false
	}
	if parts[0] != "components" || parts[1] != "schemas" {
		return "", false
	}
	return unescapePointer(parts[2]), true
}

// FieldFromPointer extracts (schema, field) from
// /components/schemas/User/properties/age.
func FieldFromPointer(pointer string) (schema, field string, ok bool) {
	parts := splitPointer(pointer)
	if len(parts) < 5 {
		return "", "", false
	}
	if parts[0] != "components" || parts[1] != "schemas" || parts[3] != "properties" {
		return "", "", false
	}
	return unescapePointer(parts[2]), unescapePointer(parts[4]), true
}

// splitPointer splits a JSON pointer "/a/b/c" into ["a","b","c"].
func splitPointer(pointer string) []string {
	if pointer == "" || pointer == "/" {
		return nil
	}
	pointer = strings.TrimPrefix(pointer, "/")
	return strings.Split(pointer, "/")
}

// unescapePointer reverses the JSON pointer escape sequences ~1 and ~0.
// RFC 6901: ~1 -> "/", ~0 -> "~". ~1 first so a literal ~ in the source
// (encoded ~0) cannot be re-escaped.
func unescapePointer(s string) string {
	s = strings.ReplaceAll(s, "~1", "/")
	s = strings.ReplaceAll(s, "~0", "~")
	return s
}
