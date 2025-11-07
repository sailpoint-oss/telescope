## Volar Migration Strategy

### 1. Baseline Today’s Responsibilities

- **Server lifecycle:** `src/server/server.ts` bootstraps IPC, tracks `initialized`, and wires handlers for init, config, watched files, change/save, and close. Maintain equivalent flow post-migration for reliability and predictable logging.

```243:323:/Users/luke.hagar/Documents/GitHub/telescope/packages/aperture/src/server/server.ts
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
		const context = await resolveLintingContext(
			textDocument.uri,
			lspHost,
			workspaceFolders,
			entrypointUris,
			documentCache,
		);
		const allDiagnostics = await lintDocument(context, lspHost, rules);
		const diagnostics = allDiagnostics
			.filter((diag: Diagnostic) => diag.uri === textDocument.uri)
			.map(toLspDiagnostic);
		connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}
```

- **Context resolution:** `resolveLintingContext` handles root discovery, fragment mode, and multi-root contexts; Volar adaptation must keep this semantics.
- **Caching:** `DocumentTypeCache`, `materializeRules`, `workspaceFolders` cache reduce repeated work; replication within Volar layer is mandatory.
- **Client interface:** `src/client/extension.ts` configures document selectors for YAML, YML, JSON, sets trace channels, and controls logging.

### 2. Dependencies & Build Infrastructure

- **Packages to add**
  - `@volar/language-core` – language module scaffolding
  - `@volar/language-service` – plugin host
  - `@volar/language-server` / `@volar/language-server/node` – ready-made server loop
  - `@volar/typescript` – enables TS integration if needed
  - `vscode-volar` – VS Code client utilities when adopting Volar-specific protocol extensions
- **Bun compatibility**
  - Ensure Bun build commands can compile Volar ESM outputs (check `bunfig.toml` if present).
  - Update `tsconfig.server.json` to include new Volar entrypoints (`src/volar/**/*`), adjust module resolution if Volar requires `node16` or `bundler` semantics.
  - Confirm `package.json` scripts or `turbo.json` tasks include new compile steps; plan for `bun run --filter aperture build` covering Volar bundles.
- **Distribution layout**
  - Output compiled server to `dist/volar/server.js`; keep `dist/client/extension.js` unchanged.
  - Review `files` field in `package.json` so new directories ship in packaged extension.

### 3. OpenAPI Language Module Design

- **File structure:** Create `src/volar/` directory, with `languageModule.ts`, `host.ts`, `documents.ts`.
- **Language module (`LanguageModule<OpenApiVirtualFile>`):**
  - `createSourceFile(uri, text)`: load via Telescope `loader`, populate metadata (doc type, hash, workspace roots) using `DocumentTypeCache`.
  - `updateSourceFile`: reuse cached parse when only version changes; fallback to reparse on structural change.
  - `resolveEmbeddedFile`: if treating YAML/JSON as host language, supply same content; if future features demand AST transforms, produce generated virtual files.
- **Host adapter:**
  - Wrap `LspHost` to satisfy Volar’s `LanguageContext`: implement `getScriptSnapshot`, `fileExists`, `readFile`, `resolveModuleName`.
  - Maintain direct bridge to `DocumentTypeCache` and `resolveLintingContext`.

### 4. Volar Service Plugins

- **Diagnostics plugin:**
  - Hook into `service.provideDiagnostics`.
  - On trigger, run `resolveLintingContext` + `lintDocument`, map results to Volar diagnostic objects (mirroring `toLspDiagnostic` severity and codes).
  - Handle incremental invalidation: integrate with Volar file change events to invalidate `DocumentTypeCache`.
- **Code actions (future-ready):**
  - Provide rule quick-fixes (e.g., auto-capitalize schema names) once `level` rules expose fix metadata.
- **Hover/Definition roadmap:**
  - Use `graph` resolver to surface `$ref` targets and embed rule docstrings.
  - Configure toggles through Volar plugin settings to allow gradual rollout.
- **Shared state:**
  - Introduce `VolarContext` singleton storing `materializeRules`, workspace root cache, and `DocumentTypeCache` for reuse across plugins.

### 5. Server Entry Rework

- **New entry file:** `src/volar/server.ts`

  - Use Volar helpers:

    ```ts
    import { createConnection } from "@volar/language-server/node";
    import { createLanguageServer } from "@volar/language-server";
    const connection = createConnection();
    createLanguageServer(connection, {
      modules: [openApiLanguageModule],
      plugins: [diagnosticsPlugin, codeActionPlugin],
    });
    ```

  - Register configuration and watched-file listeners via Volar `connection` if additional handling is required (e.g., recompute `materializeRules` on config change).
  - Preserve logging detail by piping Volar logs into `connection.console` and maintaining trace settings.

- **Migration of existing logic:**
  - `discoverWorkspaceRoots`, `handleRootDocumentChange`, dependency graph rebuilds should be triggered in plugin callbacks (e.g., when root file changes).
  - Ensure multi-root contexts still run by making plugin aware of context mode.

### 6. Client Extension Adjustments

- **Server path:** point to `dist/volar/server.js`.
- **Capabilities:** update initialization options to include new features (semantic tokens, completions) as announced by Volar.
- **Trace & logging:** continue to expose “Aperture Language Server” and “Trace” channels; optionally add Volar-specific telemetry channel.
- **Settings integration:** if Volar plugins require configuration, extend `package.json` `contributes.configuration` to expose toggles (e.g., `aperture.experimental.volar`).

### 7. Build & Packaging Pipeline

- **Compile step:** add script to build Volar server (e.g., `bun run tsc --project tsconfig.volar.json`).
- **Artifacts:** ensure `dist/volar` is cleared before build, similar to current `dist/server`.
- **Legacy cleanup:** once stable, remove old Node LSP entry and update `package.json.main` if necessary; maintain compatibility during transition by optionally shipping both versions behind a setting.

### 8. Validation & Rollout

- **Regression matrix**

  - Sample projects covering root docs, fragments, multi-root, and large repo.
  - Compare diagnostics/time-to-diagnostic pre-migration vs Volar.
  - Manual QA on editor flows: open/save, cross-file ref updates, $ref cascade.

- **Automation**

  - Add e2e script (Bun or Node) launching language service in headless mode against fixtures to verify diagnostic parity.
  - Consider smoke tests using `vscode-test` to spin up extension dev host.

- **Documentation**

  - Update `README.md` with Volar architecture diagram, dev setup steps (`bun install`, `bun run build:volar`, `F5` instructions).
  - Draft migration notes for changelog describing new dependencies, features, and limitations.

- **Rollout plan**

  - Stage 1: hidden behind setting (`aperture.experimental.useVolar`), default off.
  - Stage 2: insider VSIX release, gather feedback.
  - Stage 3: set Volar as default, keep legacy entry for one release cycle, then remove.

- **Fallback**
  - Tag legacy LSP version for quick rollback.
  - Document necessary VS Code engine version (check Volar requirements) and update `engines.vscode` in `package.json` if needed.
