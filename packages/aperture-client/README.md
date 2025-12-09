# Aperture Client

The VS Code extension client for Telescope. This package connects to the Aperture language server to provide real-time OpenAPI linting and diagnostics in VS Code.

## Features

- Real-time diagnostics for OpenAPI documents
- Multi-file project support with `$ref` resolution
- Quick fixes for auto-correctable issues
- Workspace-wide linting
- Custom rule support

## How It Works

The client is a thin wrapper around VS Code's Language Client API:

1. **Activation** - Registers for `yaml`, `yml`, and `json` language activation events
2. **Runtime Detection** - Locates Node.js runtime (bundled with VS Code)
3. **Server Launch** - Starts the bundled language server (`dist/server.js`) via Node.js
4. **LSP Protocol** - Handles communication using `vscode-languageclient`
5. **Volar Integration** - Registers with Volar Labs for enhanced features

## Source Layout

```
src/
└── extension.ts    # VS Code activation and client initialization

dist/
├── client.js       # Bundled client entry point
└── server.js       # Bundled language server
```

## Development

### Prerequisites

```bash
# From repository root
pnpm install
```

### Build

```bash
# Build the client
pnpm --filter aperture-client build

# Build the server (required for the extension to work)
pnpm --filter aperture-server build
```

### Debug

1. Open the repository in VS Code
2. Press F5 to launch the Extension Development Host
3. Open an OpenAPI document in the dev host
4. Watch the **Aperture Language Server** output channel for logs

Hot reloads are driven by the VS Code debugger; restart the Extension Development Host after making server changes.

## Configuration

### Linting Rules

The server loads configuration from `.telescope/config.yaml` in your workspace. See the [Configuration Guide](../../docs/CONFIGURATION.md) for details.

### File Watching

The client watches for `.telescope/config.yaml` changes and automatically reloads the configuration.

## Troubleshooting

### Extension Not Activating

1. Check the **Aperture Language Server** output channel for errors
2. Verify the file is recognized as YAML/JSON
3. Try restarting VS Code

### No Diagnostics Appearing

1. Check the document parses as valid YAML/JSON
2. Verify the file matches your `patterns` in `.telescope/config.yaml`
3. Enable trace logging to inspect document classification:
   - Set `TELESCOPE_LOG_LEVEL=debug` environment variable
   - Check the output channel for document type detection

### Slow Performance

1. Check the number of files matching your patterns
2. Add exclusion patterns for large directories:
   ```yaml
   patterns:
     - "**/*.yaml"
     - "!**/node_modules/**"
     - "!**/dist/**"
   ```

## Related

- [Telescope README](../../README.md)
- [Aperture Server](../aperture-server/README.md)
- [Configuration Guide](../../docs/CONFIGURATION.md)
- [Architecture](../../ARCHITECTURE.md)
