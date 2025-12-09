# Aperture Server

The Volar-based language server for Telescope. This package implements the Language Server Protocol (LSP) and contains the core linting engine for OpenAPI validation.

## Overview

The server provides:

- LSP implementation using Volar's `@volar/language-server` framework
- Language plugins for YAML and JSON documents
- OpenAPI linting with 52 built-in rules
- Custom rule and schema support
- Multi-file project handling with `$ref` resolution
- Workspace diagnostics for full project linting

## Architecture

The server has two main layers:

### LSP Layer (`src/lsp/`)

- **Language Plugins** - Register OpenAPI as a language, create virtual code from document snapshots
- **OpenAPI Service** - Schema validation, document type detection, rule execution
- **Validation Service** - Config file validation, custom schemas, generic rules
- **Core** - IR cache coordinator, document lifecycle management

### Engine Layer (`src/engine/`)

- **Config** - Configuration resolution from `.telescope/config.yaml`
- **Context** - Linting context, multi-root workspace handling
- **Execution** - Rule runners (AST-based and IR-based)
- **Indexes** - Graph building, project indexing, atom extraction
- **IR** - Intermediate representation with location tracking
- **Rules** - Rule API and built-in rules
- **Schemas** - TypeBox schemas for OpenAPI 3.0/3.1/3.2

## Running

For development, the server can run directly via Bun:

```bash
bun packages/aperture-server/src/server.ts
```

In production, the server is bundled as JavaScript and launched by `aperture-client` using Node.js.

## Source Layout

```
src/
├── server.ts           # Main entry point
├── types.ts            # Shared type definitions
├── lsp/
│   ├── core/           # IR cache coordinator
│   ├── languages/      # Volar language plugins
│   ├── services/       # OpenAPI + validation services
│   └── workspace/      # Context + documents
└── engine/
    ├── config/         # Configuration resolution
    ├── context/        # Linting context management
    ├── execution/      # Rule runners
    ├── indexes/        # Graph building, indexing
    ├── ir/             # Intermediate representation
    ├── rules/          # Rule API and built-in rules
    ├── schemas/        # OpenAPI TypeBox schemas
    └── utils/          # Utility functions
```

## Development

### Debug with VS Code

1. Press F5 to start the Extension Development Host
2. The server starts automatically when the client activates
3. Use the **Attach to Server** debug configuration (port 6009) to debug the server
4. Watch the **Aperture Language Server** output channel for logs

### Run Tests

```bash
# All tests
bun test packages/aperture-server

# Specific test file
bun test packages/aperture-server/tests/engine/rules.test.ts
```

## Configuration

The server loads configuration from `.telescope/config.yaml` in the workspace root.

### Config File Location

```
.telescope/
├── config.yaml           # Main configuration
├── rules/                # Custom rules directory
│   ├── my-openapi-rule.ts
│   └── my-generic-rule.ts
└── schemas/              # Custom schemas directory
    └── my-schema.json
```

### Config File Format

```yaml
openapi:
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/*.json"
    - "!**/node_modules/**"
  
  sailpoint: true  # Enable SailPoint-specific rules
  
  rulesOverrides:
    operation-summary: warn
    parameter-description: error
  
  rules:
    - rule: .telescope/rules/custom-rule.ts
      patterns:
        - "**/api/**/*.yaml"

additionalValidation:
  my-configs:
    patterns:
      - "configs/**/*.yaml"
    schemas:
      - schema: .telescope/schemas/config-schema.ts
    rules:
      - rule: .telescope/rules/validate-config.ts
```

See [Configuration Guide](../../docs/CONFIGURATION.md) for the full reference.

### Pattern Matching

Patterns use glob syntax with Prettier-style semantics:

- `**` - Matches any number of directories
- `*` - Matches any characters except `/`
- `!` prefix - Exclusion pattern
- `{}` - Brace expansion (e.g., `{yaml,yml,json}`)

### Default Configuration

When no config file exists:

```yaml
openapi:
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/*.json"
    - "**/*.jsonc"
```

## Built-in Rules

The server includes 52 built-in rules:

- **30 OpenAPI Rules** - General best practices
- **22 SailPoint Rules** - SailPoint-specific standards

See [RULES.md](src/engine/rules/RULES.md) for the complete rule reference.

## Key Features

| Feature | Description |
|---------|-------------|
| Incremental sync | Only processes changed document content |
| Workspace diagnostics | Lints entire workspace when supported |
| Multi-root support | Handles multiple workspace folders |
| Document type detection | Auto-identifies roots, fragments, and non-OpenAPI files |
| Schema validation | Uses TypeBox schemas converted to JSON Schema |
| Reference graph | Builds `$ref` dependency graphs for cross-file validation |
| Pattern matching | Prettier-style glob patterns with comprehensive testing |

## Related

- [Telescope README](../../README.md)
- [Aperture Client](../aperture-client/README.md)
- [Architecture](../../ARCHITECTURE.md)
- [Configuration Guide](../../docs/CONFIGURATION.md)
- [Custom Rules Guide](../../docs/CUSTOM-RULES.md)
- [Built-in Rules](src/engine/rules/RULES.md)
