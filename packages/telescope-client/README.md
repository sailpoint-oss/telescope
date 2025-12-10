# Telescope - OpenAPI Language Server

A powerful VS Code extension for OpenAPI specifications with real-time validation, intelligent code navigation, and extensive customization options.

## Features

### Validation & Diagnostics

- **Real-time Diagnostics** — See linting issues as you type
- **52 Built-in Rules** — OpenAPI best practices and optional SailPoint enterprise standards
- **Multi-file Support** — Full `$ref` resolution across your API project
- **Custom Rules** — Extend with TypeScript rules and TypeBox schemas

### Code Intelligence

- **Go to Definition** — Navigate to `$ref` targets, operationId definitions, security schemes
- **Find All References** — Find all usages of schemas, components, and operationIds
- **Hover Information** — Preview referenced content inline
- **Completions** — Smart suggestions for `$ref` values, status codes, media types, tags
- **Rename Symbol** — Safely rename operationIds and components across your workspace
- **Call Hierarchy** — Visualize component reference relationships

### Editor Features

- **Code Lens** — Reference counts, response summaries, security indicators
- **Inlay Hints** — Type hints for `$ref` targets, required property markers
- **Semantic Highlighting** — Enhanced syntax highlighting for OpenAPI elements
- **Quick Fixes** — Auto-add descriptions, summaries, operationIds; convert to kebab-case
- **Document Links** — Clickable `$ref` links with precise navigation

### Syntax Highlighting

- Full syntax highlighting for OpenAPI YAML and JSON
- Embedded code block highlighting for 21+ languages in descriptions (TypeScript, Python, Go, Java, and more)
- Path parameter highlighting in URL templates

### Format Conversion

- Convert between JSON and YAML with a single command
- Available from the editor context menu and command palette

## Getting Started

### Installation

Search for **"Telescope"** in the VS Code marketplace, or install from the command line:

```bash
code --install-extension sailpoint.telescope
```

### Automatic Detection

The extension automatically detects OpenAPI documents based on:

1. File contains `openapi:` or `swagger:` root key
2. File matches patterns configured in `.telescope/config.yaml`

Once detected, files receive the OpenAPI language mode with full language server features.

## Configuration

Create `.telescope/config.yaml` in your workspace root to customize behavior:

```yaml
openapi:
  # Glob patterns for OpenAPI files
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/*.json"
    - "!**/node_modules/**"
    - "!**/dist/**"

  # Enable SailPoint enterprise rules (adds 22 additional rules)
  sailpoint: false

  # Override rule severities
  rulesOverrides:
    operation-summary: warn
    parameter-description: error
    ascii-only: off

  # Register custom rules
  rules:
    - rule: my-custom-rule.ts
```

### Configuration Options

| Option                   | Description                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| `openapi.patterns`       | Glob patterns to match OpenAPI files. Use `!` prefix for exclusions.  |
| `openapi.sailpoint`      | Enable SailPoint-specific rules (`true`/`false`). Default: `false`    |
| `openapi.rulesOverrides` | Override severity for built-in rules (`error`, `warn`, `info`, `off`) |
| `openapi.rules`          | Register custom TypeScript rules from `.telescope/rules/`             |
| `additionalValidation`   | Configure validation for non-OpenAPI files                            |

### Default Patterns

When no configuration exists, the extension matches:

```yaml
patterns:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"
  - "**/*.jsonc"
```

### Configuration Reload

Configuration automatically reloads when:

- `.telescope/config.yaml` is modified
- Workspace folders change
- VS Code window regains focus

## Commands

Available via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                                     | Description                                |
| ------------------------------------------- | ------------------------------------------ |
| `OpenAPI: Classify Current Document`        | Manually classify document as OpenAPI      |
| `Telescope: Convert JSON to YAML (Replace)` | Convert JSON file to YAML, delete original |
| `Telescope: Convert JSON to YAML (Copy)`    | Convert JSON file to YAML, keep original   |
| `Telescope: Convert YAML to JSON (Replace)` | Convert YAML file to JSON, delete original |
| `Telescope: Convert YAML to JSON (Copy)`    | Convert YAML file to JSON, keep original   |

Conversion commands are also available in the editor and file explorer context menus.

## Built-in Rules

### OpenAPI Best Practice Rules (30 rules)

