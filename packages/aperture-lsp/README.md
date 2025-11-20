# Aperture LSP — Volar Language Server

The Aperture language server implements the Language Server Protocol using Volar's language server framework. It provides OpenAPI linting, diagnostics, and language features to VS Code through the `aperture-client` extension.

## Responsibilities

- Implement the LSP protocol using Volar's `@volar/language-server` framework
- Provide language plugins for YAML and JSON documents containing OpenAPI content
- Execute Telescope's shared linting pipeline (loader → indexer → engine) to generate diagnostics using Volar's FileSystem API
- Handle workspace folder changes, document updates, and configuration reloads
- Support workspace diagnostics for multi-file OpenAPI projects

## Architecture

The server is built on Volar's language server infrastructure with a two-service architecture:

- **Language Plugin** (`languageModule.ts`) – Registers OpenAPI as a language and creates virtual code from document snapshots
- **Service Plugins** (`services/*.ts`) – Two main service plugins:
  - **OpenAPI Service** (`services/openapi.ts`) – Handles OpenAPI document validation with schema-aware linting and rule execution
  - **Additional Validation Service** (`services/additional-validation.ts`) – Handles config file validation, custom schemas, and generic rules
- **Context** (`context.ts`) – Manages shared state including document store, configuration, and rules
- **Documents** (`documents.ts`) – Maintains a store of OpenAPI documents with language detection
- **Core** (`core/core.ts`) – Central coordinator for IR, indexes, and diagnostics using Volar's FileSystem API directly

### Service Architecture

#### OpenAPI Service

The OpenAPI service provides comprehensive OpenAPI document validation:

- **Schema Validation**: Uses blueprint's Zod schemas (converted to JSON Schema via `z.toJSONSchema()`) with `vscode-json-languageservice` for JSON and YAML validation
- **Document Type Detection**: Uses existing `shared.documentCache.getDocumentType()` which calls `identifyDocumentType()` to determine document type (root vs fragments)
- **Schema Selection**: Maps document types to appropriate blueprint Zod schemas:
  - Root documents (`openapi-root`) → `OpenAPISchema`
  - Fragments → corresponding schemas (`PathItemSchema`, `OperationSchema`, `ParameterSchema`, etc.)
- **Config File Exclusion**: Explicitly excludes `.telescope/config.yaml` files by path (path-based check, no content parsing) at all entry points:
  - `provideDiagnostics()` - early exit before IR generation
  - `provideWorkspaceDiagnostics()` - filtered out before pattern matching
  - `onDidChangeWatchedFiles()` - skipped before file processing
- **Pattern Application**: Applies OpenAPI patterns from config (`include`/`exclude`) to all OpenAPI file discovery and validation
- **Document Building**: Discovers root OpenAPI specs, follows `$ref`s to build complete documents
- **Rule Execution**: Runs lens engine rules with full context (IR, atoms, graph)

#### Additional Validation Service

The Additional Validation service handles non-OpenAPI file validation:

- **Config File Validation**: Validates `.telescope/config.yaml` (hardcoded path, explicit, never affected by patterns) in both `provideDiagnostics` and `provideWorkspaceDiagnostics`
- **Custom Schemas**: Validates files matching user-registered schema patterns via JSON/YAML language services
- **Generic Rules**: Runs user-defined generic rules on matching files
- **Pattern Inheritance**: Group-level patterns apply to both schemas and rules unless overridden at rule/schema level

## Build

The server is bundled into a single CommonJS file using Rollup:

```bash
bun run --filter aperture-lsp build
```

This produces `out/server.js`, which includes all workspace dependencies (lens, engine, indexer, blueprint) bundled together. See `BUILD-NOTES.md` for detailed build configuration.

## Integration

The server is launched by `aperture-client` via IPC transport. The client resolves the server path to `../aperture-lsp/out/server.js` and starts it as a separate Node.js process.

## Development

1. Build the server: `bun run --filter aperture-lsp build`
2. Use VS Code's **Run Extension** launch configuration (F5) to start the extension development host
3. The server will automatically start when the client activates
4. Watch the **Aperture Language Server** output channel for server logs
5. Use the **Attach to Server** debug configuration to debug the server process (port 6009)

## Configuration

The server loads configuration from YAML files in the workspace root. Configuration includes linting rules, entrypoints, and file inclusion/exclusion patterns.

### Config File Location

