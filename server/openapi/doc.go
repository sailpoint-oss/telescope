// Package openapi provides a typed model for OpenAPI 3.x documents with
// tree-sitter-powered parsing and source location tracking.
//
// The core workflow is:
//
//  1. Parse YAML/JSON content into a typed [Document] using [NewParser].
//  2. Build a searchable [Index] with [BuildIndex] for fast lookups by
//     operation ID, schema name, $ref target, etc.
//  3. Navigate the model using strongly-typed fields on [Document],
//     [Operation], [Schema], [PathItem], and other OpenAPI object types.
//
// Every model element carries a [Loc] value that maps it back to its
// exact position in the source file, enabling precise diagnostics.
//
// For consumers that don't need tree-sitter integration (e.g., plugins
// receiving serialized specs), [ParseAndIndex] provides a convenience
// function that parses raw YAML/JSON bytes directly into an [Index].
//
// Thread-safe caching of indexes across multiple documents is available
// via [IndexCache].
//
// # Supported Versions
//
// OpenAPI 2.0 (Swagger), 3.0, 3.1, and 3.2 are detected and parsed.
// The [Version] type provides constants for version discrimination.
package openapi
