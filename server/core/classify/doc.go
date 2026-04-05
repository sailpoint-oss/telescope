// Package classify provides scored heuristics to identify OpenAPI documents.
// It analyzes file content and metadata to determine whether a file is an
// OpenAPI root document, a $ref fragment, or neither. The classifier uses
// multiple signals (root key detection, key fingerprinting, graph membership,
// file extension, config overrides) with configurable weights to produce a
// confidence score. Thresholds: 0.60 for full features, 0.30 for reduced features.
package classify
