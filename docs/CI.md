# Telescope CI (GitHub Actions)

## Main extension + server CI (`ci.yml`)

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) is the **required** pipeline for this repo:

- **Go** — build, vet, tests with race detector (Ubuntu, macOS, Windows).
- **TypeScript** — client typecheck, build, Bun unit tests (Ubuntu).
- **E2E** — full VS Code extension-host runs on **Ubuntu, macOS, and Windows** for the single-root and multi-root suites. VS Code is pinned via `VSCODE_TEST_VERSION` (see [`client/src/test/vscode-test-version.ts`](../client/src/test/vscode-test-version.ts)).
- **E2E Sidecar** — a separate required job runs the Bun sidecar host-wiring suite on the same OS matrix so Bun/runtime regressions stay isolated from core extension-host failures.

Failed E2E jobs upload `~/.vscode-test` logs as artifacts when possible.

Other workflows (benchmarks, release, `telescope.yml` preview) are documented below or in workflow files.

The Go CLI can run in CI via the **same engine** that powers the LSP rule pipeline.

## This repository: live PR preview workflow

This repo includes a **live example** workflow you can copy:

- `.github/workflows/telescope.yml`

It intentionally runs Telescope against `test-files/` so that pull requests can **force deterministic warnings/errors** and preview the exact PR comment behavior.

## Recommended workflow (for spec repositories)

Create `.github/workflows/telescope.yml`:

```yaml
name: Telescope

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  issues: write
  security-events: write

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: sailpoint-oss/telescope@main
        with:
          mode: ci
          paths: .
          comment-pr: true
          report-md: telescope-report.md
          report-json: telescope-report.json
          report-sarif: telescope-report.sarif

      - name: Upload SARIF to code scanning
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: telescope-report.sarif

      - name: Upload Telescope report artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: telescope-report
          path: |
            telescope-report.md
            telescope-report.json
            telescope-report.sarif
```

## CI behavior

- **Always** writes a full markdown report (`telescope-report.md`) suitable for upload as an artifact.
- **Also** writes a machine-readable JSON report (`telescope-report.json`) for downstream tooling.
- **Optionally** writes a SARIF report (`telescope-report.sarif`) that can be uploaded to GitHub code scanning.

### Unified vs legacy ci-only mode

The composite action runs in one of two modes:

| Mode | When | Behavior |
|------|------|----------|
| **Legacy ci-only** | `mode: ci` and `report-sarif` is empty | Runs `telescope ci` once; supports `comment-pr`. |
| **Unified** | Any other mode combination, or `report-sarif` is set | Runs `lint`, `validate`, `diff`, etc. as separate steps and merges outputs into one report + optional SARIF. |

The recommended workflow above sets `report-sarif`, so it uses **unified mode**. In that mode, `comment-pr` is not supported (the action logs a warning and skips the PR comment). Use legacy ci-only mode if you need PR comments without SARIF upload.

### Exit semantics (unified mode)

The action step fails when the **aggregated report** shows problems, not merely when an individual CLI subprocess exits non-zero:

- **Lint / validation findings** — total diagnostics across `lint` and `validate` in `telescope-report.json`.
- **Breaking changes** — when `fail-on-breaking` is `true` (default).
- **Contract failures** — when `contract` mode is enabled.
- **Infrastructure errors** — when a CLI command fails and stderr or the action error log has content, even if the report counts are zero.

If lint/validate find issues, the step fails and the report reflects the counts. Spurious CLI exit codes with a clean report are treated as pass.

### Mode expansion and diff

- `mode: ci` expands to `lint`, `validate`, and `diff` when `diff-base` is set (default: `main` in [`action.yml`](../action.yml)).
- To lint and validate without breaking-change detection on large PRs, use `mode: lint,validate` and omit or clear `diff-base`.
- Explicit diff inputs: `diff-left` + `diff-right`, or `diff-base` with a single file path in `paths`.

### Legacy ci-only failure rules

In legacy ci-only mode (`telescope ci`), the step fails if:

- any **error** exists anywhere in the workspace, OR
- any **warning or error** exists in files changed by the PR.
- When enabled (`comment-pr`) on `pull_request` events, it posts a PR comment summary.

## Local dev

You can simulate PR gating locally using git refs:

```bash
telescope ci . --diff-base main --diff-head HEAD --report-md telescope-report.md
```

For local structural-only checks, use:

```bash
telescope validate . --report-json telescope-validate.json
```