| Category          | Examples                                                              |
| ----------------- | --------------------------------------------------------------------- |
| **References**    | Unresolved `$ref` detection                                           |
| **Naming**        | Unique operationIds, schema naming conventions, tag formatting        |
| **Documentation** | HTML in descriptions, deprecation explanations, enum descriptions     |
| **Structure**     | allOf composition, array items, discriminator mappings                |
| **Security**      | Security scheme definitions, API key placement, OAuth URLs            |
| **Paths**         | Parameter matching, trailing slashes, kebab-case, HTTP verbs in paths |
| **Types**         | String maxLength hints, format validation                             |
| **Servers**       | Server definitions, HTTPS requirements                                |

### SailPoint Enterprise Rules (22 rules)

Enable with `openapi.sailpoint: true`. These enforce stricter requirements:

| Category       | Examples                                                            |
| -------------- | ------------------------------------------------------------------- |
| **Operations** | Required descriptions, summaries, tags, error responses, pagination |
| **Parameters** | Required descriptions, examples, explicit required flag             |
| **Schemas**    | Required descriptions, examples, required arrays                    |
| **Types**      | Numeric format requirements, boolean defaults                       |
| **Root**       | SailPoint extensions, alphabetically sorted tags                    |

### Overriding Rule Severity

```yaml
openapi:
  rulesOverrides:
    # Disable a rule
    string-max-length: off

    # Reduce to warning
    path-kebab-case: warn

    # Increase to error
    security-schemes-defined: error
```

## Custom Rules

Create custom validation rules in `.telescope/rules/`:

```typescript
// .telescope/rules/require-contact.ts
import { defineRule } from "telescope-server";

export default defineRule({
  meta: {
    id: "require-contact",
    number: 1000,
    description: "API must include contact information",
    type: "problem",
    fileFormats: ["yaml", "yml", "json"],
  },
  check(ctx) {
    return {
      Info(info) {
        if (!info.hasContact()) {
          ctx.reportAt(info, "contact", {
            message: "Info section must include contact details",
            severity: "error",
          });
        }
      },
    };
  },
});
```

Register in config:

```yaml
openapi:
  rules:
    - rule: require-contact.ts
```

For full documentation on custom rules, see the [Custom Rules Guide](https://github.com/sailpoint-oss/telescope/blob/main/docs/CUSTOM-RULES.md).

## Extension Settings

| Setting                           | Description                                                    | Default |
| --------------------------------- | -------------------------------------------------------------- | ------- |
| `telescope.autoConvertJsonToYaml` | Automatically convert JSON OpenAPI files to YAML when detected | `false` |

## Troubleshooting

### Extension Not Activating

1. Check the **Telescope Language Server** output channel for errors
2. Verify the file is recognized as YAML or JSON
3. Ensure VS Code is up to date (requires 1.99.3+)
4. Try restarting VS Code

### No Diagnostics Appearing

1. Check the document parses as valid YAML/JSON
2. Verify the file matches your `patterns` in `.telescope/config.yaml`
3. Ensure the file contains an `openapi:` or `swagger:` root key
4. Check the output channel for classification messages

### Configuration Not Loading

1. Verify file location: `.telescope/config.yaml` in workspace root
2. Check YAML syntax is valid
3. Look for errors in the output channel

### Slow Performance

Add exclusion patterns for large directories:

```yaml
openapi:
  patterns:
    - "**/*.yaml"
    - "!**/node_modules/**"
    - "!**/dist/**"
    - "!**/.git/**"
```

## Links

- [GitHub Repository](https://github.com/sailpoint-oss/telescope)
- [Issue Tracker](https://github.com/sailpoint-oss/telescope/issues)
- [Configuration Reference](https://github.com/sailpoint-oss/telescope/blob/main/docs/CONFIGURATION.md)
- [LSP Features Reference](https://github.com/sailpoint-oss/telescope/blob/main/docs/LSP-FEATURES.md)
- [Custom Rules Guide](https://github.com/sailpoint-oss/telescope/blob/main/docs/CUSTOM-RULES.md)
- [Built-in Rules Reference](https://github.com/sailpoint-oss/telescope/blob/main/packages/telescope-server/src/engine/rules/RULES.md)

## License

[MIT](https://github.com/sailpoint-oss/telescope/blob/main/LICENSE) - Copyright (c) 2024 SailPoint Technologies
