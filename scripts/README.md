# Scripts

Utility scripts for CI, local development, and debugging. TypeScript build scripts live under `client/scripts/`.

## Root scripts (`scripts/`)

### `run-action.sh`

Runs the composite GitHub Action locally against the current checkout. Used to reproduce CI action behavior without pushing to GitHub.

```bash
./scripts/run-action.sh
```

See [docs/CI.md](../docs/CI.md) for action inputs and modes.

### `coverage-enforce-packages.sh`

Enforces per-package coverage ratchet floors in CI. Called from `.github/workflows/ci.yml` when Go tests complete.

Fails the build if any tracked package regresses below its floor.

### `coverage-go-packages.py`

Computes Go coverage for Tier A core packages and whole-repo aggregates. Feeds `coverage-enforce-packages.sh` and CI summary output.

See [docs/coverage-targets.md](../docs/coverage-targets.md) for tier definitions and finish-line targets.

### `install-leak-guard-hooks.sh`

Installs the pre-push git hook that runs the leak-guard scanner before push.

```bash
./scripts/install-leak-guard-hooks.sh
```

See [.github/leak-guard/README.md](../.github/leak-guard/README.md) for scanner details and false-positive handling.

### `merge-trace-logs.mjs`

Merges extension-host and language-server trace logs into a single sortable JSONL file for LSP debugging.

```bash
node scripts/merge-trace-logs.mjs <extension-log> <server-log> > timeline.jsonl
```

See [docs/LSP-TRACE-TIMELINE.md](../docs/LSP-TRACE-TIMELINE.md) for the full workflow. Capture logs using [docs/LSP-TRACE-RUNBOOK.md](../docs/LSP-TRACE-RUNBOOK.md).

## Client scripts (`client/scripts/`)

### `build.ts`

esbuild entry for the VS Code extension. Invoked via `pnpm --filter ./client run build`.

### `package.ts`

Packages platform-specific and universal VSIX artifacts. Used by release workflow and local `pnpm run package`.

### `prepare-sidecar.ts`

Copies the bundled Bun runner into `client/sidecar/` after `server/lsp/bun/runner/build.sh` runs.

Invoked via `pnpm run build:sidecar` from the repo root.

## Related

- [docs/CI.md](../docs/CI.md) — CI workflow overview
- [docs/MAINTAINER-GUIDE.md](../docs/MAINTAINER-GUIDE.md) — maintainer onboarding
