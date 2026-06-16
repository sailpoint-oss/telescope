# Telescope - OpenAPI Language Server

VS Code extension for OpenAPI specifications with real-time validation, code navigation, and customization.

For the complete feature list, see [docs/LSP-FEATURES.md](../docs/LSP-FEATURES.md).

## Installation

Telescope is published with different extension IDs depending on the store:

| Store | Extension ID | Install command |
| ----- | ------------ | --------------- |
| VS Code Marketplace | `SailPointTechnologies.telescope-openapi` | `code --install-extension SailPointTechnologies.telescope-openapi` |
| Open VSX / Cursor / VSCodium | `sailpoint.telescope` | `code --install-extension sailpoint.telescope` |

Platform-specific VSIXs that bundle the Telescope server are currently published for `darwin-arm64`, `darwin-x64`, `linux-x64`, and `win32-x64`.

The universal VSIX works on other platforms too, but it does not bundle the `telescope` binary. On those installs, provide the server with `telescope.serverPath`, `TELESCOPE_SERVER_PATH`, or `PATH`.

All VSIX variants include the bundled Bun sidecar script used for TypeScript/JavaScript custom rules and Spectral rulesets. Bun itself is only required on the user's system when those sidecar-backed features are enabled; base OpenAPI language-server features continue to work without Bun.

## Automatic Detection

The extension automatically detects OpenAPI documents based on:

1. File contains `openapi:` or `swagger:` root key
2. File matches patterns configured in a supported Telescope config file

Once detected, Telescope treats the file as OpenAPI for language server features. When you open a detected file, Telescope applies the custom OpenAPI language mode (`openapi-yaml` / `openapi-json`) for correct tokenization and grammars.

## Configuration

Create `.telescope/config.yaml` in your workspace root. Legacy `.telescope.yaml` and `.telescope.yml` files are still supported.

See [docs/CONFIGURATION-V2.md](../docs/CONFIGURATION-V2.md) for the canonical configuration reference. For built-in rules and severity overrides, see [docs/RULES.md](../docs/RULES.md). For custom rules, see [docs/CUSTOM-RULES.md](../docs/CUSTOM-RULES.md).

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

## Extension Settings

| Setting                           | Description                                                    | Default |
| --------------------------------- | -------------------------------------------------------------- | ------- |
| `telescope.autoConvertJsonToYaml` | Automatically convert JSON OpenAPI files to YAML when detected | `false` |
| `telescope.serverPath`            | Absolute path to the Telescope language server binary          | `""`    |
| `telescope.contractTestBaseUrl`   | Default base URL used by the contract-test command             | `http://localhost:8080` |
| `telescope.trace`                 | LSP trace logging level (`off`, `messages`, `verbose`)         | `off`   |

For LSP trace debugging, see [docs/LSP-TRACE-RUNBOOK.md](../docs/LSP-TRACE-RUNBOOK.md).

## Architecture

The extension follows a per-folder session architecture. For the full client breakdown, see [docs/CODEBASE-BREAKDOWN.md](../docs/CODEBASE-BREAKDOWN.md) § VS Code Extension Client. Maintainer subsystem map: [docs/MAINTAINER-GUIDE.md](../docs/MAINTAINER-GUIDE.md#subsystem-ownership-map).

- **SessionManager** creates one `Session` per workspace folder when the extension activates.
- Each **Session** spawns a Go language server process (`telescope serve`) via `vscode-languageclient`, connected over stdio.
- A **WorkspaceScanner** runs a background scan to discover and classify OpenAPI files using a lightweight heuristic (checks for `openapi` / `swagger` root keys, rejects known non-OpenAPI patterns like Kubernetes manifests and Docker Compose files).
- When you open a classified file, the session applies the `openapi-yaml` or `openapi-json` language mode via `vscode.languages.setTextDocumentLanguage`, which triggers the LanguageClient to re-sync the document with the correct language ID.
- The server uses **push diagnostics** exclusively (`textDocument/publishDiagnostics`). Telescope merges its own diagnostic sources before publishing, while generic YAML/JSON syntax feedback is left to the editor or other installed language extensions.
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
2. Verify the file matches your include patterns in `.telescope/config.yaml` (see [CONFIGURATION-V2.md](../docs/CONFIGURATION-V2.md))
3. Ensure the file contains an `openapi:` or `swagger:` root key
4. Check the output channel for classification messages

### Configuration Not Loading

1. Verify file location: `.telescope/config.yaml`, `.telescope/config.yml`, `.telescope.yaml`, or `.telescope.yml`
2. Check YAML syntax is valid
3. Look for errors in the output channel

### Slow Performance

Add ignore patterns under `workspace.ignore` in `.telescope/config.yaml` (see [CONFIGURATION-V2.md](../docs/CONFIGURATION-V2.md)):

```yaml
workspace:
  ignore:
    - node_modules/**
    - dist/**
    - .git/**
```

## Links

- [Product overview](../README.md)
- [Documentation index](../docs/README.md)
- [Configuration (v2)](../docs/CONFIGURATION-V2.md)
- [LSP features](../docs/LSP-FEATURES.md)
- [Built-in rules](../docs/RULES.md)
- [Custom rules](../docs/CUSTOM-RULES.md)
- [GitHub repository](https://github.com/sailpoint-oss/telescope)
- [Issue tracker](https://github.com/sailpoint-oss/telescope/issues)

## License

[MIT](../LICENSE) - Copyright (c) 2026 SailPoint Technologies
