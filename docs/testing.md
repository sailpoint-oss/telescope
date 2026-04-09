# Testing Telescope

This repo uses a **test pyramid**: most behavior is proven in **Go** (language server) and **Bun** (pure TypeScript); **VS Code E2E** validates wiring among the extension, bundled server binary, and editor host.

## Where to add tests

| Change | Add tests in |
|--------|----------------|
| New or changed **LSP behavior** (diagnostics, completion, rename, format, hover content, etc.) | `server/lsp/` — prefer `handler_test.go` and `integration_test.go` first, then add one E2E only if the editor host wiring or returned `WorkspaceEdit` shape is part of the contract. |
| **Sidecar / custom rules / Bun runner** | `server/lsp/bun/`, `server/lsp/bun/runner/src/*.test.ts`, and related integration tests. |
| **Editor-only** behavior (language IDs, workspace scanning, session wiring) | Bun tests under `client/test/` when logic is pure; otherwise E2E. |
| **End-to-end** | Keep **wiring** coverage: activation, client↔server, one journey per major area. Do not duplicate everything Go already asserts. |

Full mapping of features, Go tests, and E2E cases (including A/B/C tags) lives in [`testing-inventory.md`](./testing-inventory.md).

## CI (required checks)

The [`CI` workflow](.github/workflows/ci.yml) runs on every push/PR to `main`. If branch protection is enabled, require both the `E2E` and `E2E Sidecar` checks so the full sidecar wiring suite stays mandatory on every PR:

- **Go** — `go test -race` on Ubuntu, macOS, and Windows.
- **Go coverage** — CI reports both `core_coverage` (Tier A packages) and `repo_coverage`. The finish-line target is `core_coverage >= 95.0%`; both metrics also have ratchet floors that must not regress.
- **TypeScript** — client typecheck, build, Bun unit tests, and Bun sidecar runner tests (Ubuntu).
- **E2E** — VS Code extension-host single-root and multi-root wiring on **Ubuntu, macOS, and Windows**.
- **E2E Sidecar** — the full sidecar wiring suite on a fresh runner for **Ubuntu, macOS, and Windows**. No smoke subset on PRs: the matrix is the source of truth for host wiring.

VS Code used by `@vscode/test-electron` is **pinned** via `VSCODE_TEST_VERSION` (default in [`client/src/test/vscode-test-version.ts`](../client/src/test/vscode-test-version.ts)); CI sets the same env in the workflow. Bump alongside `engines.vscode` in `client/package.json` when you intentionally move the minimum editor.

## Commands

### Go (server)

From the repository root:

```bash
cd server
go test -race ./...
```

### Client unit tests (Bun)

```bash
pnpm --filter ./client test
```

### Bun sidecar runner tests

```bash
pnpm --filter ./server/lsp/bun/runner run test
```

### VS Code E2E

E2E requires a compiled extension and `out/test` harness (see `client/package.json`).

```bash
pnpm --filter ./client test:e2e:compile
pnpm --filter ./client test:e2e:run:single
pnpm --filter ./client test:e2e:run:multi
pnpm --filter ./client test:e2e:run:sidecar
```

**Smoke subset** (minimal file list; same runners, fewer suites) — for **local** fast feedback or optional jobs:

- Environment: `TELESCOPE_E2E_SMOKE=1`
- Or CLI: `node out/test/runTest.js --smoke` (and the multi/sidecar runners with `--smoke` after compile).

Scripts:

```text
pnpm --filter ./client test:e2e:run:single:smoke
pnpm --filter ./client test:e2e:run:multi:smoke
pnpm --filter ./client test:e2e:run:sidecar:smoke
```

**Modes** (`TELESCOPE_E2E_MODE`): `single` (default single-root), `multi`, `sidecar`. The smoke filter applies on top of these modes, and `client/e2e-suites.json` is the shared source of truth for both `client/src/test/suite/index.ts` and `client/.vscode-test.mjs`.

### Full E2E (local, mirrors CI)

```bash
pnpm --filter ./client test:e2e:all
```

Run this before merging large LSP or E2E changes. Optional: `VSCODE_TEST_VERSION=1.x.y` to match a specific VS Code build.

