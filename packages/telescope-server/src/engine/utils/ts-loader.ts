/**
 * Runtime TypeScript loader.
 * Used to dynamically import custom TypeScript rule files.
 *
 * In Bun, TypeScript files can be imported directly.
 * In Node.js, we use esbuild to transform the code first.
 */

import { pathToFileURL } from "node:url";

// Detect if running in Bun
const isBun =
	typeof (globalThis as unknown as { Bun?: unknown }).Bun !== "undefined";

/**
 * Import a TypeScript file at runtime.
 *
 * - In Bun: Uses native TypeScript import
 * - In Node.js: Falls back to esbuild transformation
 *
 * @param filePath - Absolute path to the TypeScript file
 * @returns The module exports from the TypeScript file
 */
export async function importTypeScript(filePath: string): Promise<unknown> {
	if (isBun) {
		// Bun can import TypeScript directly
		// Use file URL to ensure proper path resolution
		const fileUrl = pathToFileURL(filePath).href;
		return import(fileUrl);
	}

	// Node.js fallback using esbuild
	const esbuild = await import("esbuild");
	const { mkdtemp, rm } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { dirname, join } = await import("node:path");

	// Create a temporary directory for the bundled output
	const tempDir = await mkdtemp(join(tmpdir(), "telescope-rule-"));
	const outFile = join(tempDir, "bundle.mjs");

	try {
		// Bundle the file with esbuild, resolving all imports
		await esbuild.build({
			entryPoints: [filePath],
			bundle: true,
			format: "esm",
			platform: "node",
			target: "node20",
			outfile: outFile,
			// Mark node built-ins as external
			external: ["node:*"],
			// Resolve from the source file's directory
			absWorkingDir: dirname(filePath),
		});

		// Import the bundled file
		const module = await import(outFile);
		return module;
	} finally {
		// Clean up temp directory
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	}
}
