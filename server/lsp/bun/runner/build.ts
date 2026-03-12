/**
 * Two-step build for the telescope-runner binary.
 *
 * Step 1: Bundle src/runner.ts into a single JS file, using a resolver plugin
 *         to force jsonc-parser to its ESM entry (the UMD entry uses a factory
 *         pattern with dynamic require("./impl/...") that can't survive Bun's
 *         --compile step).
 *
 * Step 2: Compile the bundled JS into a standalone executable per platform.
 */

import { build } from "bun";
import { mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";

const scriptDir = dirname(import.meta.filename);
const distDir = join(scriptDir, "dist");
const bundlePath = join(distDir, "_bundle.js");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const jsoncParserESM = require.resolve("jsonc-parser/lib/esm/main.js");

console.log("Step 1: Pre-bundling with ESM resolution fix...");
const bundleResult = await build({
	entrypoints: [join(scriptDir, "src/runner.ts")],
	outdir: distDir,
	naming: "_bundle.js",
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

const allTargets = [
	"bun-linux-x64",
	"bun-linux-arm64",
	"bun-darwin-x64",
	"bun-darwin-arm64",
	"bun-windows-x64",
];

// Determine which targets to build:
// --all builds all platforms (for releases), otherwise just the current platform.
const buildAll = process.argv.includes("--all");
const currentPlatform = `bun-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`;
const targets = buildAll
	? allTargets
	: allTargets.filter((t) => t === currentPlatform);

if (targets.length === 0) {
	console.warn(`  Warning: no matching target for ${currentPlatform}, building all`);
	targets.push(...allTargets);
}

console.log(`Step 2: Compiling standalone binaries (${buildAll ? "all platforms" : currentPlatform})...`);
for (const target of targets) {
	const outname = `telescope-runner-${target.replace("bun-", "")}`;
	const outpath = join(distDir, outname);
	console.log(`  Building ${outname}...`);

	const proc = Bun.spawnSync(
		["bun", "build", "--compile", `--target=${target}`, bundlePath, "--outfile", outpath],
		{ cwd: scriptDir, stderr: "inherit", stdout: "inherit" },
	);

	if (proc.exitCode !== 0) {
		console.error(`  Failed to compile ${outname}`);
		process.exit(1);
	}
}

rmSync(bundlePath, { force: true });

console.log("\nBuild complete. Artifacts in dist/:");
const { readdirSync, statSync } = await import("fs");
for (const f of readdirSync(distDir)) {
	const s = statSync(join(distDir, f));
	const mb = (s.size / 1024 / 1024).toFixed(1);
	console.log(`  ${f}  ${mb} MB`);
}
