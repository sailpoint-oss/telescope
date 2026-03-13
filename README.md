# Telescope

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-007ACC?logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=sailpoint.telescope)

**Telescope** is a powerful OpenAPI linting tool with real-time VS Code integration. It provides comprehensive validation, custom rule support, and multi-file project awareness.

## Features

### Validation & Diagnostics

- **Real-time Diagnostics** - See linting issues as you type in VS Code
- **88 Built-in OpenAPI Rules** - Comprehensive validation covering naming, structure, security, paths, and OWASP
- **Multi-file Support** - Full `$ref` resolution across your API project
- **Custom Rules** - Extend with Go plugin binaries or Spectral-compatible YAML rulesets
- **Pattern Matching** - Glob-based file inclusion/exclusion

### Code Intelligence

- **Go to Definition** - Navigate to `$ref` targets, operationId definitions, security schemes
- **Find All References** - Find all usages of schemas, components, and operationIds
- **Hover Information** - Preview referenced content inline
- **Completions** - Smart suggestions for `$ref` values, status codes, media types, tags
- **Rename Symbol** - Safely rename operationIds and components across your workspace
- **Call Hierarchy** - Visualize component reference relationships

### Editor Features

- **Code Lens** - Reference counts, response summaries, security indicators
- **Inlay Hints** - Type hints for `$ref` targets, required property markers
- **Semantic Highlighting** - Enhanced syntax highlighting for OpenAPI elements
- **Quick Fixes** - Auto-add descriptions, summaries, operationIds; convert to kebab-case
- **Document Links** - Clickable `$ref` links with precise navigation
- **Workspace Symbols** - Search operations and components across all files

### Embedded Language Support

- **Markdown in Descriptions** - Full language support with link validation
- **Code Block Highlighting** - Syntax highlighting for 21+ languages in fenced blocks
- **Format Conversion** - Convert between JSON and YAML with a single command

See [docs/LSP-FEATURES.md](docs/LSP-FEATURES.md) for the complete feature reference.

## Quick Start

### Install the VS Code Extension

Search for "Telescope" in the VS Code marketplace, or install from the command line:

```bash
code --install-extension sailpoint.telescope
```

### Configuration

Create `.telescope.yaml` in your project root:

```yaml
extends: telescope:recommended

rules:
  operation-summary: warn
  parameter-description: error

include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"

exclude:
  - "**/node_modules/**"
```

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for the full configuration reference.

### OpenAPI detection (high-level)

- Files are discovered repo-wide using your configured `include` patterns.
- Files are classified as OpenAPI using a lightweight check for the `openapi` (3.x) or `swagger` (2.0) root key.
- When you open a classified file, the extension applies the custom language mode (`openapi-yaml` / `openapi-json`) for correct tokenization and grammars.

### Supported specifications

- Swagger 2.0
- OpenAPI 3.0.x
- OpenAPI 3.1.x
- OpenAPI 3.2.x

### Multi-root workspaces

Multi-root workspaces are supported. Telescope runs **one language server per workspace folder** to keep projects isolated.

### Debug logging

Use the `telescope.trace` setting to control LSP trace logging. Keep it `off` unless you're actively debugging.
For extension-host debugging, follow the end-to-end runbook in [docs/LSP-TRACE-RUNBOOK.md](docs/LSP-TRACE-RUNBOOK.md).
To merge collected logs into one sortable artifact, use [docs/LSP-TRACE-TIMELINE.md](docs/LSP-TRACE-TIMELINE.md).

## Architecture

