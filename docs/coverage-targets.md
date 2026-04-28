# Coverage Targets

This document defines how Telescope should measure progress toward high test coverage without conflating core product logic with CLI and infrastructure entrypoints.

## Coverage scopes

### Tier A: core product behavior

These packages represent the language-server and analysis paths that users interact with most directly and should be the first place we push toward 95%+ coverage:

- `server/lsp/...` (includes `server/lsp/projection/...`, `server/lsp/bun/...`, etc.)
- `server/lsp/adapt/...`
- `server/openapi/...`
- `server/project/...`
- `server/bridge/...`
- `server/core/graph/...`
- `server/core/classify/...`

Current package coverage snapshot:

| Package | Coverage |
|---------|----------|
| `server/lsp` | 70.7% |
| `server/lsp/adapt` | 100.0% |
| `server/lsp/observe` | 100.0% |
| `server/lsp/navadapt` | 85.7% |
| `server/lsp/bun` | 73.8% |
| `server/lsp/projection` | 95.9% |
| `server/openapi` | 82.8% |
| `server/project` | 77.7% |
| `server/bridge` | 88.7% |
| `server/core/graph` | 85.9% |
| `server/core/classify` | 81.2% |

Current Tier A aggregate baseline: `75.5%` (matches `go test` merged profile for `CORE_PKGS` in CI)

### Tier B: supporting runtime packages

These packages matter, but they are not the best first-pass signal for language-server correctness:

- `server/config/...`
- `server/contractrunner/...`
- `server/core/analyze/...`
- `server/extensions/...`
- `server/lintengine/...`
- `server/sdk/...`
- `server/spectral/...`

Current package coverage snapshot:

| Package | Coverage |
|---------|----------|
| `server/config` | 74.4% |
| `server/contractrunner` | 86.8% |
| `server/core/analyze` | 87.7% |
| `server/extensions` | 75.8% |
| `server/lintengine` | 73.0% |
| `server/sdk` | 85.0% |
| `server/spectral` | 80.1% |

### Tier C: CLI and low-level utilities

These packages usually require subprocess-style integration tests, temp directories, or golden files. They should be improved, but they should not block the first TDD alignment pass for core server logic:

- `server/cli/...`
- `server/plugin/...`
- `server/rules/...`
- `server/rules/checks/...`
- `server/core/parser/...`

Current package coverage snapshot:

| Package | Coverage |
|---------|----------|
| `server/cli` | 78.9% |
| `server/plugin` | 96.3% |
| `server/rules` | 58.1% |
| `server/rules/checks` | 100.0% |
| `server/rules/analyzers` | 86.8% |
| `server/rulesets` | 93.3% |
| `server/core/parser` | 86.2% |

Current repo-wide aggregate baseline: varies with branch; see the Go job summary per-package table from `coverage.out`.

`repo_coverage` intentionally excludes the helper-only `server`, `server/rules/testing`, and `server/testutil` packages from the aggregate while still running their tests in CI. This keeps the repo-wide ratchet focused on executable product code instead of scaffolding-only packages that otherwise pin the number near zero.

## Recommended CI reporting

Track two numbers in CI:

- `core_coverage`: the aggregate of Tier A package runs
- `repo_coverage`: the aggregate of the executable Go package set, derived from the full `coverage.out` artifact after filtering out helper-only packages `server`, `server/rules/testing`, and `server/testutil`

This gives the team a strong TDD target for the product surface while keeping full-repo visibility honest.

Current CI policy:

- Hard finish-line target: `core_coverage >= 95.0%`
- Current ratchet floor: `core_coverage >= 75.5%`
- Current repo ratchet floor: `repo_coverage >= 74.5%` (see `REPO_COVERAGE_RATCHET_MIN` in `.github/workflows/ci.yml`)

## Local tooling

From the repository root, after generating `server/coverage.out` with `go test -coverprofile=coverage.out ./...` inside `server/`:

- **Sorted per-package table:** `python3 scripts/coverage-go-packages.py server/coverage.out`
- **Fail if any package is below 95%** (skips helper roots `""` / server main, `rules/testing`, `testutil` when used with `--min-pct`):  
  `cd server && bash ../scripts/coverage-enforce-packages.sh`  
  Override minimum with `MIN_COVERAGE=90`, etc.

CI publishes the per-package table in the Go job summary and runs the strict per-package gate as a **non-blocking** step (`continue-on-error`) until the repo reaches 95% on every package.

## Ratchet policy

- Never allow Tier A coverage to decrease.
- Prefer raising coverage package-by-package instead of setting a single repo-wide cliff immediately.
- Only move the repo-wide hard gate upward after Tier A is consistently strong and Tier B/Tier C test harnesses are in place.
- Raise the ratchet floors whenever a branch meaningfully improves `core_coverage` or `repo_coverage`.