## Go coverage

CI treats **Tier A core packages** as the 95% finish-line target and tracks the whole repo separately.

Use [`coverage-targets.md`](./coverage-targets.md) for the staged Tier A / Tier B / Tier C coverage model, the live per-package baselines, and the current ratchet floors.

Coverage contract:

- `core_coverage` is the hard gate. It aggregates the Tier A packages that define Telescope's core product behavior.
- `repo_coverage` is still measured and ratcheted in CI, but it is not the finish-line definition of "done". CI derives it from the full Go `coverage.out` artifact after filtering out the helper-only `server`, `server/rules/testing`, and `server/testutil` packages.
- New LSP handler, analyzer, resolver, or CLI behavior should land with Go tests first. Expand E2E only when the risk is specifically editor host wiring, session routing, activation, or extension-only behavior.

## E2E design principles

- **Host wiring, not semantics:** E2E tests prove VS Code↔server integration works. They accept empty arrays from providers when the pipeline is slow; Go tests own semantic content.
- **Global warmup first:** use shared helpers like `ensureSingleRootWorkspaceReady()` and `ensureSidecarWorkspaceReady()` so suites reuse one canonical activation + warmup path instead of reimplementing `suiteSetup` in every file.
- **Server-backed readiness beats proxy signals:** `waitForDocumentAnalyzed()` prefers raw `documentSymbol` requests through `__telescopeTest.requestDocumentSymbols()` before falling back to code lenses, and `waitForDefinitionAvailable()` prefers raw `textDocument/definition` through `__telescopeTest.requestDefinition()` before proxying through VS Code commands.
- **Manifest-driven suite selection:** `client/e2e-suites.json` owns smoke/full file selection, workspaces, and timeouts for single-root, multi-root, and sidecar modes.
- **Smoke lists should represent core journeys:** local smoke runs should keep one strong journey for activation, classification, malformed-document non-interference, OpenAPI JSON, navigation, edits, commands, and Bun sidecar ingress rather than inheriting legacy file boundaries.
- **Multi-root stays focused:** keep one strong journey that proves folder/session routing with duplicate cross-file layouts across workspace folders; do not duplicate the full single-root provider matrix in multi-root mode.
- **Sidecar availability is explicit:** sidecar suites call `ensureSidecarWorkspaceReady({ skipSuiteIfUnavailable: this })` during `suiteSetup`. If the Bun sidecar never becomes ready, the suite is marked skipped/pending instead of passing via per-test early returns.
- **Sidecar readiness uses one server-owned contract:** sidecar setup and lifecycle checks rely on `__telescopeTest.requestSidecarInfo()` reporting `configured + available` instead of mixing health polling with a specific diagnostic witness.
- **Sidecar rule semantics mostly live below E2E:** Bun runner tests and `server/lsp/bun/*_test.go` own fragile rule details such as exact rule IDs, `PathItem` pointer/range behavior, and custom diagnostic emission. E2E keeps representative `telescope-custom` wiring journeys plus availability checks.
- **Malformed YAML/JSON stays editor-owned:** after child-LSP removal, E2E should assert non-interference from Telescope on broken documents instead of expecting Telescope to proxy generic syntax feedback.
- **Rename coverage is split intentionally:** Go tests own rename range selection and fallback behavior, while `rename.e2e.ts` waits on raw `prepareRename` readiness and then validates that VS Code receives and can apply a plausible `WorkspaceEdit`.
- **Deterministic cache path:** All test runners set an explicit `cachePath` so VS Code downloads always land in `client/.vscode-test/`, matching CI cache and artifact upload paths.
- **Optional config-driven runner:** `client/.vscode-test.mjs` provides labeled `@vscode/test-cli` configs for smoke/full single-root, multi-root, and sidecar runs without replacing the existing `runTest*.ts` entrypoints yet.

## Related docs

- [`coverage-targets.md`](./coverage-targets.md) — staged coverage targets and package baselines.
- [`testing-inventory.md`](./testing-inventory.md) — feature vs test matrix.
- [`CI.md`](./CI.md) — workflow overview if present.
