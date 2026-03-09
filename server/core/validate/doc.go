// Package validate provides JSON Schema validation with source-mapped errors
// and an error enrichment pipeline. It is designed for validating OpenAPI
// documents against version-specific schemas, producing diagnostics with
// precise source locations and improved error messages.
//
// The package does not import gossip/protocol or any LSP-specific types;
// it uses core/types for Range and Diagnostic.
package validate
