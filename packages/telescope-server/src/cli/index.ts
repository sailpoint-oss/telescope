import { pathToFileURL } from "node:url";
import { URI } from "vscode-uri";
import {
	DocumentTypeCache,
	discoverWorkspaceRoots,
	type Diagnostic as EngineDiagnostic,
	lintDocument,
	materializeRules,
	NodeFileSystem,
	ProjectContextCache,
	type Rule,
	resolveConfig,
	resolveLintingContext,
} from "../engine/index.js";

type OutputFormat = "json" | "github";

function usage(): string {
	return [
		"telescope-server lint [--workspace <path|file-uri>] [--format json|github] [--root <file-uri>]...",
		"",
		"Examples:",
		"  bun src/cli/index.ts --workspace . --format json",
		"  bun src/cli/index.ts --workspace . --format github",
		"  bun src/cli/index.ts --root file:///path/to/api.yaml --format json",
	].join("\n");
}

function parseArgs(argv: string[]): {
	workspace: string;
	format: OutputFormat;
	roots: string[];
} {
	let workspace = process.cwd();
	let format: OutputFormat = "json";
	const roots: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;
		if (a === "--help" || a === "-h") {
			console.log(usage());
			process.exit(0);
		}
		if (a === "--workspace") {
			const v = argv[i + 1];
			if (!v) throw new Error("--workspace requires a value");
			workspace = v;
			i++;
			continue;
		}
		if (a === "--format") {
			const v = argv[i + 1];
			if (v !== "json" && v !== "github") {
				throw new Error(`--format must be one of: json, github`);
			}
			format = v;
			i++;
			continue;
		}
		if (a === "--root") {
			const v = argv[i + 1];
			if (!v) throw new Error("--root requires a file URI");
			roots.push(v);
			i++;
		}
	}

	return { workspace, format, roots };
}

function toWorkspaceFolderUri(workspace: string): string {
	if (workspace.startsWith("file://")) return workspace;
	return pathToFileURL(workspace).toString();
}

function compareEngineDiagnostics(
	a: EngineDiagnostic,
	b: EngineDiagnostic,
): number {
	if (a.uri !== b.uri) return a.uri.localeCompare(b.uri);
	if (a.range.start.line !== b.range.start.line)
		return a.range.start.line - b.range.start.line;
	if (a.range.start.character !== b.range.start.character) {
		return a.range.start.character - b.range.start.character;
	}
	const aCode = a.code?.toString() ?? "";
	const bCode = b.code?.toString() ?? "";
	if (aCode !== bCode) return aCode.localeCompare(bCode);
	if (a.message !== b.message) return a.message.localeCompare(b.message);
	return (a.severity ?? 0) - (b.severity ?? 0);
}

function toGithubAnnotation(d: EngineDiagnostic): string {
	// GitHub Actions annotations use 1-based line/col.
	const uri = URI.parse(d.uri);
	const file = uri.scheme === "file" ? uri.fsPath : d.uri;
	const line = d.range.start.line + 1;
	const col = d.range.start.character + 1;
	const severity =
		d.severity === 1 ? "error" : d.severity === 2 ? "warning" : "notice";
	const msg = (d.message ?? "").replace(/\r?\n/g, " ");
	return `::${severity} file=${file},line=${line},col=${col}::${msg}`;
}

async function main(): Promise<void> {
	const {
		workspace,
		format,
		roots: explicitRoots,
	} = parseArgs(process.argv.slice(2));
	const workspaceFolderUri = toWorkspaceFolderUri(workspace);
	const workspacePath = URI.parse(workspaceFolderUri).fsPath;

	const fileSystem = new NodeFileSystem();
	const docCache = new DocumentTypeCache();
	const projectCache = new ProjectContextCache();

	// Load config + rules from the workspace (same behavior as LSP).
	const config = resolveConfig(workspacePath);
	const rules = (await materializeRules(config, workspacePath)).map(
		(r) => r.rule,
	) as Rule[];

	const rootUris =
		explicitRoots.length > 0
			? explicitRoots
			: await discoverWorkspaceRoots(
					[workspaceFolderUri],
					fileSystem,
					docCache,
				);

	const allDiagnostics: EngineDiagnostic[] = [];

	for (const rootUri of rootUris) {
		const ctx = await resolveLintingContext(
			rootUri,
			fileSystem,
			[workspaceFolderUri],
			docCache,
			projectCache,
		);
		const diags = await lintDocument(ctx, fileSystem, rules);
		allDiagnostics.push(...diags);
	}

	allDiagnostics.sort(compareEngineDiagnostics);

	if (format === "github") {
		for (const d of allDiagnostics) {
			console.log(toGithubAnnotation(d));
		}
		return;
	}

	// JSON output (stable, machine-readable)
	const json = {
		workspace: workspaceFolderUri,
		roots: rootUris,
		diagnosticCount: allDiagnostics.length,
		diagnostics: allDiagnostics,
	};
	process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
}

main().catch((err) => {
	console.error(
		err instanceof Error ? (err.stack ?? err.message) : String(err),
	);
	process.exit(1);
});
