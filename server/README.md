# Telescope

A fast, extensible OpenAPI linter and language server written in Go.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Built-in Rulesets](#built-in-rulesets)
- [Custom Rules: Go Plugin SDK](#custom-rules-go-plugin-sdk)
- [Custom Rules: JavaScript](#custom-rules-javascript)
- [Custom Rules: TypeScript](#custom-rules-typescript)
- [Schema Extensibility](#schema-extensibility)
- [Testing Rules](#testing-rules)
- [Design Considerations](#design-considerations)
- [Performance Notes](#performance-notes)
- [Architecture](#architecture)
- [License](#license)

## Features

- **Tree-sitter native** -- YAML/JSON parsed by tree-sitter with incremental re-parsing; no double-parsing overhead
- **65+ built-in rules** -- Comprehensive OpenAPI validation covering naming, structure, security, paths, and OWASP
- **LSP server** -- Full Language Server Protocol support with hover, completion, go-to-definition, references, rename, code actions, and more
- **CLI** -- Lint files from the command line with multiple output formats (text, JSON, SARIF, GitHub annotations)
- **CI integration** -- Diff-aware linting with GitHub PR comments and quality gating
- **Go plugin SDK** -- Extend with compiled Go plugin binaries using a batteries-included SDK
- **JS/TS scripting** -- Drop-in JavaScript or TypeScript rule files with zero external tooling
- **Schema extensibility** -- Validate custom `x-*` extensions and arbitrary YAML/JSON files against JSON Schema
- **Spectral/Vacuum compatible** -- Load existing rulesets in Spectral/Vacuum YAML format
- **Markdown validation** -- Lint markdown content inside OpenAPI description fields (headings, links, formatting)

## Installation

```bash
go install github.com/sailpoint-oss/telescope/server@latest
```

## Quick Start

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

## Configuration

Create `.telescope.yaml` in your project root:

```yaml
extends: telescope:recommended

rules:
  operationid-unique: error
  no-trailing-slash: off

plugins:
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
| `plugins` | `[]string` | Paths to Spectral/Vacuum-compatible YAML ruleset files |
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
| `telescope:recommended` | ~35 curated rules for most projects |
| `telescope:all` | All ~65 rules enabled |
| `telescope:owasp` | 15 OWASP security rules |
| `telescope:strict` | Recommended + OWASP with stricter severities |

---

## Custom Rules: Go Plugin SDK

The Go Plugin SDK lets you write custom rules as a compiled binary. Your plugin runs as an isolated subprocess and communicates with the Telescope host via RPC. This gives you full access to the Go type system, the complete OpenAPI model, and composable validators -- while keeping the core LSP safe from plugin crashes.

### How It Works

```
┌──────────────┐       RPC (net/rpc)       ┌──────────────────┐
│  Telescope   │  ────────────────────────► │  Your Plugin     │
│  (host)      │  ◄────────────────────────  │  Binary          │
│              │   GetMeta / Analyze        │                  │
└──────────────┘                            └──────────────────┘
```

1. Telescope discovers plugin binaries in `.telescope/plugins/` at startup
2. Each plugin is launched as a subprocess using [hashicorp/go-plugin](https://github.com/hashicorp/go-plugin)
3. The host calls `GetMeta()` once to discover the rules the plugin provides
4. On each document change, the host calls `Analyze()` with the raw document content
5. The plugin parses the document internally, runs all its rules, and returns diagnostics

### Getting Started

Create a new Go module for your plugin:

```bash
mkdir my-telescope-rules && cd my-telescope-rules
go mod init github.com/yourorg/my-telescope-rules
go get github.com/sailpoint-oss/telescope/server/sdk@latest
```

Write your rules in `main.go`:

```go
package main

import "github.com/sailpoint-oss/telescope/server/sdk"

func main() {
    p := sdk.NewPlugin("my-rules", "1.0.0")

    sdk.Rule("require-security", sdk.Meta{
        Description: "All operations must define a security requirement",
        Severity:    sdk.Error,
        Category:    sdk.Security,
        Recommended: true,
        HowToFix:    "Add a 'security' array to the operation or at the document root.",
    }).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
        if len(op.Security) == 0 {
            r.At(op.Loc, "%s %s has no security requirement defined", method, path)
        }
    }).Register(p)

    sdk.Rule("schema-pascal-case", sdk.Meta{
        Description: "Component schema names should use PascalCase",
        Severity:    sdk.Warn,
        Category:    sdk.Naming,
        Recommended: true,
        HowToFix:    "Rename the schema to use PascalCase (e.g., 'user_profile' -> 'UserProfile').",
    }).Schemas(func(name string, s *sdk.Schema, _ string, r *sdk.Reporter) {
        result := sdk.V.TitleCase()(name, "schema name")
        if !result.Valid {
            r.At(s.Loc, "Schema %q should use PascalCase", name)
        }
    }).Register(p)

    p.Serve()
}
```

Build and deploy:

```bash
go build -o my-rules .
mkdir -p /path/to/project/.telescope/plugins
cp my-rules /path/to/project/.telescope/plugins/
```

### SDK API Reference

Everything you need is in the `sdk` package -- a single import gives you the OpenAPI model types, rule builder, reporter, validators, and severity/category constants.

```go
import "github.com/sailpoint-oss/telescope/server/sdk"
```

#### Creating a Plugin

```go
p := sdk.NewPlugin("plugin-name", "1.0.0")
// ... register rules ...
p.Serve()  // blocks until host disconnects
```

#### Defining Rules

`sdk.Rule()` returns a builder. Chain visitor methods to specify which OpenAPI elements your rule inspects, then call `.Register(p)` to add it to the plugin.

```go
sdk.Rule("rule-id", sdk.Meta{
    Description: "Human-readable description",
    Severity:    sdk.Warn,         // sdk.Error, sdk.Warn, sdk.Hint
    Category:    sdk.Security,     // sdk.Naming, sdk.Documentation, sdk.Structure, ...
    Recommended: true,             // included in telescope:recommended
    HowToFix:    "Fix guidance",   // shown in code actions
    DocURL:      "https://...",    // link to rule documentation
})
```

#### Visitor Methods

Each visitor method provides the relevant OpenAPI model element and a `*sdk.Reporter` for reporting diagnostics:

| Method | Callback Signature |
|---|---|
| `.Document(fn)` | `func(doc *sdk.Document, r *sdk.Reporter)` |
| `.Info(fn)` | `func(info *sdk.Info, r *sdk.Reporter)` |
| `.Paths(fn)` | `func(path string, item *sdk.PathItem, r *sdk.Reporter)` |
| `.Operations(fn)` | `func(path string, method string, op *sdk.Operation, r *sdk.Reporter)` |
| `.Schemas(fn)` | `func(name string, schema *sdk.Schema, pointer string, r *sdk.Reporter)` |
| `.RecursiveSchemas(fn)` | `func(name string, schema *sdk.Schema, pointer string, r *sdk.Reporter)` |
| `.Parameters(fn)` | `func(param *sdk.Parameter, r *sdk.Reporter)` |
| `.Responses(fn)` | `func(code string, resp *sdk.Response, r *sdk.Reporter)` |
| `.Tags(fn)` | `func(tag *sdk.Tag, r *sdk.Reporter)` |
| `.Servers(fn)` | `func(server *sdk.Server, r *sdk.Reporter)` |
| `.RequestBodies(fn)` | `func(path string, method string, rb *sdk.RequestBody, r *sdk.Reporter)` |
| `.SecuritySchemes(fn)` | `func(name string, ss *sdk.SecurityScheme, r *sdk.Reporter)` |
| `.Examples(fn)` | `func(name string, ex *sdk.Example, r *sdk.Reporter)` |
| `.Custom(fn)` | `func(idx *sdk.Index, r *sdk.Reporter)` |

`.Schemas()` visits only top-level component schemas. `.RecursiveSchemas()` walks into nested `properties`, `items`, `allOf`, `anyOf`, `oneOf`, and `additionalProperties`.

`.Custom()` receives the full `openapi.Index` for rules that need cross-cutting logic across multiple elements.

#### Reporter API

The reporter provides a clean interface for emitting diagnostics without constructing `protocol.Diagnostic` values manually:

```go
r.At(loc, "format string %s", arg)           // report at an openapi.Loc
r.AtRange(rng, "message")                     // report at an explicit protocol.Range
r.Error(loc, "critical: %s", msg)             // force error severity
r.Warn(loc, "advisory: %s", msg)              // force warning severity
r.ErrorAtRange(rng, "message")                // error at explicit range
r.WarnAtRange(rng, "message")                 // warning at explicit range
```

Chainable enrichment methods apply to the next diagnostic reported:

```go
r.WithTags(protocol.DiagnosticTagDeprecated).At(loc, "deprecated field")
r.WithRelated(otherLoc, otherURI, "see also: %s", ref).At(loc, "duplicate definition")
r.WithData(customPayload).At(loc, "fixable issue")
```

#### Composable Validators

The `sdk.V` struct provides reusable field validators that can be combined:

```go
sdk.V.Required()                     // value must be non-empty
sdk.V.MinLength(10)                  // minimum character count
sdk.V.MaxLength(200)                 // maximum character count
sdk.V.Pattern(regexp.MustCompile(`^[a-z]+$`))  // regex match
sdk.V.OneOf([]string{"a", "b"})      // allowlist
sdk.V.TitleCase()                    // starts with uppercase
sdk.V.CamelCase()                    // camelCase format
sdk.V.KebabCase()                    // kebab-case format
sdk.V.Custom(fn, "message")          // arbitrary predicate

sdk.V.All(v1, v2, v3)               // all must pass
sdk.V.Any(v1, v2)                    // at least one must pass
sdk.V.Optional(v)                    // skip if empty, validate otherwise
```

Usage in a rule:

```go
sdk.Rule("operationid-kebab", sdk.Meta{
    Description: "Operation IDs should use kebab-case",
    Severity:    sdk.Warn,
    Category:    sdk.Naming,
}).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
    result := sdk.V.All(
        sdk.V.Required(),
        sdk.V.KebabCase(),
    )(op.OperationID, "operationId")
    if !result.Valid {
        r.At(op.Loc, "%s", result.Message)
    }
}).Register(p)
```

#### Type Aliases

The `sdk` package re-exports all OpenAPI model types so you never need to import `openapi` directly:

`sdk.Document`, `sdk.Info`, `sdk.Server`, `sdk.PathItem`, `sdk.Operation`, `sdk.Parameter`, `sdk.RequestBody`, `sdk.Response`, `sdk.Header`, `sdk.MediaType`, `sdk.Schema`, `sdk.Example`, `sdk.SecurityScheme`, `sdk.SecurityRequirement`, `sdk.Tag`, `sdk.ExternalDocs`, `sdk.Components`, `sdk.Index`, `sdk.Loc`, `sdk.DescriptionValue`, `sdk.Node`

Rule authoring types: `sdk.Reporter`, `sdk.Meta`, `sdk.Category`, `sdk.Validator`, `sdk.ValidationResult`

#### Severity Constants

| Constant | Value | Alias |
|---|---|---|
| `sdk.SeverityError` | Error | `sdk.Error` |
| `sdk.SeverityWarning` | Warning | `sdk.Warn` |
| `sdk.SeverityInfo` | Information | -- |
| `sdk.SeverityHint` | Hint | `sdk.Hint` |

#### Category Constants

| Constant | Usage |
|---|---|
| `sdk.Naming` | Naming conventions (casing, patterns) |
| `sdk.Documentation` | Missing descriptions, summaries, examples |
| `sdk.Structure` | Structural issues (missing fields, invalid patterns) |
| `sdk.Types` | Type system issues (invalid types, format mismatches) |
| `sdk.Security` | Security requirements, authentication |
| `sdk.Servers` | Server configuration |
| `sdk.Paths` | Path structure and parameters |
| `sdk.References` | `$ref` resolution and validity |
| `sdk.Syntax` | Parsing and syntax errors |
| `sdk.OWASP` | OWASP API security rules |

---

## Custom Rules: JavaScript

JavaScript rules are single-file scripts that run inside an embedded [goja](https://github.com/dop251/goja) runtime (ES5.1 + select ES6 features). No external tooling, no build step -- just drop a `.js` file and it works.

### How It Works

1. Place `.js` files in `.telescope/rules/`
2. Telescope loads each file at startup and extracts `exports.meta`
3. On each document change, Telescope creates a fresh goja VM, runs your script, and calls `exports.check(ctx)`
4. Your rule uses `ctx` visitor methods to walk the OpenAPI model and `ctx.report()` to emit diagnostics

### Contract

Every JS rule must export two things:

```javascript
exports.meta = {
    id: "rule-id",                 // unique identifier
    description: "What it checks", // human-readable description
    severity: "warn",              // "error", "warn", "info", or "hint"
    category: "security",          // grouping category
};

exports.check = function(ctx) {
    // rule logic here
};
```

### Context API

The `ctx` object provides visitor methods that walk the OpenAPI model and call your function for each matching element:

| Method | Callback Signature |
|---|---|
| `ctx.operations(fn)` | `fn(path, method, operation)` |
| `ctx.schemas(fn)` | `fn(name, schema, pointer)` |
| `ctx.recursiveSchemas(fn)` | `fn(name, schema, pointer)` |
| `ctx.paths(fn)` | `fn(path, pathItem)` |
| `ctx.parameters(fn)` | `fn(parameter)` |
| `ctx.tags(fn)` | `fn(tag)` |
| `ctx.servers(fn)` | `fn(server)` |
| `ctx.responses(fn)` | `fn(code, response)` |
| `ctx.requestBodies(fn)` | `fn(path, method, requestBody)` |
| `ctx.securitySchemes(fn)` | `fn(name, securityScheme)` |
| `ctx.report(loc, message)` | Report a diagnostic at a source location |

The `ctx.document` property provides direct access to the top-level document object.

### Object Shapes

**Location (`loc`)**: Every model object has a `loc` property:

```javascript
{
    startLine: 0,   // 0-based line number
    startChar: 0,   // 0-based character offset
    endLine: 0,
    endChar: 0
}
```

**Description**: Description fields are objects with `text` and `loc`:

```javascript
{
    text: "The description content",
    loc: { startLine: 5, startChar: 2, endLine: 5, endChar: 30 }
}
```

**Operation**: Key fields include `operationId`, `summary`, `description`, `deprecated`, `tags` (string array), `security`, `parameters`, `responses`, `requestBody`, `extensions`, and `loc`.

**Schema**: Key fields include `type`, `format`, `title`, `description`, `pattern`, `nullable`, `readOnly`, `writeOnly`, `deprecated`, `ref`, `enum`, `required`, `properties`, `extensions`, and `loc`.

### Full Example

```javascript
exports.meta = {
    id: "require-rate-limit",
    description: "Responses should include rate limit headers",
    severity: "warn",
    category: "security",
};

exports.check = function(ctx) {
    ctx.operations(function(path, method, op) {
        var responses = op.responses;
        if (!responses) return;

        var codes = Object.keys(responses);
        for (var i = 0; i < codes.length; i++) {
            var code = codes[i];
            if (code.charAt(0) !== "2") continue;

            var resp = responses[code];
            var headers = resp.headers;
            if (!headers) {
                ctx.report(resp.loc,
                    method + " " + path + " " + code + " should include rate limit headers");
                continue;
            }

            var headerKeys = Object.keys(headers);
            var hasRateLimit = false;
            for (var j = 0; j < headerKeys.length; j++) {
                if (headerKeys[j].toLowerCase().indexOf("rate-limit") !== -1) {
                    hasRateLimit = true;
                    break;
                }
            }

            if (!hasRateLimit) {
                ctx.report(resp.loc,
                    method + " " + path + " " + code + " should include rate limit headers");
            }
        }
    });
};
```

### Sandbox Limitations

The goja runtime is sandboxed. The following are **not available**:

- `require()` / `import` -- no module system
- `fetch()` / `XMLHttpRequest` -- no network access
- `fs`, `process`, `child_process` -- no filesystem or OS access
- `async` / `await` / `Promise` -- no asynchronous operations
- `setTimeout` / `setInterval` -- no timers

A **5-second timeout** prevents infinite loops from blocking the LSP. If a script exceeds this limit, execution is terminated and no diagnostics are returned.

---

## Custom Rules: TypeScript

TypeScript rules work exactly like JavaScript rules but with full type annotations, interfaces, and modern syntax. TypeScript files are transparently transpiled to JavaScript using [esbuild](https://esbuild.github.io/) (compiled into the Telescope binary -- no external `esbuild` install required).

### How It Works

1. Place `.ts` files in `.telescope/rules/` (`.d.ts` files are skipped automatically)
2. Telescope transpiles each `.ts` file to JS via esbuild (CommonJS output, ES2020 target)
3. The transpiled JS runs in the same goja runtime as `.js` files
4. Same `exports.meta` + `exports.check(ctx)` contract applies

### Type Definitions

Copy the type definition file from the examples into your rules directory for full IDE IntelliSense:

```bash
cp examples/js-rules/telescope.d.ts .telescope/rules/
```

Then reference it at the top of your `.ts` files:

```typescript
/// <reference path="./telescope.d.ts" />
```

The type definitions cover the full API surface: `Loc`, `Description`, `Document`, `Operation`, `Schema`, `Parameter`, `Response`, `Header`, `MediaType`, `RequestBody`, `Tag`, `Server`, `SecurityScheme`, `RuleContext`, and `RuleMeta`.

### Full Example

```typescript
/// <reference path="./telescope.d.ts" />

exports.meta = {
    id: "require-operation-tags",
    description: "Every operation must have at least one tag",
    severity: "warn",
    category: "documentation",
};

exports.check = (ctx: RuleContext) => {
    ctx.operations((path: string, method: string, op: Operation) => {
        if (!op.tags || op.tags.length === 0) {
            ctx.report(op.loc, `${method.toUpperCase()} ${path} is missing tags`);
        }
    });
};
```

### Benefits Over Plain JavaScript

- **Type annotations** -- catch typos and incorrect field access at author time
- **Interfaces** -- auto-complete for `op.operationId`, `schema.type`, `param.in`, etc.
- **Arrow functions and template literals** -- cleaner callback syntax
- **IDE IntelliSense** -- full hover docs and go-to-definition with the `.d.ts` file
- **Same deployment** -- `.ts` files go in the same `.telescope/rules/` directory

### Transpilation Details

Telescope uses `esbuild` as a Go library (`github.com/evanw/esbuild/pkg/api`), meaning:

- No external binary is spawned -- transpilation happens in-process
- Output format is CommonJS to match the `exports.meta` / `exports.check` contract
- Target is ES2020, which covers the subset of ES6+ features goja supports
- Transpilation is effectively instant (microsecond-level for typical rule files)
- Type annotations are stripped -- no runtime type checking (same as `tsc --noEmit false`)

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

Place the referenced schema files in `.telescope/schemas/`. Telescope matches open files against the patterns and validates their content against the associated JSON Schema, surfacing diagnostics in the LSP.

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

### Process Isolation (Go Plugins)

Go plugin binaries run as separate subprocesses managed by `hashicorp/go-plugin`. This means:

- **Crash isolation** -- a panic in a plugin does not crash the LSP server or CLI
- **No Go version coupling** -- plugins can be compiled with a different Go version than the host
- **Memory isolation** -- each plugin has its own heap; a leaking plugin doesn't affect the host
- **Clean shutdown** -- the host terminates plugin processes on exit via deferred `Shutdown()`

### Sandbox Security (JS/TS)

The goja JavaScript runtime is intentionally restricted:

- **No filesystem access** -- rules cannot read, write, or list files
- **No network access** -- no HTTP, WebSocket, or DNS operations
- **No module system** -- `require()` and `import` are unavailable
- **No OS interaction** -- no `process`, `child_process`, or environment variable access
- **CPU timeout** -- 5-second wall-clock limit prevents infinite loops from blocking the LSP

A fresh VM is created for each rule execution, ensuring no state leaks between runs.

### Single Binary Distribution

JavaScript and TypeScript rules run inside the Telescope binary itself. The goja runtime and esbuild transpiler are both pure Go libraries compiled into the binary. This means:

- No Node.js installation required
- No `npm install` step for users
- No external `esbuild` binary to manage
- The Telescope binary is fully self-contained

### RPC Protocol Stability

The plugin protocol includes a version number (`ProtocolVersion = 1`) and a handshake cookie. When breaking changes are made to the RPC interface, the protocol version is incremented. Plugins built against an older SDK version will fail the handshake cleanly rather than producing corrupt data.

### Hot Reload

- **JS/TS rules** -- reloaded on file change during an LSP session; edit, save, and see updated diagnostics
- **Go plugins** -- require rebuilding the binary and restarting the LSP (the binary is discovered at startup)

### Spectral Compatibility

Existing `.spectral.yaml` rulesets are auto-discovered and loaded alongside native rules. This allows incremental migration: start with your existing Spectral configuration, then gradually replace declarative rules with Go or JS/TS rules for better performance and richer logic.

---

## Performance Notes

### Go Plugins

- **RPC overhead**: ~50-100 microseconds per document per plugin for the RPC round trip
- **Parsing**: the plugin receives raw document bytes and parses its own OpenAPI index (~1-3ms for typical specs)
- **Net effect**: negligible compared to the 150-300ms LSP debounce interval
- **Parallelism**: multiple plugins can run concurrently; results are merged
- **Startup**: plugin discovery and `GetMeta()` is a one-time cost (~10-50ms per plugin at LSP startup)

### JS/TS Rules

- **Execution time**: ~1-5ms per rule per document for typical rules
- **VM creation**: a fresh goja VM is created per rule execution for isolation; creation cost is ~0.1ms
- **Bridge overhead**: the Go-to-JS model conversion adds ~0.5-2ms depending on spec size
- **Multiple rules**: rules run sequentially in the same goroutine; 10 JS rules on a medium spec ≈ 20-50ms total

### TypeScript Transpilation

- **First load**: esbuild transpilation is effectively instant (microsecond-level for typical rule files)
- **Cached**: transpiled JS is held in memory after first load; subsequent executions skip transpilation
- **Binary size**: esbuild adds ~8MB to the Telescope binary (pure Go, no CGO)

### Recommendations

| Scenario | Recommended Approach |
|---|---|
| Quick single-file rule | JS or TS in `.telescope/rules/` |
| Type-safe rule authoring with IDE support | TS with `telescope.d.ts` |
| Multi-rule package for distribution | Go plugin binary |
| Complex cross-cutting validation | Go plugin with `.Custom()` visitor |
| Prototyping and iteration | JS (no build step, instant reload) |
| CI/CD pipelines | Go plugin for deterministic, compiled checks |

---

## Architecture

Built on the [gossip](https://github.com/LukasParke/gossip) LSP framework with native tree-sitter integration:

```
telescope-go/
├── cli/            Command-line interface (lint, ci, serve)
├── config/         Configuration loading and defaults
├── extensions/     x-* extension schema validation
│   ├── analyzer.go     OpenAPI model walker for extension validation
│   ├── builtin.go      Embedded vendor extension schemas
│   ├── loader.go       File-based extension loading
│   ├── registry.go     Thread-safe extension registry
│   └── types.go        Extension types and scopes
├── examples/
│   ├── custom-plugin/  Example Go plugin binary
│   └── js-rules/       Example JS/TS rule scripts
├── lsp/            LSP server with 13+ feature handlers
├── markdown/       Markdown parsing and validation (goldmark)
├── openapi/        Typed OpenAPI model built from tree-sitter parse trees
├── plugin/
│   ├── host.go         Plugin discovery and RPC management
│   ├── protocol.go     RPC wire types and go-plugin integration
│   └── script/         JS/TS runtime (goja + esbuild)
│       ├── bridge.go       Go model → JS object conversion
│       ├── goja.go         goja VM lifecycle and sandboxing
│       ├── loader.go       Script discovery and loading
│       ├── runtime.go      ScriptRule execution
│       └── transpile.go    TypeScript → JavaScript via esbuild
├── rules/          Rule registry, builder, walker, and validators
│   ├── analyzers/      Built-in rule implementations
│   ├── builder.go      Fluent rule definition API
│   ├── reporter.go     Diagnostic reporting helpers
│   ├── testing/        Test harness for rules
│   ├── validators.go   Composable field validators
│   └── walker.go       OpenAPI model traversal
├── rulesets/       Spectral/Vacuum-compatible ruleset loading
├── sdk/            Batteries-included SDK for Go plugin authors
│   ├── plugin.go       Plugin instance and RPC server
│   ├── rule.go         Plugin-scoped rule builder
│   └── types.go        Type aliases and constants
├── schemas/        JSON Schema definitions (built via Zod)
└── validation/     Additional file validation against JSON Schema
```

### Key Dependencies

| Package | Purpose |
|---|---|
| [gossip](https://github.com/LukasParke/gossip) | LSP framework (server, protocol, document store, tree-sitter integration) |
| [go-tree-sitter](https://github.com/tree-sitter/go-tree-sitter) | Incremental parsing for YAML/JSON |
| [hashicorp/go-plugin](https://github.com/hashicorp/go-plugin) | Process-isolated plugin binaries via RPC |
| [dop251/goja](https://github.com/dop251/goja) | Embedded JavaScript runtime (ES5.1+) |
| [evanw/esbuild](https://github.com/evanw/esbuild) | TypeScript to JavaScript transpilation |
| [yuin/goldmark](https://github.com/yuin/goldmark) | Markdown parsing and validation |

## License

MIT
