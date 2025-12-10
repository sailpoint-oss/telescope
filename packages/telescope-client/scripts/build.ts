import * as esbuild from "esbuild";

/**
 * Plugin to convert UMD modules to ESM.
 * This fixes issues with jsonc-parser and vscode-*-languageservice packages
 * that ship UMD builds with dynamic requires that don't work in bundled contexts.
 */
const umd2esmPlugin: esbuild.Plugin = {
	name: "umd2esm",
	setup(build) {
		build.onResolve(
			{ filter: /^(vscode-.*-languageservice|jsonc-parser)/ },
			(args) => {
				const pathUmd = require.resolve(args.path, {
					paths: [args.resolveDir],
				});
				// Replace /umd/ with /esm/ in the path (handles both Unix and Windows)
				const pathEsm = pathUmd
					.replace("/umd/", "/esm/")
					.replace("\\umd\\", "\\esm\\");
				return { path: pathEsm };
			},
		);
	},
};

const isWatch = process.argv.includes("--watch");
const isMinify = process.argv.includes("--minify");
const isSourcemap = process.argv.includes("--sourcemap");
const isMetafile = process.argv.includes("--metafile");

console.log("Building Telescope extension...");
console.log(`  Watch: ${isWatch}`);
console.log(`  Minify: ${isMinify}`);
console.log(`  Sourcemap: ${isSourcemap}`);

const ctx = await esbuild.context({
	entryPoints: {
		client: "./src/extension.ts",
		server: "../telescope-server/src/server.ts",
	},
	bundle: true,
	outdir: "./dist",
	external: [
		"vscode", // VS Code API - provided by runtime
		"esbuild", // Used for runtime TS rule loading
	],
	format: "cjs",
	platform: "node",
	target: "node20",
	sourcemap: isSourcemap,
	minify: isMinify,
	metafile: isMetafile,
	plugins: [umd2esmPlugin],
	logLevel: "info",
});

if (isWatch) {
	await ctx.watch();
	console.log("Watching for changes...");
} else {
	const result = await ctx.rebuild();
	await ctx.dispose();

	if (isMetafile && result.metafile) {
		const analysis = await esbuild.analyzeMetafile(result.metafile);
		console.log(analysis);
	}

	console.log("✅ Built client and server to dist/");
}