Telescope is a Go language server built on the [gossip](https://github.com/LukasParke/gossip) LSP framework, paired with a TypeScript VS Code extension client. The server uses tree-sitter for incremental YAML/JSON parsing, builds a typed OpenAPI model, runs rules against it, and publishes diagnostics back to the editor via the LSP push-diagnostic protocol (`textDocument/publishDiagnostics`).

```mermaid
flowchart TB
    subgraph client ["VS Code Extension (TypeScript)"]
        Activate["activate()"]
        SM["SessionManager"]
        Session["Session (per folder)"]
        Scanner["WorkspaceScanner"]
        Classifier["OpenAPI Classifier"]
        LC["LanguageClient (stdio)"]
    end

    subgraph server ["Go Language Server"]
        Gossip["gossip Server (JSON-RPC)"]
        DocStore["Document Store"]
        TSParser["Tree-sitter Manager"]
        IndexBuild["openapi.BuildIndex()"]
        IndexCache["IndexCache (per-URI)"]

        subgraph rules ["Rule Engine"]
            Analyzers["Built-in Analyzers (88 rules)"]
            Spectral["Spectral Engine (YAML rulesets)"]
            Plugins["Go Plugin Binaries (hashicorp/go-plugin)"]
            ExtVal["Extension Validator (x-* schemas)"]
            Checks["Syntactic Checks (duplicate keys, ASCII)"]
        end

        DiagEngine["DiagnosticEngine (caching, incremental)"]
        ProjMgr["Project Manager"]

        subgraph childLSP ["Child LSP Servers"]
            YamlLS["yaml-language-server"]
            JsonLS["vscode-json-language-server"]
        end

        Aggregator["DiagnosticAggregator (80ms debounce)"]
    end

    subgraph features ["LSP Feature Handlers"]
        Hover["Hover"]
        Definition["Go to Definition"]
        References["Find References"]
        Completion["Completions"]
        CodeAction["Code Actions / Quick Fixes"]
        More["Rename, CodeLens, InlayHints, ..."]
    end

    CLI["CLI (lint, ci, serve)"]

    Activate --> SM --> Session
    Session --> Scanner --> Classifier
    Session --> LC

    LC <-->|"stdio"| Gossip
    CLI --> Gossip

    Gossip --> DocStore
    Gossip --> TSParser
    TSParser -->|"onTreeUpdate"| DiagEngine
    DiagEngine -->|"UserDataProvider"| IndexBuild
    IndexBuild --> IndexCache
    DiagEngine --> rules
    rules --> DiagEngine

    DiagEngine -->|"Set(uri, telescope, diags)"| Aggregator
    childLSP -->|"Set(uri, yaml-ls/json-ls, diags)"| Aggregator
    Aggregator -->|"publishDiagnostics"| LC

    ProjMgr -->|"cross-file $ref resolution"| IndexCache
    ProjMgr -->|"PublishDirect"| LC

    IndexCache --> features
    features <--> LC
```

### How it works

1. **Discovery and classification.** The VS Code extension runs a `SessionManager` that creates one `Session` per workspace folder. Each session spawns a `WorkspaceScanner` that discovers YAML/JSON files via glob patterns and classifies them as OpenAPI by checking for the `openapi` or `swagger` root key. When you open a classified file, the extension applies the `openapi-yaml` or `openapi-json` language mode.

2. **Parsing.** The `LanguageClient` connects to the Go server over stdio. The gossip framework receives `didOpen`/`didChange`/`didClose` notifications, stores documents in a thread-safe document store, and feeds them to tree-sitter for incremental parsing. Document lifecycle notifications are serialized via `docSyncMu` to prevent races during language reclassification.

3. **Indexing.** On every tree update, the `DiagnosticEngine` calls the `UserDataProvider`, which runs `openapi.BuildIndex(tree, doc)`. This walks the tree-sitter CST and produces a typed `Index` containing operations, schemas, parameters, responses, security schemes, tags, and all `$ref` usages. Indexes are cached per-URI in the `IndexCache` with an on-demand builder fallback.

4. **Rule execution.** The `DiagnosticEngine` runs five categories of checks in parallel: built-in analyzers (using the fluent `RuleBuilder` visitor API), syntactic checks (tree-sitter pattern queries), Spectral-compatible YAML rulesets (JSONPath + built-in functions), Go plugin binaries (via `hashicorp/go-plugin` RPC), and vendor extension schema validators. Each produces diagnostics with precise source locations.

5. **Diagnostic aggregation.** Telescope diagnostics flow through a `DiagnosticAggregator` (from gossip's `lspclient` package) that merges results from three sources: the Telescope rule engine, the child `yaml-language-server`, and the child `vscode-json-language-server`. The aggregator debounces for 80ms, then publishes the merged set to the client via `textDocument/publishDiagnostics`.

6. **Cross-file resolution.** The `Project Manager` runs a background workspace scan, builds a dependency graph of root documents and their transitive `$ref` targets, and provides a `CrossFileResolver` to the rule engine. This enables cross-file go-to-definition, find-references, and project-level diagnostics.

7. **Feature handlers.** All 24 LSP feature handlers (hover, definition, references, completions, rename, code actions, etc.) read from the `IndexCache` and optionally the `Project Manager` to provide code intelligence.

For detailed architecture documentation, see [ARCHITECTURE.md](ARCHITECTURE.md).

## Repository Structure

| Directory | Description |
| --------- | ----------- |
| [`server/`](server/) | Go language server, CLI, and linting engine |
| [`client`](client) | VS Code extension client |
| [`test-files`](test-files) | Test fixtures and examples |

## Built-in Rules

Telescope includes **88** built-in OpenAPI rules organized into rulesets:

| Ruleset | Description |
| ------- | ----------- |
| `telescope:recommended` | 50 curated rules for most projects |
| `telescope:all` | All 56 non-OWASP rules |
| `telescope:owasp` | 32 OWASP API security rules |
| `telescope:strict` | Recommended + OWASP combined |

| Category | Count | Examples |
| -------- | ----- | -------- |
| Structure | 14 | JSON Schema validation, allOf, arrays, discriminators, unused components |
| Documentation | 17 | Descriptions, deprecation, markdown quality |
| Paths | 8 | Kebab-case, trailing slashes, parameter matching |
| Naming | 4 | Schema/example casing, operationId uniqueness |
| Security | 4 | API key placement, OAuth URLs, security requirements |
| Types | 4 | Format validation, example type/enum matching |
| Servers | 2 | Server definitions, HTTPS |
| References | 1 | Unresolved `$ref` detection |
| Syntax | 2 | Duplicate keys, ASCII |
| OWASP | 32 | Full Spectral OWASP v2.x parity |

See [docs/RULES.md](docs/RULES.md) for the complete rule reference with IDs and descriptions.

## CLI

The Go server ships a CLI with three subcommands:

```bash
# Lint files
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

## Custom Rules

Custom rules are written as **Go plugin binaries** using the Telescope SDK:

```go
package main

import "github.com/sailpoint-oss/telescope/server/sdk"

func main() {
    p := sdk.NewPlugin("my-rules", "1.0.0")

    sdk.Rule("require-security", sdk.Meta{
        Description: "All operations must define a security requirement",
        Severity:    sdk.Error,
        Category:    sdk.Security,
    }).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
        if len(op.Security) == 0 {
            r.At(op.Loc, "%s %s has no security requirement defined", method, path)
        }
    }).Register(p)

    p.Serve()
}
```

Build and deploy to `.telescope/plugins/`. Spectral-compatible YAML rulesets are also supported.

See [server/README.md](server/README.md) for the full Go plugin SDK reference and [docs/CUSTOM-RULES.md](docs/CUSTOM-RULES.md) for more details.

## Development

```bash
# Go server
cd server
go build ./...                        # verify compilation
go test -race ./... -timeout 10m      # run all tests with race detection
go build -o ../client/bin/telescope . # build binary for VS Code extension

# VS Code extension
pnpm install
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

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## Documentation

- [Server & SDK Reference](server/README.md)
- [Built-in Rules Reference](docs/RULES.md)
- [LSP Features Reference](docs/LSP-FEATURES.md)
- [CI (GitHub Actions)](docs/CI.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Custom Rules Guide](docs/CUSTOM-RULES.md)
- [Publishing Guide](docs/PUBLISHING.md)
- [Architecture](ARCHITECTURE.md)
- [Contributing](CONTRIBUTING.md)

## License

[MIT](LICENSE) - Copyright (c) 2026 SailPoint Technologies
