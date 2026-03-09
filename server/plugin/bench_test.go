package plugin_test

import (
	"fmt"
	"strings"
	"testing"

	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/testutil/specs"
)

// benchIndex builds an index via the standalone parser, which is the same
// path used by Go plugin binaries (no tree-sitter).
func benchIndex(b *testing.B, spec specs.Spec) *openapi.Index {
	b.Helper()
	idx := openapi.ParseAndIndex(spec.Content)
	if idx == nil || idx.Document == nil {
		b.Skip("spec did not parse")
	}
	return idx
}

// --- Individual visitor benchmarks ---

func BenchmarkGoPlugin_Operations(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			v := rules.Visitors{
				Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
					if op.Summary == "" {
						r.At(op.Loc, "%s %s is missing a summary", method, path)
					}
				},
			}
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				r := rules.NewReporter("bench-op", ctypes.SeverityWarning)
				rules.Walk(idx, v, r)
				_ = r.Diagnostics()
			}
		})
	}
}

func BenchmarkGoPlugin_Schemas(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			v := rules.Visitors{
				Schema: func(name string, s *openapi.Schema, _ string, r *rules.Reporter) {
					result := rules.V.TitleCase()(name, "schema name")
					if !result.Valid {
						r.At(s.Loc, "Schema %q should use PascalCase", name)
					}
				},
			}
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				r := rules.NewReporter("bench-schema", ctypes.SeverityWarning)
				rules.Walk(idx, v, r)
				_ = r.Diagnostics()
			}
		})
	}
}

func BenchmarkGoPlugin_Paths(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			v := rules.Visitors{
				Path: func(path string, item *openapi.PathItem, r *rules.Reporter) {
					if len(path) > 1 && strings.HasSuffix(path, "/") {
						r.At(item.PathLoc, "Path %q has a trailing slash", path)
					}
				},
			}
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				r := rules.NewReporter("bench-path", ctypes.SeverityWarning)
				rules.Walk(idx, v, r)
				_ = r.Diagnostics()
			}
		})
	}
}

func BenchmarkGoPlugin_Parameters(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			v := rules.Visitors{
				Parameter: func(param *openapi.Parameter, r *rules.Reporter) {
					if param.Description.Text == "" {
						r.At(param.Loc, "Parameter %q is missing a description", param.Name)
					}
				},
			}
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				r := rules.NewReporter("bench-param", ctypes.SeverityWarning)
				rules.Walk(idx, v, r)
				_ = r.Diagnostics()
			}
		})
	}
}

// BenchmarkGoPlugin_Combined runs multiple visitor rules in a single Walk,
// simulating a plugin with several rules registered.
func BenchmarkGoPlugin_Combined(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		idx := benchIndex(b, spec)
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			v := rules.Visitors{
				Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
					if op.Summary == "" {
						r.At(op.Loc, "%s %s is missing a summary", method, path)
					}
					if len(op.Security) == 0 {
						r.At(op.Loc, "%s %s has no security", method, path)
					}
				},
				Schema: func(name string, s *openapi.Schema, _ string, r *rules.Reporter) {
					result := rules.V.TitleCase()(name, "schema name")
					if !result.Valid {
						r.At(s.Loc, "Schema %q should use PascalCase", name)
					}
				},
				Path: func(path string, item *openapi.PathItem, r *rules.Reporter) {
					if len(path) > 1 && strings.HasSuffix(path, "/") {
						r.At(item.PathLoc, "trailing slash")
					}
				},
				Parameter: func(param *openapi.Parameter, r *rules.Reporter) {
					if param.Description.Text == "" {
						r.At(param.Loc, "missing description")
					}
				},
				Server: func(server *openapi.Server, r *rules.Reporter) {
					if strings.HasPrefix(server.URL, "http://") {
						r.At(server.URLLoc, "use HTTPS")
					}
				},
				Tag: func(tag *openapi.Tag, r *rules.Reporter) {
					if tag.Description.Text == "" {
						r.At(tag.Loc, "missing description")
					}
				},
				Response: func(code string, resp *openapi.Response, r *rules.Reporter) {
					if resp.Description.Text == "" {
						r.At(resp.Loc, "missing description")
					}
				},
				SecurityScheme: func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
					if ss.Description.Text == "" {
						r.At(ss.Loc, "missing description")
					}
				},
			}
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				r := rules.NewReporter("bench-combined", ctypes.SeverityWarning)
				rules.Walk(idx, v, r)
				_ = r.Diagnostics()
			}
		})
	}
}

// BenchmarkGoPlugin_ParseAndWalk benchmarks the full pipeline: parse the spec
// from raw bytes (standalone YAML parser) then walk with all visitors. This
// measures the end-to-end cost of a Go plugin binary.
func BenchmarkGoPlugin_ParseAndWalk(b *testing.B) {
	for _, spec := range specs.BenchmarkSpecs() {
		b.Run(fmt.Sprintf("%s/%s", spec.Size, spec.Name), func(b *testing.B) {
			v := rules.Visitors{
				Operation: func(_, method string, op *openapi.Operation, r *rules.Reporter) {
					if op.Summary == "" {
						r.At(op.Loc, "missing summary")
					}
				},
				Schema: func(name string, s *openapi.Schema, _ string, r *rules.Reporter) {
					if s.Description.Text == "" {
						r.At(s.Loc, "missing description")
					}
				},
				Parameter: func(param *openapi.Parameter, r *rules.Reporter) {
					if param.Description.Text == "" {
						r.At(param.Loc, "missing description")
					}
				},
			}
			b.ReportAllocs()
			b.SetBytes(int64(len(spec.Content)))
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				idx := openapi.ParseAndIndex(spec.Content)
				r := rules.NewReporter("bench-e2e", ctypes.SeverityWarning)
				rules.Walk(idx, v, r)
				_ = r.Diagnostics()
			}
		})
	}
}
