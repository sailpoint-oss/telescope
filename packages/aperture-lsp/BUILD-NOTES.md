# Build Notes

## ✅ Build Process

The LSP server is bundled with Rollup into a single CommonJS file. All workspace dependencies (lens, engine, host, loader, indexer, blueprint) are included in the bundle so they are always available at runtime.

### Build Configuration

Rollup configuration is defined in `rollup.config.mjs` and:

1. Bundles all workspace dependencies via explicit `@rollup/plugin-alias` path mappings
2. Resolves Node/Esm/CommonJS via `@rollup/plugin-node-resolve` and `@rollup/plugin-commonjs`
3. Compiles TypeScript using `rollup-plugin-typescript2`
4. Externalizes only Node builtins (e.g. `fs`, `path`) to keep the bundle portable
5. Outputs CommonJS at `out/server.js`

### Why Bundle?

Workspace packages are not installed inside `aperture-lsp/node_modules`. Bundling them avoids `MODULE_NOT_FOUND` at runtime and removes ESM/CJS boundary issues for the language server process.

### Externalized

- Node builtins only (e.g. `node:fs`, `node:path`, etc.). Everything else is bundled.

### Building

```bash
bun run --filter aperture-lsp build
```

This will:

1. Clean the `out/` directory
2. Bundle `server.ts` and its dependencies into `out/server.js`
3. Produce a single file that can be executed by Node.js

### Verification

After building, confirm `out/server.js` exists and is a single bundled file. Launch the VS Code extension and ensure the server starts without `MODULE_NOT_FOUND` errors.
