# Aperture Client & LSP Implementation Analysis

## Current State

### Package Structure

- **`packages/aperture-client/`** - VS Code extension client
- **`packages/aperture-lsp/`** - Volar-based language server

### Implementation Status

✅ **Completed:**

- Volar server implementation (`aperture-lsp/server.ts`)
- Language module (`aperture-lsp/languageModule.ts`)
- Diagnostics plugin (`aperture-lsp/plugins/diagnostics.ts`)
- Context management (`aperture-lsp/context.ts`)
- Document store (`aperture-lsp/documents.ts`)
- Host integration (`aperture-lsp/host.ts`, `aperture-lsp/volar-fs-host.ts`)
- Client extension activation (`aperture-client/src/extension.ts`)

## Critical Issues to Fix

### 1. **Build Configuration Missing**

#### `aperture-lsp/package.json`

- ❌ No build scripts
- ❌ No TypeScript configuration
- ❌ No output directory configuration
- ❌ Missing `main` or `bin` entry point

**Required:**

```json
{
  "main": "./out/server.js",
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf out"
  }
}
```

#### `aperture-client/package.json`

- ❌ No build scripts
- ❌ Missing VS Code extension configuration
- ❌ Wrong `files` field (references non-existent `dist/client`, `dist/volar`)
- ❌ Missing `main` entry point
- ❌ Missing `activationEvents` and `contributes` sections

**Required:**

```json
{
  "main": "./out/extension.js",
  "activationEvents": ["onLanguage:yaml", "onLanguage:yml", "onLanguage:json"],
  "contributes": {
    "languages": [...],
    "configuration": {...}
  },
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf out"
  },
  "files": ["out", "README.md", "package.json"]
}
```

### 2. **TypeScript Configuration Issues**

#### `aperture-lsp/tsconfig.json` - **MISSING**

Need to create:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out",
    "rootDir": "./",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "target": "ES2020",
    "noEmit": false,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["./**/*.ts"],
  "exclude": ["node_modules", "out"]
}
```

#### `aperture-client/tsconfig.json` - **INCOMPLETE**

Current config is too minimal. Needs:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "outDir": "out",
    "rootDir": "src",
    "lib": ["ES2020"],
    "target": "ES2020",
    "types": ["node", "vscode"],
    "resolvePackageJsonExports": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### 3. **Import/Module Resolution Issues**

#### `vscode-languageclient/node` Import Error

- The package uses CommonJS (`module.exports`) but we're in ESM mode
- The `node.js` file is a CommonJS wrapper
- **Solution:** The import should work, but TypeScript may need proper type resolution

**Try:**

```typescript
import {
  LanguageClient,
  TransportKind,
  // ... other imports
} from "vscode-languageclient/node";
```

If that fails, may need to check if package has proper ESM exports or use dynamic import.

### 4. **Path Mismatches**

#### Client Server Path

- Client expects: `node_modules/aperture-lsp/out/server.js`
- But `aperture-lsp` is a workspace package, not installed in `node_modules`
- **Solution:** Use workspace reference or build to a shared location

**Options:**

1. Build `aperture-lsp` to `aperture-client/node_modules/aperture-lsp/out/` (not ideal)
2. Use relative path: `path.join(context.extensionPath, "..", "aperture-lsp", "out", "server.js")`
3. Build both to a shared `dist` folder
4. Use workspace package resolution (if supported by VS Code)

### 5. **VS Code Configuration**

#### Launch Configuration (`.vscode/launch.json`)

- Currently references old `packages/aperture` structure
- Needs update to `packages/aperture-client`
- Server attach path needs update

#### Tasks Configuration (`.vscode/tasks.json`)

- References old build structure
- Needs new tasks for `aperture-client` and `aperture-lsp`

### 6. **Package Dependencies**

#### `aperture-lsp/package.json`

- ✅ Has correct Volar dependencies
- ✅ Has workspace dependencies
- ❌ Missing `@types/node` if needed

#### `aperture-client/package.json`

- ✅ Has Volar dependencies
- ✅ Has `vscode-languageclient`
- ✅ Has `@types/node` (recently added)
- ❌ May need `@types/vscode` version check

## Action Items

### Priority 1: Build System

1. ✅ Create `aperture-lsp/tsconfig.json`
2. ✅ Add build scripts to both packages
3. ✅ Fix output directories
4. ✅ Update `aperture-client/tsconfig.json`

### Priority 2: Package Configuration

1. ✅ Fix `aperture-client/package.json`:
   - Add `main` entry
   - Add `activationEvents`
   - Add `contributes` section
   - Fix `files` field
2. ✅ Fix `aperture-lsp/package.json`:
   - Add `main` entry
   - Add build scripts

### Priority 3: Path Resolution

1. ✅ Fix server module path in client
2. ✅ Decide on build output strategy
3. ✅ Update VS Code launch/tasks configs

### Priority 4: Type Resolution

1. ✅ Fix `vscode-languageclient/node` import
2. ✅ Verify all type imports work
3. ✅ Run full type check

### Priority 5: Testing

1. ✅ Test extension activation
2. ✅ Test language server connection
3. ✅ Test diagnostics
4. ✅ Test file watching

## Recommended Build Strategy

### Option A: Separate Builds (Recommended)

```
packages/
  aperture-client/
    out/
      extension.js
  aperture-lsp/
    out/
      server.js
```

Client references server via workspace or relative path.

### Option B: Combined Build

```
packages/
  aperture-client/
    out/
      extension.js
      server.js  (copied from aperture-lsp)
```

Build `aperture-lsp` first, then copy output to client.

## Next Steps

1. Create missing TypeScript configs
2. Add build scripts
3. Fix package.json configurations
4. Fix import paths
5. Update VS Code configs
6. Test end-to-end
