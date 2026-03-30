# Telescope

A fast, extensible OpenAPI linter and language server written in Go.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Built-in Rulesets](#built-in-rulesets)
- [Custom rules (YAML and Bun)](#custom-rules-yaml-and-bun)
- [Schema Extensibility](#schema-extensibility)
- [Testing Rules](#testing-rules)
- [Design Considerations](#design-considerations)
- [Performance Notes](#performance-notes)
- [Architecture](#architecture)
- [License](#license)

## Features

- **Tree-sitter native** -- YAML/JSON parsed by tree-sitter with incremental re-parsing; no double-parsing overhead
- **88 built-in rules** -- Comprehensive OpenAPI validation covering naming, structure, security, paths, and OWASP
- **LSP server** -- Full Language Server Protocol support with hover, completion, go-to-definition, references, rename, code actions, and more
- **CLI** -- Lint files from the command line with multiple output formats (text, JSON, SARIF, GitHub annotations)
- **CI integration** -- Diff-aware linting with GitHub PR comments and quality gating
- **Custom rules** -- YAML in config plus Bun-backed TypeScript/JavaScript (see [Custom Rules](../docs/CUSTOM-RULES.md))
- **Schema extensibility** -- Validate custom `x-*` extensions and arbitrary YAML/JSON files against JSON Schema
- **Spectral/Vacuum compatible** -- Load existing rulesets in Spectral/Vacuum YAML format
- **Markdown validation** -- Lint markdown content inside OpenAPI description fields (headings, links, formatting)

## Installation

```bash
go install github.com/sailpoint-oss/telescope/server@latest
```

## Quick Start

### Validate files

```bash
telescope validate api.yaml
telescope validate workflows.arazzo.yaml --format json
```

### Lint files

```bash
telescope lint api.yaml
telescope lint ./specs/ --format json
telescope lint --severity warn --fail-on error
```

### Start LSP server

```bash
telescope serve              # stdio (default)
telescope serve --tcp :9257  # TCP
```

### CI mode

```bash
telescope ci --diff-base main --comment-pr
```

`validate` is the structural/schema-only entrypoint. `lint` layers configured rules on top of the same shared validation flow.

## Configuration

Create `.telescope.yaml` in your project root:

```yaml
extends: telescope:recommended

rules:
  operationid-unique: error
  no-trailing-slash: off

spectralRulesets:
  - ./rulesets/custom.yaml

include:
  - "**/*.yaml"
  - "**/*.json"

exclude:
  - "node_modules/**"
  - "vendor/**"

openapi:
  extensions:
    schemas:
      - redocly-extensions.json
      - my-extensions.json
    required:
      - x-stability

additionalValidation:
  github-actions:
    patterns:
      - ".github/workflows/*.yaml"
    schemas:
      - schema: github-actions.json

output:
  format: text   # text, json, sarif, github
  color: auto    # auto, always, never

lsp:
  debounce: 300ms
  maxFileSize: 5242880  # 5MB
```

### Configuration Fields

| Field | Type | Description |
|---|---|---|
| `extends` | `string` | Base ruleset (`telescope:recommended`, `telescope:all`, `telescope:owasp`, `telescope:strict`) |
| `rules` | `map[string]string` | Per-rule severity overrides (`error`, `warn`, `info`, `hint`, `off`) |
| `spectralRulesets` | `[]string` | Paths to Spectral/Vacuum-compatible YAML ruleset files |
| `include` | `[]string` | Glob patterns for files to lint |
| `exclude` | `[]string` | Glob patterns for files to ignore |
| `openapi.extensions.schemas` | `[]string` | Extension schema files in `.telescope/extensions/` |
| `openapi.extensions.required` | `[]string` | Extension names that must be present where scoped |
| `additionalValidation` | `map` | File patterns mapped to JSON Schema files for non-OpenAPI validation |
| `output.format` | `string` | CLI output format |
| `output.color` | `string` | Color mode for CLI output |
| `lsp.debounce` | `duration` | Debounce interval for LSP diagnostics |
| `lsp.maxFileSize` | `int64` | Maximum file size the LSP will process |

## Built-in Rulesets

| Ruleset | Description |
|---|---|
| `telescope:recommended` | 50 curated rules for most projects |
| `telescope:all` | All 56 non-OWASP rules |
| `telescope:owasp` | 32 OWASP API security rules |
| `telescope:strict` | Recommended + OWASP combined |

---

## Custom rules (YAML and Bun)

User-defined rules are **declarative YAML** in `.telescope.yaml` (`openapi.rules`, `spectralRulesets`, and related fields) and **TypeScript/JavaScript** executed by the optional Bun sidecar. See the [Custom Rules Guide](../docs/CUSTOM-RULES.md) for formats and examples.

The Go package [`server/sdk`](./sdk/) provides the programmatic [Workspace] API and re-exports OpenAPI model types for embedders. There is no Go plugin or subprocess RPC surface for custom rules.

---

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

**Fields:**

| Field | Type | Description |
|---|---|---|
| `name` | `string` | The extension name (e.g., `x-stability`) |
| `scope` | `[]string` | Where the extension is valid: `root`, `info`, `paths`, `pathItem`, `operation`, `parameter`, `schema`, `response`, `requestBody`, `components`, `header`, `mediaType`, `securityScheme`, `tag`, `server`, `any` |
| `description` | `string` | Human-readable description |
| `schema` | `object` | JSON Schema for the extension value |

When an extension is used outside its declared scope, Telescope reports a warning. When the value doesn't match the schema, Telescope reports a type or enum validation error.

### Built-in Vendor Extensions

Telescope ships with built-in schemas for popular vendor extensions:

- **Redocly** -- `x-logo`, `x-tagGroups`, `x-displayName`, etc.
- **Scalar** -- `x-scalar-*` properties
- **Speakeasy** -- `x-speakeasy-*` code generation directives
- **Stoplight** -- `x-stoplight` metadata

Built-in extensions are loaded automatically. No configuration required.

### Required Extensions

Mark extensions as required in `.telescope.yaml` to enforce their presence at all scoped locations:

```yaml
openapi:
  extensions:
    required:
      - x-stability
      - x-internal
```

### Additional Validation (Non-OpenAPI Files)

Apply JSON Schema validation to any YAML/JSON file by configuring pattern-based matching:

```yaml
additionalValidation:
  github-actions:
    patterns:
      - ".github/workflows/*.yaml"
    schemas:
      - schema: github-actions.json

  tsconfig:
    patterns:
      - "**/tsconfig.json"
      - "**/tsconfig.*.json"
    schemas:
      - schema: tsconfig.json
```

Place the referenced schema files in `.telescope/schemas/`. Telescope matches open files against the patterns and validates their content against the associated JSON Schema, surfacing diagnostics in the LSP. This additional-validation feature is separate from OpenAPI document validation, which is now sourced from Navigator.

---

## Testing Rules

The `rules/testing` package provides a test harness for validating rules with exact diagnostic assertions.

### Testing Go Rules

```go
package myrules_test

import (
    "testing"
    rulestest "github.com/sailpoint-oss/telescope/server/rules/testing"
)

func TestRequireSecurity(t *testing.T) {
    _, analyzer := myRule.Build()  // from rules.Define(...).Build()

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
        rulestest.Case{
            Name: "passes with security",
            Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
security:
  - bearerAuth: []
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK`,
            Expect: []rulestest.Diag{},
        },
    )
}
```

### Testing with Visitors Directly

```go
func TestMyVisitors(t *testing.T) {
    rulestest.RunVisitors(t, "my-rule", rulestest.Warn, rules.Visitors{
        Operation: func(path, method string, op *openapi.Operation, r *rules.Reporter) {
            if op.Summary == "" {
                r.At(op.Loc, "missing summary")
            }
        },
    }, rulestest.Case{
        Name: "catches missing summary",
        Spec: `...`,
        Expect: []rulestest.Diag{
            {Line: 5, Code: "my-rule", Severity: rulestest.Warn, Message: "missing summary"},
        },
    })
}
```

### Diagnostic Assertions

Each `rulestest.Diag` supports:

| Field | Type | Matching |
|---|---|---|
| `Line` | `uint32` | Exact 0-based line match |
| `Col` | `uint32` | Exact 0-based character (0 = skip check) |
| `Code` | `string` | Exact rule ID match |
| `Severity` | `DiagnosticSeverity` | Exact severity match |
| `Message` | `string` | Substring match against diagnostic message |

---

## Design Considerations

### User-authored rules

Custom rules for end users are **YAML-first** (`.telescope.yaml`, `openapi.rules`, `spectralRulesets`) and **TypeScript/JavaScript** via the optional Bun sidecar. They are hot-reloaded where supported (Spectral rulesets and sidecar rule files).

### Spectral compatibility

Existing Spectral-style YAML rulesets load through `spectralRulesets` and integrate with the same severity override model as built-in rules.

---

## Performance Notes

- **Tree-sitter incremental parsing** keeps re-parse work proportional to edits.
- **Index caching** avoids rebuilding the OpenAPI index when unchanged.
- **Debounced diagnostics** (configurable LSP debounce) batch rapid edits.

---

## Architecture

Built on the [gossip](https://github.com/LukasParke/gossip) LSP framework with native tree-sitter integration. Telescope owns the editor-facing LSP and CLI surfaces; Navigator provides canonical OpenAPI parsing/validation and Barrelman provides shared built-in rule execution.

```
server/
├── cli/            Command-line interface (lint, ci, serve)
├── config/         Configuration loading and defaults
├── extensions/     x-* extension schema validation
├── lsp/            LSP server with feature handlers
├── markdown/       Markdown parsing and validation (goldmark)
├── openapi/        Compatibility model and adapters over Navigator-backed document data
├── plugin/         In-process Plugin interface; YAML rule helpers (`yaml_rules.go`)
├── project/        Multi-file workspace and cross-file $ref resolution
├── rules/          Rule registry, builder, walker, and validators
├── rulesets/       Spectral/Vacuum-compatible ruleset loading
├── sdk/            Public Go API: Workspace, LintFiles, type re-exports
├── spectral/       Spectral custom rule engine (JSONPath + built-in functions)
├── testutil/       Test utilities and fixture specs
└── validation/     Additional non-OpenAPI file validation (`additionalValidation`)
```

### Key Dependencies

| Package | Purpose |
|---|---|
| [gossip](https://github.com/LukasParke/gossip) | LSP framework (server, protocol, document store, tree-sitter integration) |
| [navigator](https://github.com/sailpoint-oss/navigator) | Canonical OpenAPI parsing, indexing, and validation |
| [barrelman](https://github.com/sailpoint-oss/barrelman) | Shared built-in lint/check execution |
| [go-tree-sitter](https://github.com/tree-sitter/go-tree-sitter) | Incremental parsing for YAML/JSON |
| [yuin/goldmark](https://github.com/yuin/goldmark) | Markdown parsing and validation |
| [vmware-labs/yaml-jsonpath](https://github.com/vmware-labs/yaml-jsonpath) | JSONPath evaluation for Spectral rules |
| [spf13/cobra](https://github.com/spf13/cobra) | CLI framework |

## License

MIT
