# Telescope CI (GitHub Actions)

This repo’s lint engine can run in CI via the **same CLI** that powers the LSP rule pipeline.

## This repository: live PR preview workflow

This repo includes a **live example** workflow you can copy:

- `.github/workflows/telescope.yml`

It intentionally runs Telescope against `packages/test-files/` so that pull requests can **force deterministic warnings/errors** and preview the exact PR comment + inline review behavior.

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

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install Telescope CLI
        run: npm i --no-save telescope-server

      - name: Run Telescope (CI)
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx telescope ci --workspace . --comment-pr --comment-review --report-md telescope-report.md

      - name: Upload Telescope report artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: telescope-report
          path: telescope-report.md
```

## CI behavior

- **Always** writes a full markdown report (`telescope-report.md`) suitable for upload as an artifact.
- **Fails** the job if:
  - any **error** exists anywhere in the workspace, OR
  - any **warning or error** exists in files changed by the PR.
- When enabled (`--comment-pr`, `--comment-review`) on `pull_request` events, it posts:
  - a normal PR comment summary, and
  - inline review comments for diagnostics that land on **changed lines** in the PR diff.

## Local dev

You can simulate PR gating locally using git refs:

```bash
telescope ci --workspace . --diff-base main --diff-head HEAD --report-md telescope-report.md
```


