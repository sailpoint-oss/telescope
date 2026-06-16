# Telescope Server

Go language server, CLI, and lint engine for OpenAPI workspaces.

For product overview and CLI examples, see [README.md](../README.md). For configuration, see [docs/CONFIGURATION-V2.md](../docs/CONFIGURATION-V2.md). For built-in rules, see [docs/RULES.md](../docs/RULES.md). For the Go embed API, see [docs/SDK.md](../docs/SDK.md).

## Installation

```bash
go install github.com/sailpoint-oss/telescope/server@latest
```

For Bun-backed TypeScript/JavaScript custom rules or Spectral rulesets, install [Bun](https://bun.sh) as well. Core CLI and LSP features work without Bun; only sidecar-backed rule execution is disabled.

## CLI Quick Reference

```bash
telescope generate --root ./my-service --lang go --output openapi.yaml
telescope validate api.yaml
telescope lint ./specs/ --format json
telescope ci --diff-base main --comment-pr
telescope serve              # stdio (default)
telescope serve --tcp :9257  # TCP
```

`validate` is structural/schema-only. `lint` layers configured rules on top. See [docs/GENERATION.md](../docs/GENERATION.md) for generation and [docs/CI.md](../docs/CI.md) for CI integration.

## Custom Rules and SDK

User-defined rules are configured in `.telescope/config.yaml` under `linting.rulesets` and `linting.customRules`. See [docs/CUSTOM-RULES.md](../docs/CUSTOM-RULES.md).

When running from a source checkout, build the bundled sidecar script before using Bun-backed rules:

```bash
cd server
bash lsp/bun/runner/build.sh
```

The Go package [`server/sdk`](./sdk/) provides the programmatic `Workspace` API and re-exports OpenAPI model types for embedders. There is no Go plugin or subprocess RPC surface for custom rules.

## Schema Extensibility

Telescope supports validating custom OpenAPI vendor extensions (`x-*` properties) and applying JSON Schema validation to arbitrary non-OpenAPI files.

### Custom Extension Schemas

Define extension schemas as JSON files in `.telescope/extensions/`:

```json
{
    "name": "x-stability",
    "scope": ["operation", "schema"],
    "description": "Marks the stability level of an API element",
    "schema": {
        "type": "string",
        "enum": ["stable", "beta", "alpha", "deprecated"]
    }
}
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | The extension name (e.g., `x-stability`) |
| `scope` | `[]string` | Where the extension is valid: `root`, `info`, `paths`, `pathItem`, `operation`, `parameter`, `schema`, `response`, `requestBody`, `components`, `header`, `mediaType`, `securityScheme`, `tag`, `server`, `any` |
| `description` | `string` | Human-readable description |
| `schema` | `object` | JSON Schema for the extension value |

When an extension is used outside its declared scope, Telescope reports a warning. When the value doesn't match the schema, Telescope reports a type or enum validation error.

### Built-in Vendor Extensions

Telescope ships with built-in schemas for Redocly, Scalar, Speakeasy, and Stoplight extensions. No configuration required.

### Required Extensions

In v2 config, mark extensions as required under `validation.openapi.extensions.required`. See [CONFIGURATION-V2.md](../docs/CONFIGURATION-V2.md).

### Additional Validation (Non-OpenAPI Files)

In v2 config, use `validation.files` with pattern-based JSON Schema matching. Legacy `additionalValidation` is documented in [CONFIGURATION.md](../docs/CONFIGURATION.md). Place schema files in `.telescope/schemas/`.

## Testing Rules

The `rules/testing` package provides a test harness for validating rules with exact diagnostic assertions.

```go
package myrules_test

import (
    "testing"
    rulestest "github.com/sailpoint-oss/telescope/server/rules/testing"
)

func TestRequireSecurity(t *testing.T) {
    _, analyzer := myRule.Build()

    rulestest.Run(t, analyzer,
        rulestest.Case{
            Name: "flags missing security",
            Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK`,
            Expect: []rulestest.Diag{
                {Line: 7, Code: "require-security", Severity: rulestest.Error},
            },
        },
    )
}
```

Each `rulestest.Diag` supports exact `Line`, `Col`, `Code`, `Severity`, and substring `Message` matching. See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-new-rules) for the full contributor workflow.

## Architecture

Built on [gossip](https://github.com/LukasParke/gossip) with tree-sitter integration. Navigator provides canonical OpenAPI parsing/validation; Barrelman provides shared built-in rule execution.

- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) — V2 workspace graph
- [ARCHITECTURE.md](../ARCHITECTURE.md) — gossip LSP implementation
- [docs/CODEBASE-BREAKDOWN.md](../docs/CODEBASE-BREAKDOWN.md) — file-level package map
- [docs/MAINTAINER-GUIDE.md](../docs/MAINTAINER-GUIDE.md#subsystem-ownership-map) — subsystem ownership

## License

MIT
