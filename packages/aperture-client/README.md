# Aperture — OpenAPI VS Code Language Server

Aperture packages Telescope's shared linting pipeline into a VS Code extension. The client bootstraps the language server and the server reuses the host → loader → indexer → engine stack to surface diagnostics, quick fixes, and logging inside the editor.

## Responsibilities

- Activate on `.yaml`, `.yml`, and `.json` documents containing OpenAPI content
- Discover workspace entrypoints through `lens` and stream document updates to the shared pipeline
- Return diagnostics, code actions, and telemetry to VS Code with minimal duplication of CLI logic
- Provide debug output through the **Aperture Language Server** and **Aperture Language Server Trace** channels

## Source layout

- `src/client/extension.ts` – VS Code activation and language client wiring
- `src/volar/*` – Volar integration (shared caches, language module, diagnostics plugin, and server bootstrap)
- `dist/client/*` / `dist/volar/*` – compiled output used by the published extension

## Develop and debug

1. Run `bun install` from the repository root if you have not already.
2. Compile the extension once (`bun run --filter aperture build`) to generate the Volar server bundle.
3. Open the repo in VS Code and use the **Run Extension** launch configuration (F5) to start an Extension Development Host.
4. Open an OpenAPI document in the dev host; Aperture activates via `onLanguage:yaml`, `onLanguage:yml`, and `onLanguage:json`.
5. Watch the **Aperture Language Server** and **Trace** output channels for logging, rule counts, and context resolution details.

Hot reloads are driven by the VS Code debugger; restart the Extension Development Host after making server changes.

## Configuration

- **Linting rules:** Aperture loads configuration through `lens`, which materializes presets and rule overrides. By default it applies the `recommended31` preset from `blueprint`. Custom configuration files use the same shape as the CLI and automatically propagate to the language server.

## Troubleshooting tips

- Enable the trace channel to inspect document classification (project, fragment, multi-root) decisions.
- Use the `TELESCOPE_LOG_LEVEL` environment variable when launching the dev host to increase verbosity.
- If diagnostics do not appear, confirm the open document parses as an OpenAPI root via the `Document cache` messages in the output channel.


