// Package config handles loading and parsing of Telescope configuration files.
//
// # Loading Configuration
//
// [Load] searches for configuration files in a workspace directory,
// trying each path in [ConfigFiles] order. The canonical location is
// .telescope/config.yaml, with legacy root-level config files still supported:
//
//	cfg, err := config.Load("/path/to/project")
//
// If no configuration file is found, [DefaultConfig] is returned with
// sensible defaults (extends telescope:recommended, standard include
// patterns for YAML/JSON files).
//
// [LoadFile] loads from a specific path:
//
//	cfg, err := config.LoadFile(".telescope/config.yaml")
//
// # Configuration Fields
//
// The [Config] struct supports:
//
//   - Workspace: shared targets, ignore globs, and env files
//   - Generation: inline Cartographer config plus bundle/overlay defaults
//   - Linting: rule presets, overrides, Spectral rulesets, and engine settings
//   - Validation: OpenAPI validation, breaking changes, and schema validation
//   - Testing: contract tests, workflow targets, and mock defaults
//   - Documentation: printing-press generation and preview defaults
//   - Extension: editor-only settings
//   - Legacy fields: root-level .telescope.yaml compatibility
package config
