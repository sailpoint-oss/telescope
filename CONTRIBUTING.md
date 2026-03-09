# Contributing to Telescope

Thank you for your interest in contributing to Telescope! This document provides guidelines and instructions for contributing.

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

### Getting Started

```bash
# Clone the repository
git clone https://github.com/sailpoint-oss/telescope.git
cd telescope

# Go server
cd server
go build ./...
go test -race ./... -timeout 10m

# VS Code extension
cd ..
pnpm install
pnpm build
```

**Note:** The Go server depends on the [gossip](https://github.com/LukasParke/gossip) LSP framework via a local `replace` directive in `go.mod`. You need the gossip repo cloned as a sibling directory (`../../gossip`).

### Workspace Structure

```
telescope/
├── server/                # Go language server + CLI (primary)
│   ├── cli/               # CLI subcommands (lint, ci, serve)
│   ├── config/            # Configuration loading
│   ├── lsp/               # LSP server + feature handlers
│   ├── openapi/           # Tree-sitter → typed OpenAPI model
│   ├── rules/             # Rule builder, analyzers, checks
│   ├── sdk/               # Plugin SDK for third-party authors
│   └── ...
├── client/                # VS Code extension client
├── test-files/            # Test fixtures and examples
└── docs/                  # Documentation
```

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

### Go Rules (primary)

1. Define the rule using the fluent builder API:

```go
// server/rules/analyzers/my_rule.go
package analyzers

import (
    "github.com/sailpoint-oss/telescope/server/openapi"
    "github.com/sailpoint-oss/telescope/server/rules"
)

var myRule = rules.Define("my-rule-id", rules.RuleMeta{
    Description: "Description of what the rule checks",
    Severity:    protocol.DiagnosticSeverityWarning,
    Category:    rules.CategoryNaming,
    Recommended: true,
}).Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
    // Rule logic here
    if op.Summary == "" {
        r.At(op.Loc, "%s %s is missing summary", method, path)
    }
})
```

2. Register the rule in `RegisterAll`:

```go
// server/rules/analyzers/register.go
func RegisterAll(s *gossip.Server) {
    // ...existing rules...
    registerRule(s, myRule)
}
```

3. Add tests using the test harness:

```go
// server/rules/analyzers/my_rule_test.go
func TestMyRule(t *testing.T) {
    _, analyzer := myRule.Build()

    rulestest.Run(t, analyzer,
        rulestest.Case{
            Name: "catches missing summary",
            Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers`,
            Expect: []rulestest.Diag{
                {Line: 7, Code: "my-rule-id", Severity: rulestest.Warn},
            },
        },
    )
}
```

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

### Review Criteria

- Code follows project style guidelines
- Tests are included and passing
- Documentation is updated
- No breaking changes without discussion

## Questions?

- Open a [GitHub Discussion](https://github.com/sailpoint-oss/telescope/discussions) for questions
- Check existing [Issues](https://github.com/sailpoint-oss/telescope/issues) for known problems

Thank you for contributing to Telescope!
