/**
 * Bundle the Bun sidecar into a single runtime artifact.
 *
 * Telescope now executes this bundled script with a user-provided Bun runtime
 * instead of compiling and embedding per-platform native runner binaries.
 */

import { build } from "bun";
import { mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { join, dirname } from "path";

const scriptDir = dirname(import.meta.filename);
const distDir = join(scriptDir, "dist");
const bundlePath = join(distDir, "runner.js");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const jsoncParserESM = require.resolve("jsonc-parser/lib/esm/main.js");

console.log("Bundling Bun sidecar...");
const bundleResult = await build({
	entrypoints: [join(scriptDir, "src/runner.ts")],
	outdir: distDir,
	naming: "runner.js",
	target: "bun",
	bundle: true,
	minify: false,
	plugins: [
		{
			name: "force-jsonc-parser-esm",
			setup(builder) {
				builder.onResolve({ filter: /^jsonc-parser$/ }, () => ({
					path: jsoncParserESM,
				}));
			},
		},
	],
});

if (!bundleResult.success) {
	console.error("Bundle failed:");
	for (const log of bundleResult.logs) {
		console.error(log);
	}
	process.exit(1);
}
console.log(`  Bundled into ${bundlePath}`);

console.log("\nBuild complete. Artifacts in dist/:");
for (const f of readdirSync(distDir)) {
	const s = statSync(join(distDir, f));
	const mb = (s.size / 1024 / 1024).toFixed(1);
	console.log(`  ${f}  ${mb} MB`);
}
