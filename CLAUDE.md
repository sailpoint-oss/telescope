# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**Telescope** is a fast, extensible OpenAPI linter and language server. The project has two implementations:

- **Go server** (`server/`) — Primary implementation. Tree-sitter-based LSP server, CLI, plugin system, and linting engine. This is where active development happens.
- **VS Code extension client** (`packages/telescope-client/`) — TypeScript VS Code extension that discovers OpenAPI files and communicates with the Go server binary.
- **TypeScript server** (`packages/telescope-server/`) — Legacy TypeScript LSP server. Still builds and ships but is being superseded by the Go server.
- **Schema definitions** (`server/schemas/`) — OpenAPI JSON Schemas defined in TypeScript/Zod, exported as JSON for use by the Go server at runtime.

## Key Commands

### Go Server (primary development)

All Go commands run from the `server/` directory:

```bash
# Build
cd server && go build ./...

# Run all tests with race detection (matches CI)
cd server && go test -race ./... -timeout 10m

# Run tests for a specific package
cd server && go test ./lsp
cd server && go test ./openapi
cd server && go test ./rules/analyzers

# Run a single test by name
cd server && go test ./lsp -run TestSpecificName

# Vet
cd server && go vet ./...

# Run the CLI directly
cd server && go run . lint <file>
cd server && go run . serve              # LSP over stdio
cd server && go run . serve --tcp :9257  # LSP over TCP
cd server && go run . ci --help
```

### VS Code Extension & TypeScript

Use **Bun** for runtime/testing, **pnpm** for workspace package management.

```bash
pnpm install                  # Install all workspace deps
pnpm build                    # Build all packages
bun test packages/telescope-server  # Run TS unit tests
pnpm lint                     # Biome check
pnpm lint:fix                 # Biome auto-fix
pnpm format                   # Biome format

# Build extension
pnpm --filter telescope-server run build
pnpm --filter ./packages/telescope-client run build

# E2E tests (needs VS Code)
pnpm --filter ./packages/telescope-client test:e2e:compile
pnpm --filter ./packages/telescope-client test:e2e:run:single
pnpm --filter ./packages/telescope-client test:e2e:run:multi
```

### Schema Generation

```bash
cd server/schemas && bun install && bun run export
```

Generates JSON Schema files in `server/schemas/generated/` — version-specific schemas for OpenAPI 3.0, 3.1, 3.2 (root documents and fragments like operation, parameter, schema, etc.).

## Go Server Architecture (`server/`)

