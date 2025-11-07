#!/usr/bin/env bun
import { formatters } from "./formatters";
import { lint } from "./index";

interface CliOptions {
	cache?: boolean;
	watch?: boolean;
	format?: string;
}

function parseArgs(args: string[]): {
	entrypoints: string[];
	options: CliOptions;
} {
	const entrypoints: string[] = [];
	const options: CliOptions = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;

		if (arg === "--cache") {
			options.cache = true;
		} else if (arg === "--watch" || arg === "-w") {
			options.watch = true;
		} else if (arg === "--format" || arg === "-f") {
			const nextArg = args[++i];
			if (nextArg) {
				options.format = nextArg;
			}
		} else if (!arg.startsWith("-")) {
			entrypoints.push(arg);
		}
	}

	return { entrypoints, options };
}

async function main() {
	const { entrypoints, options } = parseArgs(process.argv.slice(2));
	const format = (options.format ??
		process.env.TELESCOPE_FORMAT ??
		"stylish") as keyof typeof formatters;

	if (options.watch) {
		// Watch mode - lint on file changes
		await lint(entrypoints, { cache: options.cache, watch: true });
	} else {
		// One-time lint
		const result = await lint(entrypoints, { cache: options.cache });
		const formatter = formatters[format] ?? formatters.stylish;
		const output = formatter(result.diagnostics);
		process.stdout.write(`${output}\n`);
		if (result.diagnostics.some((d) => d.severity === "error")) {
			process.exitCode = 1;
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
