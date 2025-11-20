# Aperture Client — VS Code Extension

The Aperture VS Code extension client connects to the Aperture language server (`aperture-lsp`) to provide OpenAPI linting, diagnostics, and language features inside VS Code.

## Requirements

**Bun Runtime (Required)**: The extension requires Bun to run. Bun provides faster startup times and native TypeScript support for custom rules.

- **Install Bun**: `curl -fsSL https://bun.sh/install | bash` (see [bun.sh/docs/installation](https://bun.sh/docs/installation))
- The extension will show an error message if Bun is not found

## Responsibilities

- Activate on `.yaml`, `.yml`, and `.json` documents containing OpenAPI content
- Launch and manage the language server process via IPC transport (using Bun if available, Node.js otherwise)
- Forward LSP protocol messages between VS Code and the server
- Provide output channels for server logging and trace information
- Integrate with Volar Labs for enhanced language features

## Source layout

- `src/extension.ts` – VS Code activation and language client initialization
- `out/extension.js` – Compiled extension entry point

## Architecture

The client is a thin wrapper around VS Code's Language Client API:

1. **Activation** – Registers for `yaml`, `yml`, and `json` language activation events
2. **Bun Requirement Check** – Verifies Bun is installed, shows error if not found
3. **Server Launch** – Resolves the server path (`../aperture-lsp/out/server.js`) and starts it with Bun
4. **LSP Protocol** – Uses `vscode-languageclient` to handle communication
5. **Volar Integration** – Registers with Volar Labs for enhanced features

## Develop and debug

1. Run `bun install` from the repository root if you have not already.
2. Build the language server: `bun run --filter aperture-lsp build`
3. Build the client: `bun run --filter aperture-client build`
4. Open the repo in VS Code and use the **Run Extension** launch configuration (F5) to start an Extension Development Host.
5. Open an OpenAPI document in the dev host; Aperture activates via `onLanguage:yaml`, `onLanguage:yml`, and `onLanguage:json`.
6. Watch the **Aperture Language Server** and **Trace** output channels for logging, rule counts, and context resolution details.

Hot reloads are driven by the VS Code debugger; restart the Extension Development Host after making server changes.

## Configuration

- **Linting rules:** The language server loads configuration through `lens`, which materializes presets and rule overrides. By default it applies the `defaultPreset` (`@telescope-openapi/default`) from `blueprint`. SailPoint users can use `sailpointPreset` (`@telescope-openapi/sailpoint`) which extends the default preset. Custom configuration files use the same shape as the CLI and automatically propagate to the language server.
- **File watching:** The client watches for `.aperturerc` configuration file changes and notifies the server.

## Troubleshooting tips

- Enable the trace channel to inspect document classification (project, fragment, multi-root) decisions.
- Use the `TELESCOPE_LOG_LEVEL` environment variable when launching the dev host to increase verbosity.
- If diagnostics do not appear, confirm the open document parses as an OpenAPI root via the `Document cache` messages in the output channel.
