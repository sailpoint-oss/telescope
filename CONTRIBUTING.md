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

- **Bun** (v1.0+): Runtime and test runner - [Install Bun](https://bun.sh/docs/installation)
- **pnpm** (v8+): Package manager - [Install pnpm](https://pnpm.io/installation)
- **VS Code**: Recommended for extension development

### Getting Started

```bash
# Clone the repository
git clone https://github.com/sailpoint-oss/telescope.git
cd telescope

# Install dependencies
pnpm install

# Run tests to verify setup
bun test

# Build all packages
pnpm build
```

### Workspace Structure

```
telescope/
├── packages/
│   ├── telescope-client/    # VS Code extension client
│   ├── telescope-server/    # Language server + linting engine
│   └── test-files/         # Test fixtures and custom rule examples
└── docs/                   # Documentation
```

### Development Workflow

1. **Run the extension locally:**

   - Open the repository in VS Code
   - Press F5 to launch the Extension Development Host
   - Open an OpenAPI file to see Telescope in action

2. **Watch for changes:**

   ```bash
   pnpm --filter telescope-client build --watch
   ```

3. **Run specific package tests:**
   ```bash
   bun test packages/telescope-server
   ```

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting.

### Style Rules

- **Indentation**: Tabs
- **Quotes**: Double quotes for strings
- **Semicolons**: Required
- **Imports**: Automatically organized

### Commands

```bash
# Check for issues
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix

# Format code
pnpm format
```

### Editor Setup

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

### Built-in OpenAPI Rules

1. Create a new file in `packages/telescope-server/src/engine/rules/generic/<category>/`:

```typescript
// packages/telescope-server/src/engine/rules/generic/operations/my-rule.ts
import { defineRule } from "../../api";

export const myRule = defineRule({
  meta: {
    id: "my-rule-id",
    number: 999, // Unique rule number
    description: "Description of what the rule checks",
    type: "problem", // or "suggestion"
    fileFormats: ["yaml", "yml", "json"],
  },
  check(ctx) {
    return {
      Operation(op) {
        // Rule logic here
        if (/* violation detected */) {
          const range = ctx.locate(op.uri, op.pointer);
          if (range) {
            ctx.report({
              message: "Violation message",
              severity: "error", // or "warning", "info"
              uri: op.uri,
              range,
            });
          }
        }
      },
    };
  },
});
```

2. Export from the category index:

```typescript
// packages/telescope-server/src/engine/rules/generic/operations/index.ts
export { myRule } from "./my-rule";
```

3. Add a test file:

```typescript
// packages/telescope-server/src/engine/rules/generic/operations/my-rule.test.ts
import { describe, expect, it } from "bun:test";
import { myRule } from "./my-rule";
import { createRuleTestContext } from "../../test-utils";

describe("my-rule", () => {
  it("should report violation when...", async () => {
    const ctx = await createRuleTestContext(`
openapi: 3.0.0
# ... test fixture
    `);

    const results = myRule.check(ctx);
    expect(results).toHaveLength(1);
  });
});
```

4. Update `RULES.md` with the new rule documentation.

### SailPoint-Specific Rules

Follow the same pattern but place files in `packages/telescope-server/src/engine/rules/sailpoint/`.

## Testing

### Running Tests

```bash
# Run all tests
bun test

# Run tests for a specific package
bun test packages/telescope-server

# Run a specific test file
bun test packages/telescope-server/src/engine/rules/generic/operations/my-rule.test.ts

# Run tests with coverage
bun test --coverage
```

### Test Fixtures

Add test fixtures to `packages/test-files/openapi/` for integration testing:

- `test-*.yaml` - Focused test cases for specific rules
- `api-*.yaml` - Comprehensive API examples

### Writing Tests

- Each rule should have a corresponding `.test.ts` file
- Test both positive cases (no violations) and negative cases (violations expected)
- Use descriptive test names that explain the scenario

## Pull Request Process

1. **Create a feature branch** from `main`

2. **Make your changes** following the guidelines above

3. **Ensure all tests pass:**

   ```bash
   bun test
   ```

4. **Run linting:**

   ```bash
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
