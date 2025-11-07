# Aperture LSP — Volar Language Server

The Aperture language server implements the Language Server Protocol using Volar's language server framework. It provides OpenAPI linting, diagnostics, and language features to VS Code through the `aperture-client` extension.

## Responsibilities

- Implement the LSP protocol using Volar's `@volar/language-server` framework
- Provide language plugins for YAML and JSON documents containing OpenAPI content
- Execute Telescope's shared linting pipeline (host → loader → indexer → engine) to generate diagnostics
- Handle workspace folder changes, document updates, and configuration reloads
- Support workspace diagnostics for multi-file OpenAPI projects

## Architecture

The server is built on Volar's language server infrastructure:

- **Language Plugin** (`languageModule.ts`) – Registers OpenAPI as a language and creates virtual code from document snapshots
- **Diagnostics Plugin** (`plugins/diagnostics.ts`) – Integrates Telescope's linting engine to produce diagnostics
- **Context** (`context.ts`) – Manages shared state including document store, host, configuration, and rules
- **Documents** (`documents.ts`) – Maintains a store of OpenAPI documents with language detection
- **Host** (`host.ts`, `volar-fs-host.ts`) – Provides filesystem access through Volar's file system API

## Build

The server is bundled into a single CommonJS file using Rollup:

```bash
bun run --filter aperture-lsp build
```

This produces `out/server.js`, which includes all workspace dependencies (lens, engine, host, loader, indexer, blueprint) bundled together. See `BUILD-NOTES.md` for detailed build configuration.

## Integration

The server is launched by `aperture-client` via IPC transport. The client resolves the server path to `../aperture-lsp/out/server.js` and starts it as a separate Node.js process.

## Development

1. Build the server: `bun run --filter aperture-lsp build`
2. Use VS Code's **Run Extension** launch configuration (F5) to start the extension development host
3. The server will automatically start when the client activates
4. Watch the **Aperture Language Server** output channel for server logs
5. Use the **Attach to Server** debug configuration to debug the server process (port 6009)

## Configuration

The server loads configuration through `lens`, which materializes presets and rule overrides. By default it applies the `recommended31` preset from `blueprint`. Configuration changes are detected via file watchers and trigger a reload.

## Key Features

- **Incremental document sync** – Only processes changed document content
- **Workspace diagnostics** – Lints entire workspace when supported by the client
- **Multi-root support** – Handles multiple workspace folders
- **Document type detection** – Automatically identifies OpenAPI root documents, fragments, and non-OpenAPI files
- **Reference graph** – Builds and maintains `$ref` dependency graphs for cross-file validation

