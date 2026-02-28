package sdk

import (
	"github.com/sailpoint-oss/telescope/server/rules"
)

// PluginRuleBuilder wraps rules.RuleBuilder to register rules on a
// PluginInstance instead of a gossip.Server.
type PluginRuleBuilder struct {
	inner *rules.RuleBuilder
}

// Rule begins building a new rule with the given ID and metadata.
func Rule(id string, meta Meta) *PluginRuleBuilder {
	return &PluginRuleBuilder{inner: rules.Define(id, meta)}
}

// Register registers the rule on the given plugin instance.
func (b *PluginRuleBuilder) Register(p *PluginInstance) {
	id, analyzer := b.inner.Build()
	p.addRule(id, analyzer)
}

// --- Visitor methods (delegate to inner builder) ---

func (b *PluginRuleBuilder) Document(fn func(doc *Document, r *Reporter)) *PluginRuleBuilder {
	b.inner.Document(fn)
	return b
}

func (b *PluginRuleBuilder) Info(fn func(info *Info, r *Reporter)) *PluginRuleBuilder {
	b.inner.Info(fn)
	return b
}

func (b *PluginRuleBuilder) Paths(fn func(path string, item *PathItem, r *Reporter)) *PluginRuleBuilder {
	b.inner.Paths(fn)
	return b
}

func (b *PluginRuleBuilder) Operations(fn func(path string, method string, op *Operation, r *Reporter)) *PluginRuleBuilder {
	b.inner.Operations(fn)
	return b
}

func (b *PluginRuleBuilder) Schemas(fn func(name string, schema *Schema, pointer string, r *Reporter)) *PluginRuleBuilder {
	b.inner.Schemas(fn)
	return b
}

func (b *PluginRuleBuilder) RecursiveSchemas(fn func(name string, schema *Schema, pointer string, r *Reporter)) *PluginRuleBuilder {
	b.inner.RecursiveSchemas(fn)
	return b
}

func (b *PluginRuleBuilder) Parameters(fn func(param *Parameter, r *Reporter)) *PluginRuleBuilder {
	b.inner.Parameters(fn)
	return b
}

func (b *PluginRuleBuilder) Responses(fn func(code string, resp *Response, r *Reporter)) *PluginRuleBuilder {
	b.inner.Responses(fn)
	return b
}

func (b *PluginRuleBuilder) Tags(fn func(tag *Tag, r *Reporter)) *PluginRuleBuilder {
	b.inner.Tags(fn)
	return b
}

func (b *PluginRuleBuilder) Servers(fn func(server *Server, r *Reporter)) *PluginRuleBuilder {
	b.inner.Servers(fn)
	return b
}

func (b *PluginRuleBuilder) RequestBodies(fn func(path string, method string, rb *RequestBody, r *Reporter)) *PluginRuleBuilder {
	b.inner.RequestBodies(fn)
	return b
}

func (b *PluginRuleBuilder) SecuritySchemes(fn func(name string, ss *SecurityScheme, r *Reporter)) *PluginRuleBuilder {
	b.inner.SecuritySchemes(fn)
	return b
}

func (b *PluginRuleBuilder) Examples(fn func(name string, ex *Example, r *Reporter)) *PluginRuleBuilder {
	b.inner.Examples(fn)
	return b
}

func (b *PluginRuleBuilder) Custom(fn func(idx *Index, r *Reporter)) *PluginRuleBuilder {
	b.inner.Custom(fn)
	return b
}
