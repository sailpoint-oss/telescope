# Documentation Index

All Telescope documentation lives in this repository as Markdown. Use this index to find the right doc for your role.

**New maintainers:** start with [MAINTAINER-GUIDE.md](MAINTAINER-GUIDE.md).

## Users

Documentation for people using Telescope in their projects (extension, CLI, or GitHub Action).

| Document | Purpose | When to read |
|----------|---------|--------------|
| [../README.md](../README.md) | Product overview, quick start, CLI, architecture summary | First visit |
| [CONFIGURATION-V2.md](CONFIGURATION-V2.md) | Canonical `.telescope/config.yaml` (configVersion 2) | Setting up a project |
| [CONFIGURATION.md](CONFIGURATION.md) | Legacy `.telescope.yaml` compatibility | Migrating or debugging old config |
| [RULES.md](RULES.md) | Built-in rule catalog (84 rules, rulesets) | Understanding diagnostics |
| [LSP-FEATURES.md](LSP-FEATURES.md) | Complete LSP feature reference | Editor behavior questions |
| [CUSTOM-RULES.md](CUSTOM-RULES.md) | YAML, Spectral, and Bun custom rules | Adding project-specific rules |
| [GENERATION.md](GENERATION.md) | Cartographer-backed generation loop | Source-to-OpenAPI generation |
| [SDK.md](SDK.md) | Go embed API (`Workspace`) | Programmatic linting |
| [CI.md](CI.md) | GitHub Actions usage for consumers | CI integration |
| [examples/telescope-report.example.md](examples/telescope-report.example.md) | Sample CI markdown report | Customizing CI output |
| [../server/README.md](../server/README.md) | CLI install, schema extensibility, rule testing harness | Standalone server usage |
| [../client/README.md](../client/README.md) | Extension install, settings, troubleshooting | VS Code extension usage |

## Contributors

Documentation for people submitting code or rules to this repository.

| Document | Purpose | When to read |
|----------|---------|--------------|
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Dev setup, code style, testing, PR process | Before your first PR |
| [testing.md](testing.md) | Test pyramid, CI commands, coverage policy | Adding or fixing tests |
| [testing-inventory.md](testing-inventory.md) | Feature ↔ test suite matrix | Finding existing test coverage |
| [coverage-targets.md](coverage-targets.md) | Tier A/B coverage goals and ratchets | Coverage-related CI failures |
| [../test-files/README.md](../test-files/README.md) | E2E fixture layout and ownership | Adding fixtures |
| [CUSTOM-RULES.md](CUSTOM-RULES.md) | Custom rule formats (for user docs, also relevant to sidecar work) | Bun sidecar changes |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Unified system architecture | Understanding server/client flow |
| [CODEBASE-BREAKDOWN.md](CODEBASE-BREAKDOWN.md) | File-level map by functional domain | Navigating unfamiliar code |

## Maintainers

Documentation for people responsible for ongoing repository ownership.

| Document | Purpose | When to read |
|----------|---------|--------------|
| [MAINTAINER-GUIDE.md](MAINTAINER-GUIDE.md) | **Primary handover hub** — setup, subsystem map, common tasks | Day 1 and ongoing |
| [TOOLCHAIN.md](TOOLCHAIN.md) | Six-repo coordination, dependency bumps | Navigator/Barrelman updates |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Unified system architecture | Structural changes |
| [REPO-BOUNDARIES.md](REPO-BOUNDARIES.md) | What Telescope owns vs must not own | Scope decisions |
| [TECH-DEBT.md](TECH-DEBT.md) | Tracked backlog from LSP review and V2 migration | Planning work |
| [LSP-BUG-REVIEW.md](LSP-BUG-REVIEW.md) | Detailed LSP handler bug analysis | Debugging LSP issues |
| [PUBLISHING.md](PUBLISHING.md) | Release workflows, secrets, manual VSIX | Cutting releases |
| [CI.md](CI.md) | This repo's CI workflows | CI failures or workflow changes |
| [LSP-TRACE-RUNBOOK.md](LSP-TRACE-RUNBOOK.md) | Extension-host debug/trace capture | Reproducing LSP bugs |
| [LSP-TRACE-TIMELINE.md](LSP-TRACE-TIMELINE.md) | Merge trace logs into JSONL | Post-capture analysis |
| [../scripts/README.md](../scripts/README.md) | CI and dev script reference | Script usage |
| [../.github/leak-guard/README.md](../.github/leak-guard/README.md) | Secret leak scanner | Leak-guard failures |
| [../CHANGELOG.md](../CHANGELOG.md) | Release history | Noting user-visible changes |
| [../SECURITY.md](../SECURITY.md) | Vulnerability reporting | Security issues |
| [../AGENTS.md](../AGENTS.md) | Canonical agent/CI context | AI-assisted development |

## Reference material

| Document | Purpose |
|----------|---------|
| [../specifications/](../specifications/) | Vendored OpenAPI specification markdown (2.0 – 3.2) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Unified system architecture |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | Pointer to docs architecture docs |

See [MAINTAINER-GUIDE.md § Architecture reading order](MAINTAINER-GUIDE.md#architecture-reading-order).
