import { builtinModules } from "node:module";
import path from "node:path";
import alias from "@rollup/plugin-alias";
import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";

const workspace = (...p) => path.resolve(process.cwd(), "..", ...p);
const externalBuiltins = new Set(
	builtinModules.concat(builtinModules.map((m) => `node:${m}`)),
);
const externalPkgs = new Set(["fsevents"]);

export default {
	input: "server.ts",
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
				{ find: "lens", replacement: workspace("lens", "index.ts") },
				{ find: "engine", replacement: workspace("engine", "src", "index.ts") },
				{ find: "host", replacement: workspace("host", "src", "index.ts") },
				{ find: "loader", replacement: workspace("loader", "src", "index.ts") },
				{
					find: "indexer",
					replacement: workspace("indexer", "src", "index.ts"),
				},
				{ find: "blueprint", replacement: workspace("blueprint", "index.ts") },
			],
		}),
		nodeResolve({
			extensions: [".ts", ".tsx", ".mjs", ".js", ".json"],
			preferBuiltins: true,
			exportConditions: ["node"],
		}),
		commonjs({ ignoreDynamicRequires: true, ignore: ["fsevents"] }),
		json(),
		typescript({
			tsconfig: "tsconfig.json",
			clean: true,
			check: false,
			tsconfigOverride: { compilerOptions: { declaration: false } },
		}),
	],
};
