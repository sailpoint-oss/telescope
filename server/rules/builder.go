package rules

import (
	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/LukasParke/gossip/treesitter"
	"github.com/sailpoint-oss/telescope/server/openapi"
)

// RuleBuilder provides a fluent API for defining OpenAPI diagnostic rules.
// Use Define to start building, chain visitor methods, then call Register.
type RuleBuilder struct {
	id   string
	meta RuleMeta
	v    Visitors
}

// Define begins building a new rule with the given ID and metadata.
// The meta.ID field is automatically set to id.
func Define(id string, meta RuleMeta) *RuleBuilder {
	meta.ID = id
	return &RuleBuilder{id: id, meta: meta}
}

// Document adds a visitor that receives the full document (for top-level checks).
func (b *RuleBuilder) Document(fn func(doc *openapi.Document, r *Reporter)) *RuleBuilder {
	b.v.Document = fn
	return b
}

// Info adds a visitor that is called with the document's Info object.
func (b *RuleBuilder) Info(fn func(info *openapi.Info, r *Reporter)) *RuleBuilder {
	b.v.Info = fn
	return b
}

// Paths adds a visitor that is called for each path in the document.
func (b *RuleBuilder) Paths(fn func(path string, item *openapi.PathItem, r *Reporter)) *RuleBuilder {
	b.v.Path = fn
	return b
}

// Operations adds a visitor that is called for each operation in the document.
func (b *RuleBuilder) Operations(fn func(path string, method string, op *openapi.Operation, r *Reporter)) *RuleBuilder {
	b.v.Operation = fn
	return b
}

// Schemas adds a visitor that is called for each schema (component and inline).
// Only top-level schemas are visited; use RecursiveSchemas for nested traversal.
func (b *RuleBuilder) Schemas(fn func(name string, schema *openapi.Schema, pointer string, r *Reporter)) *RuleBuilder {
	b.v.Schema = fn
	return b
}

// RecursiveSchemas adds a visitor that recursively walks all schemas, including
// nested properties, items, allOf, anyOf, oneOf, not, and additionalProperties.
func (b *RuleBuilder) RecursiveSchemas(fn func(name string, schema *openapi.Schema, pointer string, r *Reporter)) *RuleBuilder {
	b.v.RecursiveSchema = fn
	return b
}

// Parameters adds a visitor that is called for each parameter.
func (b *RuleBuilder) Parameters(fn func(param *openapi.Parameter, r *Reporter)) *RuleBuilder {
	b.v.Parameter = fn
	return b
}

// Responses adds a visitor that is called for each response.
func (b *RuleBuilder) Responses(fn func(code string, resp *openapi.Response, r *Reporter)) *RuleBuilder {
	b.v.Response = fn
	return b
}

// Tags adds a visitor that is called for each tag.
func (b *RuleBuilder) Tags(fn func(tag *openapi.Tag, r *Reporter)) *RuleBuilder {
	b.v.Tag = fn
	return b
}

// Servers adds a visitor that is called for each server.
func (b *RuleBuilder) Servers(fn func(server *openapi.Server, r *Reporter)) *RuleBuilder {
	b.v.Server = fn
	return b
}

// RequestBodies adds a visitor that is called for each request body.
func (b *RuleBuilder) RequestBodies(fn func(path string, method string, rb *openapi.RequestBody, r *Reporter)) *RuleBuilder {
	b.v.RequestBody = fn
	return b
}

// SecuritySchemes adds a visitor that is called for each security scheme.
func (b *RuleBuilder) SecuritySchemes(fn func(name string, ss *openapi.SecurityScheme, r *Reporter)) *RuleBuilder {
	b.v.SecurityScheme = fn
	return b
}

// Examples adds a visitor that is called for each component example.
func (b *RuleBuilder) Examples(fn func(name string, ex *openapi.Example, r *Reporter)) *RuleBuilder {
	b.v.Example = fn
	return b
}

// Custom adds a visitor that receives the full index for arbitrary logic.
func (b *RuleBuilder) Custom(fn func(idx *openapi.Index, r *Reporter)) *RuleBuilder {
	b.v.Custom = fn
	return b
}

// Register registers the rule's metadata in DefaultRegistry and registers
// the generated Analyzer with the gossip server. When a Server AnalyzeHook is
// set (e.g., during CollectAll), the analyzer is also captured for CLI use.
func (b *RuleBuilder) Register(s *gossip.Server) {
	DefaultRegistry.Register(b.meta)
	id, analyzer := b.Build()
	s.Analyze(id, analyzer)
}

// Meta returns the rule metadata. Useful for registering in external registries.
func (b *RuleBuilder) Meta() RuleMeta {
	return b.meta
}

// Build returns the rule ID and a treesitter.Analyzer ready for registration.
// Useful when you need to register manually or in tests.
func (b *RuleBuilder) Build() (string, treesitter.Analyzer) {
	v := b.v
	meta := b.meta
	id := b.id

	return id, treesitter.Analyzer{
		Scope: treesitter.ScopeFile,
		Run: func(ctx *treesitter.AnalysisContext) []protocol.Diagnostic {
			idx := GetIndex(ctx)
			if idx == nil {
				return nil
			}
			r := NewReporter(id, meta.Severity)
			Walk(idx, v, r)
			return r.Diagnostics()
		},
	}
}
