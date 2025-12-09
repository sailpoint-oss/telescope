import * as esbuild from "esbuild";

// Common ESM banner for Node.js compatibility
const esmBanner = `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`.trim();

// Build the server (LSP server entry point)
await esbuild.build({
	entryPoints: ["src/server.ts"],
	bundle: true,
	platform: "node",
	target: "node20",
	outfile: "dist/server.js",
	format: "esm",
	// Prefer ESM modules over UMD/CommonJS to avoid dynamic require issues
	mainFields: ["module", "main"],
	banner: { js: esmBanner },
	// External packages:
	// - esbuild: used at runtime for TS rule loading
	// - yaml-language-server & vscode-json-languageservice: use UMD with dynamic requires
	external: ["esbuild", "yaml-language-server", "vscode-json-languageservice"],
});

console.log("✅ Server bundled to dist/server.js");

// Build the engine API (for external consumers like custom rules/schemas)
await esbuild.build({
	entryPoints: ["src/engine/index.ts"],
	bundle: true,
	platform: "node",
	target: "node20",
	outfile: "dist/engine.js",
	format: "esm",
	mainFields: ["module", "main"],
	banner: { js: esmBanner },
	// Keep external for runtime dependencies
	external: ["esbuild"],
});

console.log("✅ Engine API bundled to dist/engine.js");
