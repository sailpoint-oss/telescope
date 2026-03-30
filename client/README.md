# Telescope - OpenAPI Language Server

A powerful VS Code extension for OpenAPI specifications with real-time validation, intelligent code navigation, and extensive customization options.

## Features

### Validation & Diagnostics

- **Real-time Diagnostics** — See linting issues as you type
- **88 Built-in Rules** — OpenAPI best practices, security, and OWASP coverage
- **Multi-file Support** — Full `$ref` resolution across your API project
- **Custom Rules** — YAML in config, Spectral-compatible YAML rulesets, and optional Bun-backed JS/TS rules

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

Telescope is published with different extension IDs depending on the store:

| Store | Extension ID | Install command |
| ----- | ------------ | --------------- |
| VS Code Marketplace | `SailPointTechnologies.telescope-openapi` | `code --install-extension SailPointTechnologies.telescope-openapi` |
| Open VSX / Cursor / VSCodium | `sailpoint.telescope` | `code --install-extension sailpoint.telescope` |

Platform-specific VSIXs that bundle the Telescope server are currently published for `darwin-arm64`, `darwin-x64`, `linux-x64`, and `win32-x64`.

The universal VSIX works on other platforms too, but it does not bundle the `telescope` binary. On those installs, provide the server with `telescope.serverPath`, `TELESCOPE_SERVER_PATH`, or `PATH`.

### Automatic Detection

The extension automatically detects OpenAPI documents based on:

1. File contains `openapi:` or `swagger:` root key
2. File matches patterns configured in a supported Telescope config file

Once detected, Telescope treats the file as OpenAPI for language server features. When you open a detected file, Telescope applies the custom OpenAPI language mode (`openapi-yaml` / `openapi-json`) for correct tokenization and grammars.

## Configuration

Create `.telescope.yaml` in your workspace root to customize behavior. The extension also supports `.telescope.yml`, `.telescope/config.yaml`, and `.telescope/config.yml` with the same precedence as the server and CLI:

```yaml
extends: telescope:recommended

rules:
  operation-summary: warn
  parameter-description: error
  ascii-only: off

include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"

exclude:
  - "node_modules/**"
  - "dist/**"

spectralRulesets:
  - ./rulesets/custom.yaml
```

### Configuration Options

| Option    | Description                                                           |
| --------- | --------------------------------------------------------------------- |
| `extends` | Base ruleset (`telescope:recommended`, `telescope:all`, `telescope:owasp`, `telescope:strict`) |
| `rules`   | Override severity for built-in rules (`error`, `warn`, `info`, `off`) |
| `include` | Glob patterns to match OpenAPI files                                  |
| `exclude` | Glob patterns to exclude                                              |
| `spectralRulesets` | Spectral-compatible YAML ruleset paths                                |

### Default Patterns

When no configuration exists, the extension matches:

```yaml
include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"
  - "**/*.jsonc"
```

### Configuration Reload

Configuration automatically reloads when any supported Telescope config file is modified, and when relevant VS Code settings change.

## Commands

Available via Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                                     | Description                                |
| ------------------------------------------- | ------------------------------------------ |
| `OpenAPI: Classify Current Document`        | Manually classify document as OpenAPI      |
| `Telescope: Convert JSON to YAML (Replace)` | Convert JSON file to YAML, delete original |
| `Telescope: Convert JSON to YAML (Copy)`    | Convert JSON file to YAML, keep original   |
| `Telescope: Convert YAML to JSON (Replace)` | Convert YAML file to JSON, delete original |
| `Telescope: Convert YAML to JSON (Copy)`    | Convert YAML file to JSON, keep original   |
| `Telescope: Show References`                | Show references UI for a symbol (CodeLens) |

Conversion commands are also available in the editor and file explorer context menus.

## Built-in Rules

### Built-in Rulesets

| Ruleset                  | Rules | Description                           |
| ------------------------ | ----- | ------------------------------------- |
| `telescope:recommended`  | 50    | Core best practices                   |
| `telescope:all`          | 56    | All non-OWASP rules                  |
| `telescope:owasp`        | 32    | OWASP API Security Top 10            |
| `telescope:strict`       | 82    | Recommended + OWASP combined          |

### Rule Categories

| Category          | Examples                                                              |
| ----------------- | --------------------------------------------------------------------- |
| **References**    | Unresolved `$ref` detection                                           |
| **Naming**        | Unique operationIds, schema naming conventions, tag formatting        |
| **Documentation** | HTML in descriptions, deprecation explanations, enum descriptions     |
| **Structure**     | allOf composition, array items, discriminator mappings, JSON Schema   |
| **Security**      | Security scheme definitions, API key placement, OAuth URLs, OWASP    |
| **Paths**         | Parameter matching, trailing slashes, kebab-case, HTTP verbs in paths |
| **Types**         | String maxLength hints, format validation                             |
| **Servers**       | Server definitions, HTTPS requirements                                |

