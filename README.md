# Telescope

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=SailPointTechnologies.telescope-openapi)

**Telescope** is the spec-side editor, CLI, and custom-rule experience layer for the OpenAPI toolchain. It combines Navigator-backed document validation, Barrelman-backed rule execution, and Telescope-owned VS Code/LSP UX for multi-file API-description workspaces.

## Features

### Validation & Diagnostics

- **Real-time Diagnostics** - See linting issues as you type in VS Code
- **Navigator-backed Structural Diagnostics** - Canonical parse, schema-shape, and meta-schema issues surfaced live in the editor
- **Vendor-neutral built-in rule set** - Barrelman-backed lint coverage for naming, security, paths, documentation, and OWASP guidance. Branded rule packs (organisation-specific guideline families) attach via the `barrelman.RulePack` plug-in surface, so the default install ships only generic OpenAPI rules.
- **Multi-file Support** - Full `$ref` resolution across your API project
- **Custom Rules** - YAML rules in config, Bun sidecar TypeScript/JavaScript rules, and Spectral-compatible YAML rulesets
- **Pattern Matching** - Glob-based file inclusion/exclusion

### Code Intelligence

- **Go to Definition** - Navigate to `$ref` targets, operationId definitions, security schemes
- **Find All References** - Find all usages of schemas, components, and operationIds
- **Hover Information** - Preview referenced content inline
- **Completions** - Smart suggestions for `$ref` values, status codes, media types, tags, and common vendor extensions
- **Rename Symbol** - Safely rename operationIds and components across your workspace
- **Call Hierarchy** - Visualize component reference relationships

### Editor Features

- **Live OpenAPI generation** - Debounced cartographer extraction from Go, Java, TypeScript, Python, and C# sources with reverse-projected diagnostics onto originating code
- **Code Lens** - Reference counts, response summaries, security indicators
- **Bundle Preview** - Workspace-aware multi-file bundle previews directly from the editor
- **Inlay Hints** - Type hints for `$ref` targets, required property markers
- **Semantic Highlighting** - Enhanced syntax highlighting for OpenAPI elements
- **Quick Fixes** - Auto-add descriptions, summaries, operationIds; convert to kebab-case
- **Document Links** - Clickable `$ref`, markdown, and `externalDocs` links with precise navigation
- **Workspace Symbols** - Search operations and components across all files

### Embedded Language Support

- **Markdown in Descriptions** - Full language support with clickable http(s) and relative document links
- **Code Block Highlighting** - Syntax highlighting for 21+ languages in fenced blocks
- **Format Conversion** - Convert between JSON and YAML with a single command

See [docs/LSP-FEATURES.md](docs/LSP-FEATURES.md) for the complete feature reference.

## Quick Start

### Install the VS Code Extension

Telescope is published with different IDs depending on the distribution channel:

| Store | Extension ID | Install command |
| ----- | ------------ | --------------- |
| VS Code Marketplace | `SailPointTechnologies.telescope-openapi` | `code --install-extension SailPointTechnologies.telescope-openapi` |
| Open VSX / Cursor / VSCodium | `sailpoint.telescope` | `code --install-extension sailpoint.telescope` |

Platform-specific VSIXs that bundle the Telescope server are currently published for `darwin-arm64`, `darwin-x64`, `linux-x64`, and `win32-x64`.

The universal VSIX works on other platforms too, but it does not bundle the native `telescope` server. On those installs, provide the binary via `telescope.serverPath`, `TELESCOPE_SERVER_PATH`, or `PATH`.

### Configuration

Create `.telescope/config.yaml` in your project root. Legacy `.telescope.yaml` and `.telescope.yml` files are still supported for compatibility:

```yaml
configVersion: 2

workspace:
  targets:
    apis:
      kind: openapi
      include:
        - api/**/*.{yaml,yml,json}

linting:
  targets:
    - apis
  presets:
    - telescope:recommended

validation:
  openapi:
    targets:
      - apis
    breakingChanges:
      enabled: true
      compareTo: HEAD
```

