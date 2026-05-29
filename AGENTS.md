# AGENTS.md

This file is the canonical agent context for Telescope.

## Project overview

**Telescope** is the public, org-neutral spec-side editor, CLI, and custom-rule experience layer for the OpenAPI toolchain. It combines Navigator-backed document validation, Barrelman-backed rule execution, and Telescope-owned VS Code / LSP UX for multi-file API-description workspaces.

Telescope wraps Cartographer for the in-editor generation loop and the `telescope generate` command. It ships only vendor-neutral lint rules and exposes a plug-in surface (`barrelman.RegisterPlugin`) so downstream consumers can attach branded rule packs without forking this repository.

## Layout

| Path | Role |
|------|------|
| `server/` | Go language server, CLI, lint engine, generation adapter, contract-test runner, SDK |
| `client/` | VS Code extension (TypeScript, esbuild → `dist/client.js`) |
| `test-files/` | Shared OpenAPI test fixtures used by Go unit tests and TypeScript e2e tests |
| `docs/` | User docs (configuration, generation, custom rules, publishing, …) |
| `specifications/` | Vendored OpenAPI specification markdown (2.0 – 3.2) |
| `action.yml` | Reusable GitHub Action |

### Go module entry points

- `server/main.go` → `cli.Execute()` — telescope CLI (lint, validate, generate, ci, serve, contract, …)
- `server/lsp/` — gossip-based language server
- `server/generation/` — wraps `cartographer/extraction` for `telescope generate` and the IDE generation loop
- `server/lintengine/` — file-discovery + rule-execution batch lint
- `server/rules/`, `server/rules/analyzers/`, `server/rules/checks/` — registry + telescope-native generic rules
- `server/bridge/` — Barrelman → gossip diagnostic adapter
- `server/sdk/` — public embed API for programmatic linting

## Build and test

```bash
cd server
go build ./...
go test -race ./... -timeout 10m
```

VS Code extension:

```bash
pnpm install
pnpm run build:sidecar
pnpm build
```

For sibling-repo development, use a workspace `go.work` (gitignored in this repo):

```bash
go work init ./server ../barrelman ../cartographer ../navigator ../barometer
```

## Lint rule policy

Telescope ships only vendor-neutral generic rules:

- Telescope-native generic rules in `server/rules/analyzers/`: `example-matches-format`, `contact-properties`, `license-url`.
- Barrelman's generic OAS / OWASP / naming / Spectral-compat rule set (registered via `analyzers.RegisterAll`).

Vendor-branded rule packs (e.g. `sailpoint-*`, organisation-specific layout rules) are registered by **downstream consumers** via the public plug-in interface:

```go
// In a downstream consumer's lint setup:
import _ "private-consumer/lintrules/yourbrand" // init() calls barrelman.RegisterPlugin

func setup() {
    reg := barrelman.NewRegistry()
    analyzers.RegisterAll(reg)            // generic rules
    barrelman.ApplyPlugins(reg)           // registered plug-ins
}
```

Telescope's `RegisterAll` (in `server/rules/analyzers/register.go`) already calls `barrelman.ApplyPlugins` after loading the generic analyzers, so any plug-in registered via blank import will be applied automatically.

## Working boundaries

- Do NOT add fleet-orchestration knowledge here: no `services.yaml` discovery, no multi-repo cloning, no per-organisation right→scope catalogue.
- Do NOT add vendor-branded lint rules to this repo. Use the plug-in surface in a downstream consumer.
- Wrap `cartographer/extraction` through `server/generation`. Do not import `cartographer/extract/*` beyond `extract/extractionopts` (used by the generation adapter).
- Generic OpenAPI lint logic belongs in Barrelman, not here. Telescope adds editor- and CLI-facing behaviour on top.

## Leak guard

`.github/leak-guard/` ships a salted-bloom filter + shape-only patterns + a small standalone Go scanner. PR CI fails on any hit. To install the pre-push hook locally:

```bash
./scripts/install-leak-guard-hooks.sh
```

`skip-globs.local.txt` lets each repo skip specific files (e.g. third-party vendored OpenAPI fixtures) without modifying the managed defaults.

## Architecture summary

```
VS Code extension (TypeScript)
   │  stdio
   ▼
Go language server (gossip)
   ├─ tree-sitter parsers → IndexCache
   ├─ DiagnosticEngine → rule pipeline
   │     ├─ Navigator structural validation
   │     ├─ Barrelman analyzers + plug-ins
   │     ├─ Spectral YAML rulesets
   │     └─ Bun sidecar (TS/JS custom rules)
   ├─ generation adapter → cartographer/extraction
   └─ ProjectManager → cross-file $ref resolver
```

See [docs/LSP-FEATURES.md](docs/LSP-FEATURES.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown.

## Related repositories

This repo is part of a six-repo OpenAPI toolchain:

- [tree-sitter-openapi](https://github.com/sailpoint-oss/tree-sitter-openapi) — grammar and tree-sitter bindings
- [navigator](https://github.com/sailpoint-oss/navigator) — parse, index, `$ref` resolution, document validation
- [barrelman](https://github.com/sailpoint-oss/barrelman) — generic OpenAPI lint rules and plug-in surface
- [cartographer](https://github.com/sailpoint-oss/cartographer) — source-to-OpenAPI extractor for Go, Java, TypeScript, Python, C#
- [barometer](https://github.com/sailpoint-oss/barometer) — live HTTP contract testing and Arazzo runner
