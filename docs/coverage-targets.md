# Coverage Targets

This document defines how Telescope should measure progress toward high test coverage without conflating core product logic with CLI and infrastructure entrypoints.

## Coverage scopes

### Tier A: core product behavior

These packages represent the language-server and analysis paths that users interact with most directly and should be the first place we push toward 90%+ coverage:

- `server/lsp/...`
- `server/lsp/adapt/...`
- `server/openapi/...`
- `server/project/...`
- `server/bridge/...`
- `server/core/graph/...`
- `server/core/classify/...`

Current package coverage snapshot:

| Package | Coverage |
|---------|----------|
| `server/lsp` | 58.4% |
| `server/lsp/adapt` | 100.0% |
| `server/openapi` | 48.1% |
| `server/project` | 67.8% |
| `server/bridge` | 81.4% |
| `server/core/graph` | 77.7% |
| `server/core/classify` | 76.2% |

Current Tier A aggregate baseline: `59.4%`

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
| `server/config` | 70.4% |
| `server/contractrunner` | 63.2% |
| `server/core/analyze` | 53.1% |
| `server/extensions` | 59.9% |
| `server/lintengine` | 62.5% |
| `server/sdk` | 61.7% |
| `server/spectral` | 61.6% |

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
| `server/cli` | 43.8% |
| `server/plugin` | 14.8% |
| `server/rules` | 4.7% |
| `server/rules/checks` | 20.8% |
| `server/core/parser` | 20.5% |

Current repo-wide aggregate baseline: `56.9%`

## Recommended CI reporting

Track two numbers in CI:

- `core_coverage`: the aggregate of Tier A package runs
- `repo_coverage`: the aggregate of `go test -cover ./...`

This gives the team a strong TDD target for the product surface while keeping full-repo visibility honest.

Current CI policy:

- Hard finish-line target: `core_coverage >= 90.0%`
- Current ratchet floor: `core_coverage >= 59.4%`
- Current repo ratchet floor: `repo_coverage >= 56.9%`

## Ratchet policy

- Never allow Tier A coverage to decrease.
- Prefer raising coverage package-by-package instead of setting a single repo-wide cliff immediately.
- Only move the repo-wide hard gate upward after Tier A is consistently strong and Tier B/Tier C test harnesses are in place.
- Raise the ratchet floors whenever a branch meaningfully improves `core_coverage` or `repo_coverage`.
