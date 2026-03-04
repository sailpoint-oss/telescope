// Package rules provides the rule definition framework for Telescope's
// OpenAPI diagnostic engine.
//
// # Defining Rules
//
// Rules are built using a fluent API starting with [Define]:
//
//	rules.Define("my-rule", rules.RuleMeta{
//	    ID:          "my-rule",
//	    Description: "Operations must have a summary",
//	    Severity:    protocol.SeverityWarning,
//	    Category:    CategoryNaming,
//	    Recommended: true,
//	}).Operations(func(path, method string, op *openapi.Operation, r *Reporter) {
//	    if op.Summary.Text == "" {
//	        r.At(op.Loc, "%s %s is missing a summary", method, path)
//	    }
//	}).Register(s)
//
// Available visitor methods on [RuleBuilder]: Document, Info, Paths,
// Operations, Schemas, RecursiveSchemas, Parameters, Responses, Tags,
// Servers, RequestBodies, SecuritySchemes, Examples, and Custom.
//
// # Reporting Diagnostics
//
// The [Reporter] collects diagnostics with precise source locations.
// It supports chainable modifiers:
//
//	r.WithTags(protocol.DiagnosticTagDeprecated).At(loc, "deprecated")
//	r.WithRelated(otherLoc, uri, "also defined here").At(loc, "duplicate")
//
// # Validators
//
// Composable field validators are available via the [V] variable:
//
//	V.Required()
//	V.CamelCase()
//	V.All(V.Required(), V.MinLength(3))
//
// # Registry
//
// [DefaultRegistry] holds metadata for all registered rules. Use it to
// enumerate available rules, filter by category, or look up rule details.
//
// # Walking
//
// [Walk] traverses an [openapi.Index] and invokes [Visitors] callbacks,
// which is what the rule builder uses internally.
package rules
