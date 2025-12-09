# Changelog

All notable changes to Telescope will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial public release of Telescope OpenAPI linting tool
- VS Code extension (`aperture-client`) with real-time diagnostics
- Volar-based language server (`aperture-server`) with LSP support
- 27 built-in OpenAPI rules covering best practices:
  - Core: `$ref` cycle detection, unresolved reference checking
  - Operations: operationId uniqueness, summary, tags, descriptions
  - Parameters: required fields, examples, descriptions, formats
  - Schemas: structure validation, allOf conflicts, required arrays
  - Components: naming conventions
- 11 SailPoint-specific rules for enterprise API standards
- Custom rule support with `defineRule()` and `defineGenericRule()`
- Custom Zod schema validation with `defineSchema()`
- Multi-file OpenAPI project support with `$ref` resolution
- Pattern-based file matching with glob support
- Configuration via `.telescope/config.yaml`
- Workspace diagnostics for full project linting

### Infrastructure
- Monorepo structure with pnpm workspaces
- Bun runtime for TypeScript execution and testing
- Biome for linting and formatting
- Comprehensive test fixtures in `test-files` package

---

## Version History

This is the initial release. Future versions will be documented above.

[Unreleased]: https://github.com/sailpoint-oss/telescope/compare/v0.1.0...HEAD

