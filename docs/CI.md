# Telescope CI (GitHub Actions)

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

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-go@v5
        with:
          go-version: "1.25"

      - name: Install Telescope
        run: go install github.com/sailpoint-oss/telescope/server@latest

      - name: Run Telescope (CI)
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: telescope ci . --comment-pr --report-md telescope-report.md

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
- When enabled (`--comment-pr`) on `pull_request` events, it posts a PR comment summary.

## Local dev

You can simulate PR gating locally using git refs:

```bash
telescope ci . --diff-base main --diff-head HEAD --report-md telescope-report.md
```
