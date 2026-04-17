package projection

import (
	"fmt"
	"strings"

	"github.com/sailpoint-oss/cartographer/sourceloc"
	"github.com/sailpoint-oss/cartographer/sourcemap"
)

// ContributionsForFile returns the subset of the SourceMap that maps a single
// source file to the spec elements it produced. Returns nil when the file
// doesn't contribute anything.
func ContributionsForFile(sm *sourcemap.SourceMap, file string) *FileContributions {
	if sm == nil || file == "" {
		return nil
	}
	out := &FileContributions{File: file}
	for key, loc := range sm.OperationMap {
		if !sameFile(loc.File, file) {
			continue
		}
		method, path, ok := decodeOperationKey(key)
		if !ok {
			continue
		}
		out.Operations = append(out.Operations, OperationContribution{
			Method: method, Path: path, Location: loc,
		})
	}
	for name, loc := range sm.SchemaMap {
		if !sameFile(loc.File, file) {
			continue
		}
		out.Schemas = append(out.Schemas, SchemaContribution{Name: name, Location: loc})
	}
	for key, loc := range sm.FieldMap {
		if !sameFile(loc.File, file) {
			continue
		}
		schema, field, ok := decodeFieldKey(key)
		if !ok {
			continue
		}
		out.Fields = append(out.Fields, FieldContribution{Schema: schema, Field: field, Location: loc})
	}
	if len(out.Operations) == 0 && len(out.Schemas) == 0 && len(out.Fields) == 0 {
		return nil
	}
	return out
}

// FileContributions summarises the spec contributions of a single source file.
type FileContributions struct {
	File       string
	Operations []OperationContribution
	Schemas    []SchemaContribution
	Fields     []FieldContribution
}

// HoverMarkdown formats a FileContributions as a compact Markdown summary
// suitable for a hover popup.
func (fc *FileContributions) HoverMarkdown() string {
	if fc == nil {
		return ""
	}
	var b strings.Builder
	b.WriteString("**Telescope: contributes to generated spec**\n\n")
	if len(fc.Operations) > 0 {
		b.WriteString(fmt.Sprintf("- %d operation(s)\n", len(fc.Operations)))
		for _, op := range fc.Operations {
			b.WriteString(fmt.Sprintf("  - `%s %s`\n", op.Method, op.Path))
		}
	}
	if len(fc.Schemas) > 0 {
		b.WriteString(fmt.Sprintf("- %d schema(s): ", len(fc.Schemas)))
		names := make([]string, len(fc.Schemas))
		for i, s := range fc.Schemas {
			names[i] = s.Name
		}
		b.WriteString(strings.Join(names, ", "))
		b.WriteString("\n")
	}
	if len(fc.Fields) > 0 {
		b.WriteString(fmt.Sprintf("- %d field(s)\n", len(fc.Fields)))
	}
	return b.String()
}

// OperationContribution pairs a (method, path) with its source location.
type OperationContribution struct {
	Method   string
	Path     string
	Location sourceloc.Location
}

// SchemaContribution pairs a schema name with its source location.
type SchemaContribution struct {
	Name     string
	Location sourceloc.Location
}

// FieldContribution pairs a (schema, field) with its source location.
type FieldContribution struct {
	Schema   string
	Field    string
	Location sourceloc.Location
}

// decodeOperationKey inverts sourcemap.OperationKey: "GET:/foo" -> (GET, /foo).
// Path-only fallback entries (no colon prefix) are rejected so they don't get
// emitted as duplicate operations.
func decodeOperationKey(k string) (string, string, bool) {
	parts := strings.SplitN(k, ":", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	method := parts[0]
	if method != strings.ToUpper(method) {
		return "", "", false
	}
	return method, parts[1], true
}

// decodeFieldKey inverts sourcemap.FieldKey: "Schema.field" -> (Schema, field).
func decodeFieldKey(k string) (string, string, bool) {
	idx := strings.LastIndex(k, ".")
	if idx <= 0 || idx == len(k)-1 {
		return "", "", false
	}
	return k[:idx], k[idx+1:], true
}

// sameFile returns true for paths that resolve to the same logical location.
// Cartographer emits source files as repo-relative paths; callers may pass
// either repo-relative or absolute.
func sameFile(a, b string) bool {
	if a == b {
		return true
	}
	return strings.HasSuffix(a, b) || strings.HasSuffix(b, a)
}