See [docs/CONFIGURATION-V2.md](docs/CONFIGURATION-V2.md) for the full `v2` configuration reference and [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the legacy layout.

### OpenAPI detection (high-level)

- Files are discovered repo-wide using your configured `include` patterns.
- Files are classified as OpenAPI using a lightweight check for the `openapi` (3.x) or `swagger` (2.0) root key.
- When you open a classified file, the extension applies the custom language mode (`openapi-yaml` / `openapi-json`) for correct tokenization and grammars.

### Supported specifications

- Swagger 2.0
- OpenAPI 3.0.x
- OpenAPI 3.1.x
- OpenAPI 3.2.x

### Toolchain ownership

- **Navigator** - Parse, index, schema/meta validation, fragment semantics, and canonical document issues for OpenAPI and Arazzo.
- **Barrelman** - Shared lint/check execution and built-in generic rule catalog. Exposes a `RulePack` plug-in interface (`RegisterPlugin` / `ApplyPlugins`) so downstream consumers can attach branded rule packs without forking.
- **Barometer** - Contract-test HTTP execution; linked into the Telescope binary for in-process runs (no separate Barometer install).
- **Cartographer** - Service-local source extraction with neutral `x-source-*` evidence extensions; Telescope wraps it for the LSP generation loop and `telescope generate`.
- **Telescope** - VS Code client, LSP handlers, diagnostics aggregation, custom-rule runtimes, generation loop, and spec-side CLI/editor UX. Ships only vendor-neutral rules; branded rules attach via the Barrelman plug-in surface.

Contract tests are configured under `testing.contract` in `.telescope/config.yaml` (base URL, credentials keyed by OpenAPI security scheme names, shared `workspace.envFiles` for dotenv loading, optional TLS/mTLS file paths, optional OAuth token exchange, concurrency, and Wiretap settings). Workspace `.env` / `.env.local` are loaded and reloaded when those files change (same watcher as Telescope config). The editor runs tests asynchronously via LSP (`telescope.runContractTests`); the CLI runs the same engine with `telescope contract test <spec.yaml>`. See [docs/CONFIGURATION-V2.md](docs/CONFIGURATION-V2.md).

Use **Cartographer** (`cartographer extract` or the public GitHub Action) when you want extraction inside a service repository. Use **Telescope** when you want linting, validation, editor intelligence, or the live generation loop that keeps an in-memory spec synchronized with your source tree. See [docs/GENERATION.md](docs/GENERATION.md) for generation configuration.

### Multi-root workspaces

Multi-root workspaces are supported. Telescope runs **one language server per workspace folder** to keep projects isolated.

### Debug logging

Use the `telescope.trace` setting to control LSP trace logging. Keep it `off` unless you're actively debugging.
For extension-host debugging, follow the end-to-end runbook in [docs/LSP-TRACE-RUNBOOK.md](docs/LSP-TRACE-RUNBOOK.md).
To merge collected logs into one sortable artifact, use [docs/LSP-TRACE-TIMELINE.md](docs/LSP-TRACE-TIMELINE.md).

## Architecture

Telescope is the spec-side editor, CLI, and custom-rule experience layer for the OpenAPI toolchain. The VS Code extension discovers and classifies OpenAPI files per workspace folder, connects to `telescope serve` over stdio, and runs the Go server built on [gossip](https://github.com/LukasParke/gossip) with tree-sitter incremental parsing.

The server maintains a **WorkspaceGraph** via **GraphBridge** (parse, bind, snapshot pipeline) and runs **DiagnosticEngine** analyzers (Navigator structural checks, Barrelman rules, Spectral, Bun sidecar). LSP handlers read from graph-backed snapshots and an **IndexCache** projection; diagnostics merge through **DiagnosticMux** before publish.

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Repository Structure

| Directory | Description |
| --------- | ----------- |
| [`server/`](server/) | Go language server, CLI, and linting engine |
| [`client`](client) | VS Code extension client |
| [`test-files`](test-files) | Test fixtures and examples |

## Built-in Rules

Telescope ships only **vendor-neutral** rules. Branded guideline rules attach at runtime via the `barrelman.RulePack` plug-in surface (see Custom Rules below).

Default preset: `telescope:recommended`. See [docs/RULES.md](docs/RULES.md) for the full catalog, rulesets (`:all`, `:owasp`, `:strict`), and rule IDs.

### Plug-in surface for branded rule packs

Downstream consumers can register additional rules by implementing `barrelman.RulePack` and calling `barrelman.RegisterPlugin` from their package `init()`. Telescope's lint engine applies every registered plug-in alongside the generic rule set, so any binary that blank-imports the consumer's package picks up the extra rules automatically.

## CLI

The Go server ships a CLI with these main subcommands:

```bash
# Generate OpenAPI from source via cartographer (stdout or disk)
telescope generate --root ./my-service --lang go --output openapi.yaml
telescope generate --root ./my-service --watch
telescope generate --dry-run

# Structural validation only
telescope validate api.yaml
telescope validate workflows.arazzo.yaml --format json

# Lint files (validation + configured rules)
telescope lint api.yaml
telescope lint ./specs/ --format json
telescope lint --severity warn --fail-on error

# CI mode (diff-aware, PR comments)
telescope ci --diff-base main --comment-pr

# Start LSP server
telescope serve              # stdio (default)
telescope serve --tcp :9257  # TCP
```

Output formats: `text`, `json`, `sarif`, `github` (GitHub Actions annotations).

`validate` is the structural/schema-only surface. `lint` runs the same validation layer plus configured Barrelman-backed rules. In the editor, Telescope also exposes a `Telescope: Run Contract Tests` command that runs in-process Barometer contract checks and Arazzo workflow runs against a base URL.

### GitHub Action

Use the reusable action when you want the same CLI contract in GitHub Actions:

```yaml
- uses: sailpoint-oss/telescope@main
  with:
    mode: ci
    paths: specs/
    comment-pr: true
    report-md: telescope-report.md
    report-json: telescope-report.json
```

## Custom Rules

Shared built-in rules live upstream in Barrelman. Telescope-specific extensions are configured under `linting` in `.telescope/config.yaml` and can be written as **preset/override YAML**, **Bun sidecar rules**, or **Spectral-compatible YAML rulesets**:

```yaml
configVersion: 2

linting:
  presets:
    - telescope:recommended
  rulesets:
    spectral:
      - rulesets/company-rules.yaml
  customRules:
    bun:
      - path: rules/custom/my-rule.ts
        severity: warn
```

Place shared rule files under `.telescope/` and reference them from `.telescope/config.yaml`. See [docs/CUSTOM-RULES.md](docs/CUSTOM-RULES.md) for Spectral rules, Bun workflows, and YAML-native rules.

Bun is optional for Telescope's core parsing, linting, and LSP features. It is only required when you enable sidecar-backed TypeScript/JavaScript custom rules or Spectral rulesets.

The Go package [`server/sdk`](docs/SDK.md) is for **programmatic linting** (`Workspace`) and type re-exports for embedders, not for Go plugin binaries.

## Development

```bash
# Go server
cd server
go build ./...                        # verify compilation
go test -race ./... -timeout 10m      # run all tests with race detection
go build -o ../client/bin/telescope . # build binary for VS Code extension

# VS Code extension
pnpm install
pnpm run build:sidecar                # bundle/copy sidecar runner.js for sidecar-backed rules
pnpm build

# E2E (integration) tests
pnpm --filter ./client test:e2e:compile
pnpm --filter ./client test:e2e:run:single
pnpm --filter ./client test:e2e:run:multi

# Full test suite (Go + E2E) in one command
cd server && go test -race ./... -timeout 10m && \
  cd ../.. && cd gossip && go test -race ./... -timeout 10m && \
  cd ../telescope && pnpm --filter ./client test:e2e:run:single && \
  pnpm --filter ./client test:e2e:run:multi

# Run the extension locally (VS Code)
# Press F5 to launch Extension Development Host
```

For sibling Go development across the toolchain, use a workspace `go.work` file from the parent directory:

```bash
go work init ./navigator ./barrelman ./telescope/server ./barometer
go work sync
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Release Coordination

- Telescope publishes through multiple workflows; see [docs/PUBLISHING.md](docs/PUBLISHING.md) for the exact triggers.
- When Navigator or Barrelman contracts change, update `server/go.mod`, run `go test -race ./... -timeout 10m`, and then run the relevant E2E suite from the `Development` section.
- Use `../navigator/TOOLCHAIN_BOUNDARIES.md` for bump order and `../navigator/TOOLCHAIN_FIXTURE_MATRIX.md` for cross-repo smoke anchors when coordinating a release train.

## Documentation

**New maintainers:** start with [docs/MAINTAINER-GUIDE.md](docs/MAINTAINER-GUIDE.md).

Full index by role (users, contributors, maintainers): [docs/README.md](docs/README.md).

## Related Repositories

This repo is part of a six-repo OpenAPI toolchain:

- [tree-sitter-openapi](https://github.com/sailpoint-oss/tree-sitter-openapi) — grammar and tree-sitter bindings
- [navigator](https://github.com/sailpoint-oss/navigator) — parse, index, `$ref` resolution, document validation
- [barrelman](https://github.com/sailpoint-oss/barrelman) — generic OpenAPI lint rules and plug-in surface
- [cartographer](https://github.com/sailpoint-oss/cartographer) — source-to-OpenAPI extractor for Go, Java, TypeScript, Python, C#
- [barometer](https://github.com/sailpoint-oss/barometer) — live HTTP contract testing and Arazzo runner

## License

[MIT](LICENSE) - Copyright (c) 2026 SailPoint Technologies
