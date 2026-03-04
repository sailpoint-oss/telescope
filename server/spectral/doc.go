// Package spectral provides a Go implementation of the Spectral rule
// engine for evaluating declarative OpenAPI linting rules.
//
// Spectral rules use JSONPath expressions to select nodes in YAML/JSON
// documents, then apply built-in validation functions to each match.
// This enables teams to write custom rules in YAML without compiling Go.
//
// # Usage
//
// Load rules from a ruleset and create an engine:
//
//	rs, _ := rulesets.LoadFile("my-rules.yaml")
//	rules := spectral.ParseRules(rs)
//	engine := spectral.NewEngine(rules, logger)
//	diagnostics := engine.Execute(yamlContent)
//
// # Built-in Functions
//
// The [BuiltinFunctions] map provides these validators:
//
//   - truthy, falsy, defined, undefined — boolean presence checks
//   - pattern — regex matching
//   - casing — naming convention enforcement (camel, snake, kebab, etc.)
//   - length — min/max length validation
//   - enumeration — allowed value lists
//   - schema — JSON Schema validation
//   - alphabetical — ordering checks
//   - or, xor — logical combinators
//
// # JSONPath
//
// [EvaluateJSONPath] evaluates JSONPath expressions against yaml.Node
// trees and returns [Match] results with node references for precise
// source location tracking.
package spectral
