import { runCiCommand } from "./ci.js";
import { runLintCommand } from "./lint.js";
import { runLspCommand } from "./lsp.js";

function usage(): string {
	return [
		"telescope lint [--workspace <path|file-uri>] [--format json|github] [--root <file-uri>]... [--report-md <path>] [--report-json <path>]",
		"telescope ci [--workspace <path|file-uri>] [--report-md <path>] [--comment-pr] [--comment-review] [--diff-base <ref>] [--diff-head <ref>]",
		"telescope lsp",
		"",
		"Back-compat:",
		"  Running without a subcommand behaves like `telescope lint`.",
		"",
		"Examples:",
		"  bun src/cli/index.ts --workspace . --format github",
		"  bun src/cli/index.ts lint --workspace . --format json",
		"  bun src/cli/index.ts ci --workspace . --report-md telescope-report.md",
		"  node dist/cli.js ci --workspace . --comment-pr --comment-review",
	].join("\n");
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const cmd = argv[0];

	if (cmd === "--help" || cmd === "-h") {
		console.log(usage());
		process.exit(0);
	}

	if (cmd === "lint") {
		await runLintCommand(argv.slice(1));
		return;
	}
	if (cmd === "ci") {
		await runCiCommand(argv.slice(1));
		return;
	}
	if (cmd === "lsp") {
		await runLspCommand(argv.slice(1));
		return;
	}

	// Back-compat: existing callers pass flags only, no subcommand.
	await runLintCommand(argv);
}

main().catch((err) => {
	console.error(
		err instanceof Error ? (err.stack ?? err.message) : String(err),
	);
	process.exit(1);
});
