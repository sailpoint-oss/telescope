# Contributing to Telescope

Thank you for your interest in contributing to Telescope! This document provides guidelines and instructions for contributing.

## Maintainers

If you are taking over repository ownership, start with [docs/MAINTAINER-GUIDE.md](docs/MAINTAINER-GUIDE.md). The full documentation index is at [docs/README.md](docs/README.md).

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Making Changes](#making-changes)
- [Adding New Rules](#adding-new-rules)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- **Go** (1.25+): Server development - [Install Go](https://go.dev/doc/install)
- **Bun** (v1.0+): TypeScript runtime and test runner - [Install Bun](https://bun.sh/docs/installation)
- **pnpm** (v8+): TypeScript package manager - [Install pnpm](https://pnpm.io/installation)
- **VS Code**: Recommended for extension development
- **gossip** (optional): Only needed when developing against a local gossip checkout. Normal builds use the pinned module version from the Go proxy.

### Getting Started

```bash
# Clone the repository
git clone https://github.com/sailpoint-oss/telescope.git
cd telescope

# Optional: local gossip development (sibling of telescope/, not inside it)
# git clone https://github.com/LukasParke/gossip.git ../gossip
# cp go.work.example go.work   # gitignored; enables replace => ../gossip

# Go server
cd server
go build ./...
go test -race ./... -timeout 10m

# VS Code extension
cd ..
pnpm install
pnpm build
```

### Workspace Structure

```
telescope/
├── server/                # Go language server + CLI (primary)
│   ├── cli/               # CLI subcommands (lint, ci, serve)
│   ├── config/            # Configuration loading
│   ├── core/              # Workspace graph, parser, types
│   ├── bridge/            # Barrelman → gossip diagnostic adapter
│   ├── generation/        # Cartographer extraction wrapper
│   ├── lsp/               # LSP server + feature handlers
│   ├── lintengine/        # Batch lint for CLI
│   ├── openapi/           # Navigator compatibility layer
│   ├── rules/             # Rule builder, analyzers, checks
│   ├── sdk/               # Programmatic Workspace API
│   └── ...
├── client/                # VS Code extension client
├── test-files/            # Test fixtures and examples
└── docs/                  # Documentation
```

System architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### Development Workflow

1. **Run the extension locally:**

   - Open the repository in VS Code
   - Press F5 to launch the Extension Development Host
   - Open an OpenAPI file to see Telescope in action

2. **Run Go server tests:**

   ```bash
   cd server && go test ./...
   ```

## Code Style

### Go

- Standard `go fmt` and `go vet`
- Run `go vet ./...` before submitting

### TypeScript

We use [Biome](https://biomejs.dev/) for linting and formatting.

- **Indentation**: Tabs
- **Quotes**: Double quotes for strings
- **Semicolons**: Required
- **Imports**: Automatically organized

```bash
# Check for issues
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix

# Format code
pnpm format
```

Install the [Biome VS Code extension](https://marketplace.visualstudio.com/items?itemName=biomejs.biome) for real-time feedback.

## Making Changes

### Commit Messages

Follow conventional commit format:

```
type(scope): description

[optional body]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**

```
feat(rules): add operation-summary-length rule
fix(server): resolve $ref cycle detection issue
docs: update configuration guide
```

### Branch Naming

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates

## Adding New Rules

### Upstream in Barrelman (preferred)

Generic OAS, OWASP, naming, and structural rules belong in [barrelman](https://github.com/sailpoint-oss/barrelman). After the upstream change lands, bump `server/go.mod` and run the full test suite. See [docs/TOOLCHAIN.md](docs/TOOLCHAIN.md).

### Telescope-native generic rules (rare)

For vendor-neutral rules that must ship in this repository, implement a `barrelman.Rule` in `server/rules/analyzers/` and register it in `telescopeGenericRules()` inside [server/rules/analyzers/register.go](server/rules/analyzers/register.go). See `example_matches_format.go` and `native_spectral.go` for patterns.

Do not add organisation-specific or branded rules here; downstream consumers register those via `barrelman.RegisterPlugin`.

### User-defined rules (no Telescope code change)

Project-specific rules use YAML, Spectral rulesets, or the Bun sidecar. See [docs/CUSTOM-RULES.md](docs/CUSTOM-RULES.md).

### Testing rules

Use `rules/testing` (`rulestest.Run`) for exact diagnostic assertions. See [server/README.md](server/README.md) § Testing Rules for examples.

## Testing

### Running Tests

```bash
# Go tests (from server/)
cd server
go test -race ./... -timeout 10m       # All tests with race detection
go test ./lsp                           # Specific package
go test ./rules/analyzers -run TestName # Single test
go test -bench=. ./openapi              # Benchmarks

# E2E tests (from repo root)
pnpm --filter ./client test:e2e:compile
pnpm --filter ./client test:e2e:run:single
pnpm --filter ./client test:e2e:run:multi
pnpm --filter ./client test:e2e:run:sidecar
```

### Test Fixtures

- Canonical shared OpenAPI fixtures: `server/testutil/specs/`
- Sidecar E2E workspace fixtures: `test-files/`
- Fixture ownership + lifecycle map: `test-files/fixture-manifest.yaml`

If a fixture is mirrored between `server/testutil/specs/` and
`test-files/openapi/`, keep it byte-identical and run:

```bash
cd server
go test ./testutil/specs -run TestMirroredFixturesStayInSync
```

When adding or changing fixtures:

- assign an owner (`sidecar-e2e`, `server-go-tests`, `ci-smoke-only`)
- document expected diagnostics in tests (code/severity intent)
- update `test-files/fixture-manifest.yaml`
- avoid introducing fixture files with no explicit test ownership

### Writing Tests

- Go rules: Use the `rulestest` package with exact diagnostic assertions (`Line`, `Col`, `Code`, `Severity`, `Message`)
- Test both positive cases (no violations) and negative cases (violations expected)
- Use descriptive test names that explain the scenario

## Pull Request Process

1. **Create a feature branch** from `main`

2. **Make your changes** following the guidelines above

3. **Ensure all tests pass:**

   ```bash
   cd server && go test -race ./... -timeout 10m
   ```

4. **Run linting:**

   ```bash
   cd server && go vet ./...
   pnpm lint
   ```

5. **Update documentation** if needed

6. **Submit a pull request** with:

   - Clear description of changes
   - Link to any related issues
   - Screenshots for UI changes

7. **Address review feedback** promptly

## Release Workflows

- **Extension release**: `.github/workflows/release.yml`
  - Publishes VSIX artifacts to VS Code Marketplace and OpenVSX.
  - Creates a GitHub Release at tag `extension/v*` with all VSIX files attached for manual download.
  - Triggers on `main` changes affecting release surfaces (`client/**`, `server/**`, workspace lock/config files).
  - Supports skip marker in commit message: `[skip publish]`.
- **Go module release**: `.github/workflows/release-go.yml`
  - Runs CI-equivalent server checks (including Bun runner build) before tagging `server/v*`.
  - Publishes a GitHub release for the `github.com/sailpoint-oss/telescope/server` module tag.
- **TS SDK release**: `.github/workflows/release-sdk.yml`
  - Publishes `@sailpoint-oss/telescope` to npm and creates `sdk/v*` GitHub releases.
  - Triggers on `main` when `server/lsp/bun/telescope-server/**` changes.
  - Skips publish if the same version already exists on npm.

### Required GitHub Secrets

- `VSCE_PAT`: VS Code Marketplace publishing token.
- `OPEN_VSX_TOKEN`: OpenVSX publishing token.
- `NPM_TOKEN`: npm token for publishing `@sailpoint-oss/telescope`.

Keep secrets scoped to repository-level release maintainers and rotate them periodically.

### Review Criteria

- Code follows project style guidelines
- Tests are included and passing
- Documentation is updated
- No breaking changes without discussion

## Questions?

- Open a [GitHub Discussion](https://github.com/sailpoint-oss/telescope/discussions) for questions
- Check existing [Issues](https://github.com/sailpoint-oss/telescope/issues) for known problems

Thank you for contributing to Telescope!
