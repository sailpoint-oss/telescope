# Maintainer Guide

This guide is the primary entry point for external open-source maintainers taking ownership of Telescope. It routes you to deeper documentation rather than duplicating it.

## What you are maintaining

Telescope is the **spec-side editor, CLI, and custom-rule experience layer** for the OpenAPI toolchain. It ships as:

- A **VS Code extension** (TypeScript client + bundled Go server)
- A **Go CLI and LSP server** (`telescope lint`, `validate`, `generate`, `ci`, `serve`, …)
- A **reusable GitHub Action** ([action.yml](../action.yml))
- An **embeddable Go SDK** ([server/sdk](../server/sdk/))

Telescope orchestrates upstream libraries (Navigator for parse/validate, Barrelman for lint rules, Cartographer for generation, Barometer for contract tests) and owns all editor-facing UX. See [TOOLCHAIN.md](TOOLCHAIN.md) for the six-repo map and dependency bump workflow.

## Day-1 setup checklist

Complete these steps before making changes:

- [ ] Clone [github.com/sailpoint-oss/telescope](https://github.com/sailpoint-oss/telescope)
- [ ] Install **Go 1.25+**, **Bun v1+**, **pnpm v8+**, and **VS Code**
- [ ] Optional: for local [gossip](https://github.com/LukasParke/gossip) development, clone gossip as a sibling of the repo (`../gossip` from repo root) and copy [go.work.example](../go.work.example) to `go.work`
- [ ] Run `pnpm install` from the repo root
- [ ] Run `cd server && go build ./...` and `go test -race ./... -timeout 10m`
- [ ] Run `pnpm build` (or `pnpm run build:sidecar && pnpm build` if you need Bun sidecar rules)
- [ ] Press **F5** in VS Code to launch the Extension Development Host; open an OpenAPI file under `test-files/`
- [ ] Run a smoke E2E: `pnpm --filter ./client test:e2e:compile && pnpm --filter ./client test:e2e:run:single`

For contributor workflow and setup commands, see [CONTRIBUTING.md](../CONTRIBUTING.md).

## Repository mental model

| Path | Role |
|------|------|
| [server/](../server/) | Go LSP server, CLI, lint engine, generation adapter, contract runner, SDK |
| [client/](../client/) | VS Code extension (session lifecycle, classification, commands) |
| [test-files/](../test-files/) | Shared fixtures for Go unit tests and TypeScript E2E |
| [action.yml](../action.yml) | Composite GitHub Action for consumer CI |
| [scripts/](../scripts/) | CI helpers, leak-guard hook installer, trace merge (see [scripts/README.md](../scripts/README.md)) |
| [docs/](README.md) | All user, contributor, and maintainer documentation |

Entry points:

- `server/main.go` → `cli.Execute()` — all CLI and `telescope serve`
- `client/src/extension.ts` — extension activation
- `server/lsp/server.go` — LSP server wiring

## Architecture reading order

Telescope architecture is documented in one canonical file:

1. **[docs/ARCHITECTURE.md](ARCHITECTURE.md)** — unified system architecture: workspace graph, GraphBridge, DiagnosticEngine, LSP handlers, data flow
2. **[CODEBASE-BREAKDOWN.md](CODEBASE-BREAKDOWN.md)** — file-level map organized by functional domain

For LSP feature behavior as shipped today, see [LSP-FEATURES.md](LSP-FEATURES.md). For document targeting and gating (`TargetDeps` in [server/lsp/target.go](../server/lsp/target.go)), see [Document targeting and gating](LSP-FEATURES.md#document-targeting-and-gating).

## Subsystem ownership map

| Subsystem | Primary packages | Key documentation |
|-----------|------------------|-------------------|
| VS Code client | `client/src/` | [CODEBASE-BREAKDOWN.md §1](CODEBASE-BREAKDOWN.md), [client/README.md](../client/README.md) |
| LSP server | `server/lsp/` | [LSP-FEATURES.md](LSP-FEATURES.md), [ARCHITECTURE.md](ARCHITECTURE.md) |
| Workspace graph | `server/core/graph/`, `server/lsp/graph_bridge.go` | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Document targeting | `server/lsp/target.go` | [LSP-FEATURES.md § targeting](LSP-FEATURES.md#document-targeting-and-gating) |
| CLI | `server/cli/` | [README.md](../README.md), [CI.md](CI.md) |
| Lint engine | `server/lintengine/`, `server/bridge/`, `server/rules/` | [RULES.md](RULES.md), [REPO-BOUNDARIES.md](REPO-BOUNDARIES.md) |
| Generation | `server/generation/` | [GENERATION.md](GENERATION.md) |
| Contract tests | `server/contractrunner/` | [README.md](../README.md) CLI section |
| Config | `server/config/` | [CONFIGURATION-V2.md](CONFIGURATION-V2.md) |
| Bun sidecar | `server/lsp/bun/` | [CUSTOM-RULES.md](CUSTOM-RULES.md) |
| GitHub Action | `action.yml`, `scripts/run-action.sh` | [CI.md](CI.md) |
| Public SDK | `server/sdk/` | [SDK.md](SDK.md) |
| Test fixtures | `test-files/`, `server/testutil/` | [test-files/README.md](../test-files/README.md), [testing.md](testing.md) |
| CI / release | `.github/workflows/` | [CI.md](CI.md), [PUBLISHING.md](PUBLISHING.md) |
| Leak guard | `.github/leak-guard/` | [.github/leak-guard/README.md](../.github/leak-guard/README.md) |

## Common maintainer tasks

### Bump navigator or barrelman

1. Update versions in [server/go.mod](../server/go.mod)
2. Run `cd server && go test -race ./... -timeout 10m`
3. Run E2E: `pnpm --filter ./client test:e2e:run:single` (and multi/sidecar if the change touches cross-file or sidecar behavior)
4. If developing across sibling repos, check Navigator's `TOOLCHAIN_FIXTURE_MATRIX.md` for parity anchors
5. See [TOOLCHAIN.md](TOOLCHAIN.md) for the full bump checklist

### Add or change an LSP handler

1. Implement in `server/lsp/<feature>.go`
2. Register in `server/lsp/server.go`
3. Gate on document targeting via `TargetDeps` when the handler should only run on OpenAPI targets (see [target.go](../server/lsp/target.go))
4. Add Go unit tests; add or extend E2E coverage in `client/src/test/suite/` when behavior is user-visible
5. Update [LSP-FEATURES.md](LSP-FEATURES.md) and [testing-inventory.md](testing-inventory.md)

### Add a lint rule

| Rule type | Where it belongs |
|-----------|------------------|
| Generic OAS / OWASP / structural | Upstream in [barrelman](https://github.com/sailpoint-oss/barrelman); Telescope bumps the dependency |
| Telescope-native generic (rare) | `server/rules/analyzers/` — see [CONTRIBUTING.md](../CONTRIBUTING.md) |
| Vendor-branded / org-specific | **Not in this repo** — downstream consumers use `barrelman.RegisterPlugin` |
| User YAML / Spectral / Bun | Documented in [CUSTOM-RULES.md](CUSTOM-RULES.md); no Telescope code change |

### Extend E2E fixtures

1. Add fixtures under `test-files/` following [test-files/README.md](../test-files/README.md)
2. Update `fixture-manifest.yaml` when mirroring from `server/testutil/specs`
3. Add test cases in `client/src/test/suite/`

### Cut a release

Telescope publishes three independent version trains on merge to `main`:

| Train | Tag format | Workflow |
|-------|------------|----------|
| VS Code extension | `extension/vX.Y.Z` | `release.yml` |
| Go module | `server/vX.Y.Z` | `release-go.yml` |
| npm SDK (`@sailpoint-oss/telescope`) | `sdk/vX.Y.Z` | `release-sdk.yml` |

See [PUBLISHING.md](PUBLISHING.md) for triggers, secrets, and manual fallback. Commit messages containing `[skip publish]` skip extension release jobs.

## Testing expectations

| Layer | Command | When required |
|-------|---------|---------------|
| Go unit + race | `cd server && go test -race ./... -timeout 10m` | Every PR touching `server/` |
| TS unit | `pnpm --filter ./client test` | Every PR touching `client/` |
| E2E single-root | `pnpm --filter ./client test:e2e:run:single` | CI on 3 OS; required for LSP/client changes |
| E2E multi-root | `pnpm --filter ./client test:e2e:run:multi` | CI on 3 OS |
| E2E sidecar | `pnpm --filter ./client test:e2e:run:sidecar` | CI when Bun sidecar changes |

CI details: [testing.md](testing.md), [CI.md](CI.md), [coverage-targets.md](coverage-targets.md).

## Boundaries you must preserve

Telescope is **org-neutral and public**. Do not add:

- Fleet orchestration (`services.yaml`, multi-repo clone pipelines)
- Vendor-branded lint rules (use the Barrelman plug-in surface in downstream consumers)
- Meridian-only fleet knowledge

Full boundary reference: [REPO-BOUNDARIES.md](REPO-BOUNDARIES.md), [AGENTS.md](../AGENTS.md).

**Leak guard:** Every PR runs `.github/leak-guard/`. Install the pre-push hook locally with `./scripts/install-leak-guard-hooks.sh`.

## Known debt and open work

Track actionable items in [TECH-DEBT.md](TECH-DEBT.md). Highlights:

- V2 graph migration: `IndexCache` remains a projection cache while handlers migrate to graph-backed reads
- LSP handler bugs documented in [LSP-BUG-REVIEW.md](LSP-BUG-REVIEW.md)

## Governance (OSS)

### Issues and pull requests

- Triage new issues for reproducibility; ask for OpenAPI sample, config, and Telescope version
- Require `go test -race ./...` and relevant E2E for LSP/client changes before merge
- Keep PRs focused; link to related issues when applicable
- Follow conventional commit style (see [CONTRIBUTING.md](../CONTRIBUTING.md))

### Release cadence

- Extension, Go module, and npm SDK versions bump independently when their paths change on `main`
- Security patches: follow [SECURITY.md](../SECURITY.md); note fixes in [CHANGELOG.md](../CHANGELOG.md)
- Toolchain coordination: navigator/barrelman land first; Telescope bumps; document in CHANGELOG

### Branded rules and downstream consumers

Telescope ships only vendor-neutral rules. Organisation-specific rule packs register via `barrelman.RegisterPlugin` in downstream binaries — never in this repository.

## Maintainer roster

Fill in this table when the new maintainer team is confirmed:

| Name | GitHub handle | Primary areas | Notes |
|------|---------------|---------------|-------|
| _TBD_ | _@handle_ | e.g. LSP, client, release | |
| _TBD_ | _@handle_ | e.g. CLI, CI action | |

Update [.github/CODEOWNERS](../.github/CODEOWNERS) with area-specific ownership when handles are known.

## See also

- [docs/README.md](README.md) — full documentation index by role
- [TOOLCHAIN.md](TOOLCHAIN.md) — six-repo coordination
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contributor workflow
- [AGENTS.md](../AGENTS.md) — concise agent/CI context