The server looks for configuration files at:

- `.telescope/config.yaml`

If no config file exists, default configuration is applied.

**Recommended Structure:**

```
.telescope/
  ├── config.yaml          # Main configuration file
  ├── rules/               # Custom rules directory
  │   ├── my-openapi-rule.ts
  │   └── my-generic-rule.ts
  └── schemas/             # JSON schemas directory
      └── my-schema.json
```

### Config File Format

Configuration files use YAML format. All fields are optional except where noted:

```yaml
# Presets to extend (defaults to ["@telescope-openapi/default"])
extends:
  - "@telescope-openapi/default" # General OpenAPI best practices
  # - "@telescope-openapi/sailpoint"  # SailPoint-specific rules (extends default)

# Custom rule overrides
rules:
  operation-id-format: error
  operation-description: warn

# File-specific rule overrides
overrides:
  - files:
      - "**/legacy/**"
    rules:
      operation-id-format: off

# OpenAPI version override
versionOverride: "3.1.0"

# File inclusion patterns (glob patterns)
include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"

# File exclusion patterns (glob patterns)
exclude:
  - "**/node_modules/**"
  - "**/dist/**"
  - "**/test-*.yaml"

# Custom OpenAPI rules (paths relative to .telescope/rules/ or workspace root)
customOpenApiRules:
  - my-openapi-rule.ts
  - .telescope/rules/another-rule.ts

# Additional Validation configuration
jsonYamlValidation:
  schemas:
    - schema: my-schema.json # Resolved from .telescope/schemas/ or workspace root
      pattern: "**/config/*.yaml"
  customRules:
    - my-generic-rule.ts # Resolved from .telescope/rules/ or workspace root
```

### Pattern Matching

The `include` and `exclude` fields use Prettier-style glob patterns to control which files are processed:

- **Include patterns**: Files must match at least one include pattern to be processed
- **Exclude patterns**: Files matching any exclude pattern are skipped (supports `!` prefix)
- **Default behavior**: If no `include` patterns are specified, all files with `.yaml`, `.yml`, or `.json` extensions are included (subject to exclude patterns)
- **Pattern evaluation**: Patterns are evaluated in order; exclude patterns take precedence over include patterns
- **Config file exclusion**: `.telescope/config.yaml` is always excluded from pattern matching (handled explicitly)
- **Pattern inheritance**: In Additional Validation groups, group-level patterns apply to schemas and rules unless overridden at rule/schema level

#### Supported Glob Patterns

- `**` – Matches any number of directories
- `*` – Matches any characters except `/`
- `?` – Matches a single character
- `[]` – Character class (e.g., `[0-9]`, `[a-z]`)
- `{}` – Brace expansion (e.g., `{yaml,yml,json}`)
- `!` prefix – Exclusion pattern

#### Pattern Examples

```yaml
# Include only YAML files in src directory
include:
  - "src/**/*.yaml"
  - "src/**/*.yml"

# Exclude test files and node_modules
exclude:
  - "**/test-*.yaml"
  - "**/node_modules/**"
  - "**/*.test.yaml"

# Include all OpenAPI files except those in dist or coverage
include:
  - "**/*.yaml"
  - "**/*.yml"
exclude:
  - "**/dist/**"
  - "**/coverage/**"
```

### Configuration Reload

Configuration is automatically reloaded when:

- The config file changes (detected via file watcher)
- Workspace folders change
- The client requests a configuration reload

The server computes a configuration signature to detect changes and only reloads when the configuration actually changes.

### Default Configuration

When no config file exists, the following defaults are used:

```yaml
entrypoints:
  - openapi.yaml
extends:
  - "@telescope-openapi/default"
include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"
```

## Key Features

- **Incremental document sync** – Only processes changed document content
- **Workspace diagnostics** – Lints entire workspace when supported by the client
- **Multi-root support** – Handles multiple workspace folders
- **Document type detection** – Automatically identifies OpenAPI root documents, fragments, and non-OpenAPI files using `identifyDocumentType()`
- **Schema-aware validation** – Uses blueprint's Zod schemas converted to JSON Schema for structural validation
- **Reference graph** – Builds and maintains `$ref` dependency graphs for cross-file validation
- **Config file validation** – Always validates `.telescope/config.yaml` with explicit exclusion from pattern matching
- **Pattern matching** – Robust Prettier-style glob pattern support with comprehensive testing
