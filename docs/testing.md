# Testing Telescope

This repo uses a **test pyramid**: most behavior is proven in **Go** (language server) and **Bun** (pure TypeScript); **VS Code E2E** validates wiring among the extension, bundled server binary, and editor host.

## Where to add tests

| Change | Add tests in |
|--------|----------------|
| New or changed **LSP behavior** (diagnostics, completion, rename, format, etc.) | `server/lsp/` — prefer `handler_test.go` and `integration_test.go` first. |
| **Sidecar / custom rules / Bun runner** | `server/lsp/bun/` and related integration tests. |
| **Editor-only** behavior (language IDs, workspace scanning, session wiring) | Bun tests under `client/test/` when logic is pure; otherwise E2E. |
| **End-to-end** | Keep **smoke / wiring** coverage: activation, client↔server, one journey per major area. Do not duplicate everything Go already asserts. |

Full mapping of features, Go tests, and E2E cases (including A/B/C tags) lives in [`testing-inventory.md`](./testing-inventory.md).

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

### VS Code E2E

E2E requires a compiled extension and `out/test` harness (see `client/package.json`).

```bash
pnpm --filter ./client test:e2e:compile
pnpm --filter ./client test:e2e:run:single
pnpm --filter ./client test:e2e:run:multi
pnpm --filter ./client test:e2e:run:sidecar
```

**Smoke subset** (minimal file list; same runners, fewer suites):

- Environment: `TELESCOPE_E2E_SMOKE=1` (CI sets this on **pull requests**).
- Or CLI: `node out/test/runTest.js --smoke` (and the multi/sidecar runners with `--smoke` after compile).

Scripts:

```text
pnpm --filter ./client test:e2e:run:single:smoke
pnpm --filter ./client test:e2e:run:multi:smoke
pnpm --filter ./client test:e2e:run:sidecar:smoke
```

**Modes** (`TELESCOPE_E2E_MODE`): `single` (default single-root), `multi`, `sidecar`. The smoke filter applies on top of these modes (see `client/src/test/suite/index.ts`).

### Full E2E (local)

```bash
pnpm --filter ./client test:e2e:all
```

**Pushes to `main`** run the full E2E matrix in CI (no smoke). **Pull requests** run the smoke subset to keep feedback fast; run `test:e2e:all` locally before merging large LSP or E2E changes.

## Related docs

- [`testing-inventory.md`](./testing-inventory.md) — feature vs test matrix.
- [`CI.md`](./CI.md) — workflow overview if present.
