import { builtinModules } from "node:module";
import path from "node:path";
import alias from "@rollup/plugin-alias";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const workspace = (...p) => path.resolve(process.cwd(), "..", ...p);
const externalBuiltins = new Set(
	builtinModules.concat(builtinModules.map((m) => `node:${m}`)),
);
const externalPkgs = new Set([
	"fsevents",
	"ajv",
	"yaml-language-server",
	"vscode-json-languageservice",
]);

export default {
	input: "src/server.ts",
	output: {
		file: "out/server.js",
		format: "cjs",
		sourcemap: false,
		inlineDynamicImports: true,
	},
	external: (id) =>
		externalBuiltins.has(id) || id.startsWith("node:") || externalPkgs.has(id),
	plugins: [
		alias({
			entries: [
				{ find: "lens", replacement: workspace("lens", "src", "index.ts") },
				{ find: "blueprint", replacement: workspace("blueprint", "src", "index.ts") },
				{ find: "shared/file-system-utils", replacement: workspace("shared", "src", "file-system-utils.ts") },
				{ find: "shared/hash-utils", replacement: workspace("shared", "src", "hash-utils.ts") },
			],
		}),
		nodeResolve({
			extensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
			preferBuiltins: true,
			exportConditions: ["node"],
		}),
		commonjs({ ignoreDynamicRequires: true, ignore: ["fsevents"] }),
		json(),
		typescript(),
	],
};