Built on the [gossip](https://github.com/LukasParke/gossip) LSP framework with native tree-sitter integration. The `gossip` module is developed alongside Telescope via a `replace` directive in `go.mod` pointing to `../../gossip`.

### Directory Layout

| Directory | Purpose |
|-----------|---------|
| `cli/` | Cobra CLI: `lint`, `ci`, `serve` subcommands |
| `config/` | `.telescope.yaml` loading, defaults, Spectral config compat |
| `extensions/` | `x-*` vendor extension schema validation (registry, loader, built-in schemas) |
| `lsp/` | LSP server: 20+ feature handlers (hover, completion, definition, references, rename, code actions, code lens, semantic tokens, etc.) |
| `markdown/` | Markdown parsing/validation in description fields (goldmark) |
| `openapi/` | Tree-sitter → typed OpenAPI model (`Document`, `Operation`, `Schema`, etc.) with `BuildIndex()` and `IndexCache` |
| `plugin/` | Go plugin host via `hashicorp/go-plugin` — discovers/launches plugin binaries as subprocesses over RPC |
| `project/` | Multi-file workspace: file discovery, dependency graph, cross-file `$ref` resolution |
| `rules/` | Rule registry, fluent `RuleBuilder` API, `Reporter`, composable validators, `Walker` |
| `rules/analyzers/` | Built-in analyzers (structural JSON Schema validation, naming, documentation, security, OWASP, etc.) |
| `rules/checks/` | Built-in syntactic checks (duplicate keys, ASCII validation) |
| `rules/testing/` | Test harness: `rulestest.Run()` with exact diagnostic assertions |
| `rulesets/` | Ruleset loading/merging/resolution, built-in rulesets, Spectral-compatible YAML rulesets |
| `schemas/` | TypeScript/Zod schema sources + generated JSON Schema output |
| `sdk/` | Batteries-included SDK for third-party Go plugin authors |
| `spectral/` | Spectral custom rule engine (JSONPath expressions + built-in functions, no JS execution) |
| `testutil/` | Test utilities and fixture OpenAPI specs |
| `validation/` | Additional JSON Schema validation for non-OpenAPI files |

### Data Flow

```
Document (YAML/JSON)
  → Tree-sitter incremental parse
  → openapi.BuildIndex() → typed model (Document, Operations, Schemas, etc.)
  → Rule execution (analyzers + checks + spectral + plugins + extensions)
  → Diagnostics with precise source locations
  → LSP client / CLI output
```

### Diagnostic Pipeline

The `gossip` DiagnosticEngine runs multiple analyzer types in parallel:

1. **Telescope analyzers** — Built-in rules using the `RuleBuilder` visitor pattern against the OpenAPI index
2. **Telescope checks** — Tree-sitter pattern-based syntactic checks (duplicate keys, ASCII)
3. **Spectral engine** — JSONPath + built-in functions for declarative YAML rules
4. **External plugins** — Compiled Go binaries communicating via `hashicorp/go-plugin` RPC
5. **Extension validation** — `x-*` property schema validation
6. **Additional validation** — Non-OpenAPI file validation against JSON Schema
7. **Child LSP servers** — Delegated YAML/JSON syntax validation

### Key Wiring (`lsp/server.go`)

- `telescopeSetup()` — Registers all analyzers, wires OpenAPI index as user data, sets up file watchers
- `UserDataProvider` — Builds `openapi.Index` on-demand per document via `openapi.BuildIndex(tree, doc)`
- `RulesetManager` — Merges config + rulesets, applies severity filtering via `DiagnosticTransformer`
- `ChildLSPManager` — Spawns child YAML/JSON language servers for syntax-level diagnostics

## Rule Development

### Built-in Rules (Go)

Rules use a fluent builder in `server/rules/`:

```go
rules.Define("my-rule", rules.RuleMeta{
    Description: "What it checks",
    Severity:    protocol.DiagnosticSeverityWarning,
    Category:    rules.CategoryNaming,
    Recommended: true,
}).Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
    if op.Summary == "" {
        r.At(op.Loc, "%s %s is missing summary", method, path)
    }
})
```

Visitor methods: `.Document()`, `.Info()`, `.Paths()`, `.Operations()`, `.Schemas()`, `.RecursiveSchemas()`, `.Parameters()`, `.Responses()`, `.Tags()`, `.Servers()`, `.RequestBodies()`, `.SecuritySchemes()`, `.Examples()`, `.Custom()`

### Testing Rules

```go
rulestest.Run(t, analyzer,
    rulestest.Case{
        Name: "flags missing summary",
        Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers`,
        Expect: []rulestest.Diag{
            {Line: 7, Code: "my-rule", Severity: rulestest.Warn},
        },
    },
)
```

`rulestest.Diag` fields: `Line` (0-based exact), `Col` (0 = skip), `Code` (exact), `Severity` (exact), `Message` (substring match).

### Custom Rules (User-Facing)

Custom rules are **Go plugin binaries only** (JS/TS rule support was removed). Users build plugins with the SDK (`server/sdk/`), place compiled binaries in `.telescope/plugins/`, and Telescope discovers them at startup. See `server/examples/custom-plugin/main.go` for a complete example.

Spectral-compatible YAML rulesets (declarative JSONPath + built-in functions) are also supported via `.telescope.yaml` `plugins` field.

## Configuration

Go server configuration is `.telescope.yaml` in the project root:

```yaml
extends: telescope:recommended    # Base ruleset
rules:
  operationid-unique: error       # Override severity
  no-trailing-slash: off          # Disable rule
plugins:
  - ./rulesets/custom.yaml        # Spectral YAML rulesets
include:
  - "**/*.yaml"
  - "**/*.json"
exclude:
  - "node_modules/**"
```

Built-in rulesets: `telescope:recommended` (~35 rules), `telescope:all` (~65 rules), `telescope:owasp` (security), `telescope:strict` (recommended + OWASP stricter).

## Key Dependencies (Go)

| Package | Purpose |
|---------|---------|
| `github.com/LukasParke/gossip` | LSP framework (local replace at `../../gossip`) |
| `go-tree-sitter` + `tree-sitter-yaml` + `tree-sitter-json` | Incremental YAML/JSON parsing |
| `hashicorp/go-plugin` | Process-isolated plugin binaries via RPC |
| `spf13/cobra` | CLI framework |
| `yuin/goldmark` | Markdown parsing |
| `vmware-labs/yaml-jsonpath` | JSONPath for Spectral rules |
| `gopkg.in/yaml.v3` | YAML unmarshaling |

## Common Gotchas

- **gossip is local**: The `go.mod` has `replace github.com/LukasParke/gossip => ../../gossip`. You need the gossip repo cloned as a sibling.
- **Tree-sitter locations are 0-based**: Both line and column. LSP protocol also uses 0-based lines and 0-based UTF-16 character offsets.
- **Version-specific schemas**: OpenAPI 3.0, 3.1, and 3.2 each have their own generated schema files. The old generic `openapi-3.x-*` files were removed.
- **Index caching**: `openapi.IndexCache` is thread-safe (`sync.RWMutex`). Invalidated on document changes.
- **Plugin cleanup**: Always `defer host.Shutdown()` to terminate plugin subprocesses.
- **No JS/TS runtime**: goja and esbuild were removed. The `server/examples/js-rules/` directory is legacy reference only.

## CI/CD

GitHub Actions (`.github/workflows/ci.yml`):

1. **Go** — Build, vet, test with race detection on Ubuntu/macOS/Windows
2. **TypeScript** — Unit tests, extension build
3. **E2E** — VS Code integration tests (needs Go + TS builds)

## Style

- **Go**: Standard `go fmt`, `go vet`
- **TypeScript**: Biome — tabs, double quotes, semicolons required
- **Commits**: Conventional format: `feat(scope):`, `fix(scope):`, `docs:`, `refactor:`, `test:`, `chore:`
