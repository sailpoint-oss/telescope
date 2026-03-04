// Package rulesets handles loading, parsing, and merging of Telescope
// ruleset definitions.
//
// A ruleset controls which rules are enabled, their severity levels,
// and any custom Spectral rules. Rulesets can extend other rulesets
// and override individual rule settings.
//
// # Built-in Rulesets
//
// Telescope ships with four built-in rulesets accessible via [GetBuiltin]:
//
//   - telescope:recommended — ~35 commonly useful rules
//   - telescope:all — all available rules (~65+)
//   - telescope:owasp — security-focused rules
//   - telescope:strict — recommended + stricter OWASP enforcement
//
// # Loading Custom Rulesets
//
// Custom rulesets are YAML files compatible with Spectral's format:
//
//	rs, err := rulesets.LoadFile("my-rules.yaml")
//
// Or from bytes:
//
//	rs, err := rulesets.LoadBytes(yamlData)
//
// # Severity
//
// [ParseSeverity] converts severity strings ("error", "warn", "info",
// "hint", "off") to LSP DiagnosticSeverity values.
package rulesets