### Overriding Rule Severity

```yaml
rules:
  # Disable a rule
  string-max-length: off

  # Reduce to warning
  path-kebab-case: warn

  # Increase to error
  security-schemes-defined: error
```

## Custom Rules

Telescope supports custom rules via declarative YAML in `.telescope.yaml`, Spectral-compatible YAML rulesets (`spectralRulesets`), and TypeScript/JavaScript rules through the optional Bun sidecar.

For full documentation, see the [Custom Rules Guide](https://github.com/sailpoint-oss/telescope/blob/main/docs/CUSTOM-RULES.md).

## Extension Settings

| Setting                           | Description                                                    | Default |
| --------------------------------- | -------------------------------------------------------------- | ------- |
| `telescope.autoConvertJsonToYaml` | Automatically convert JSON OpenAPI files to YAML when detected | `false` |
| `telescope.serverPath`            | Absolute path to the Telescope language server binary          | `""`    |
| `telescope.contractTestBaseUrl`   | Default base URL used by the contract-test command             | `http://localhost:8080` |
| `telescope.trace`                 | LSP trace logging level (`off`, `messages`, `verbose`)         | `off`   |

## Architecture

The extension follows a per-folder session architecture:

- **SessionManager** creates one `Session` per workspace folder when the extension activates.
- Each **Session** spawns a Go language server process (`telescope serve`) via `vscode-languageclient`, connected over stdio.
- A **WorkspaceScanner** runs a background scan to discover and classify OpenAPI files using a lightweight heuristic (checks for `openapi` / `swagger` root keys, rejects known non-OpenAPI patterns like Kubernetes manifests and Docker Compose files).
- When you open a classified file, the session applies the `openapi-yaml` or `openapi-json` language mode via `vscode.languages.setTextDocumentLanguage`, which triggers the LanguageClient to re-sync the document with the correct language ID.
- The server uses **push diagnostics** exclusively (`textDocument/publishDiagnostics`). Diagnostics from the Telescope rule engine and child YAML/JSON language servers are merged by a `DiagnosticAggregator` on the server side before being sent to the client.
- File watchers track creation, deletion, and changes to YAML/JSON files and all supported Telescope config file locations, keeping the scanner and server in sync.

## E2E (VS Code integration) tests

For full end-to-end coverage (extension + language server), run:

```bash
pnpm --filter ./client test:e2e:compile
pnpm --filter ./client test:e2e:run:single
pnpm --filter ./client test:e2e:run:multi
```

Notes:
- The multi-root run is intentionally minimal (multi-root isolation + startup smoke).
- VS Code downloads/user-data are written under `client/.vscode-test` and are ignored by git.

## Troubleshooting

### Extension Not Activating

1. Check the **Telescope Language Server** output channel for errors
2. Verify the file is recognized as YAML or JSON
3. Ensure VS Code is up to date (requires `1.105.0+`)
4. Try restarting VS Code

### No Diagnostics Appearing

1. Check the document parses as valid YAML/JSON
2. Verify the file matches your `patterns` in `.telescope.yaml` or `.telescope/config.yaml`
3. Ensure the file contains an `openapi:` or `swagger:` root key
4. Check the output channel for classification messages

### Configuration Not Loading

1. Verify file location: `.telescope.yaml`, `.telescope.yml`, `.telescope/config.yaml`, or `.telescope/config.yml`
2. Check YAML syntax is valid
3. Look for errors in the output channel

### Slow Performance

Add exclusion patterns for large directories in `.telescope.yaml`:

```yaml
exclude:
  - "node_modules/**"
  - "dist/**"
  - ".git/**"
```

## Links

- [GitHub Repository](https://github.com/sailpoint-oss/telescope)
- [Issue Tracker](https://github.com/sailpoint-oss/telescope/issues)
- [Configuration Reference](https://github.com/sailpoint-oss/telescope/blob/main/docs/CONFIGURATION.md)
- [LSP Features Reference](https://github.com/sailpoint-oss/telescope/blob/main/docs/LSP-FEATURES.md)
- [Custom Rules Guide](https://github.com/sailpoint-oss/telescope/blob/main/docs/CUSTOM-RULES.md)
- [Built-in Rules Reference](https://github.com/sailpoint-oss/telescope/blob/main/server/README.md)

## License

[MIT](https://github.com/sailpoint-oss/telescope/blob/main/LICENSE) - Copyright (c) 2026 SailPoint Technologies
