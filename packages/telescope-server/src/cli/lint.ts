import { pathToFileURL } from "node:url";
import { appendFile, writeFile } from "node:fs/promises";
import { URI } from "vscode-uri";
import {
	DocumentTypeCache,
	type Diagnostic as EngineDiagnostic,
	materializeRules,
	NodeFileSystem,
	ProjectContextCache,
	type Rule,
	resolveConfig,
} from "../engine/index.js";
import { hasErrorDiagnostics, lintWorkspace } from "../core/workspace-analyzer.js";
import { writeJsonReport, writeMarkdownReport } from "./report.js";

export type OutputFormat = "json" | "github";

export interface LintCommandArgs {
	workspace: string;
	format: OutputFormat;
	roots: string[];
	summary: boolean;
	reportMdPath?: string;
	reportJsonPath?: string;
}

export interface LintRunResult {
	workspaceFolderUri: string;
	workspacePath: string;
	roots: string[];
	diagnostics: EngineDiagnostic[];
	counts: { error: number; warning: number; notice: number };
	byUri: Record<string, number>;
	byCode: Record<string, number>;
	projectHash: string;
}

export function parseLintArgs(argv: string[]): LintCommandArgs {
	let workspace = process.cwd();
	let format: OutputFormat = "json";
	const roots: string[] = [];
	let summary = true;
	let reportMdPath: string | undefined;
	let reportJsonPath: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (!a) continue;

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
				throw new Error("--format must be one of: json, github");
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
			continue;
		}
		if (a === "--summary") {
			summary = true;
			continue;
		}
		if (a === "--no-summary") {
			summary = false;
			continue;
		}
		if (a === "--report-md") {
			const v = argv[i + 1];
			if (!v) throw new Error("--report-md requires a path");
			reportMdPath = v;
			i++;
			continue;
		}
		if (a === "--report-json") {
			const v = argv[i + 1];
			if (!v) throw new Error("--report-json requires a path");
			reportJsonPath = v;
			i++;
			continue;
		}
		if (a === "--help" || a === "-h") {
			// index.ts prints global usage
			process.exit(0);
		}
	}

	return { workspace, format, roots, summary, reportMdPath, reportJsonPath };
}

export function toWorkspaceFolderUri(workspace: string): string {
	if (workspace.startsWith("file://")) return workspace;
	return pathToFileURL(workspace).toString();
}

export function toGithubAnnotation(d: EngineDiagnostic): string {
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

export async function runLint(args: LintCommandArgs): Promise<LintRunResult> {
	const workspaceFolderUri = toWorkspaceFolderUri(args.workspace);
	const workspacePath = URI.parse(workspaceFolderUri).fsPath;

	const fileSystem = new NodeFileSystem();
	const docCache = new DocumentTypeCache();
	const projectCache = new ProjectContextCache();

	const config = resolveConfig(workspacePath);
	const rules = (await materializeRules(config, workspacePath)).map(
		(r) => r.rule,
	) as Rule[];

	const result = await lintWorkspace({
		workspaceFolderUri,
		workspacePath,
		fileSystem,
		rules,
		openapiPatterns: config.openapi?.patterns,
		roots: args.roots.length > 0 ? args.roots : undefined,
		docTypeCache: docCache,
		projectCache,
	});

	return {
		workspaceFolderUri,
		workspacePath,
		roots: result.roots,
		diagnostics: result.diagnostics,
		counts: result.counts,
		byUri: result.byUri,
		byCode: result.byCode,
		projectHash: result.projectHash,
	};
}

export async function maybeWriteGithubSummary(result: {
	workspaceFolderUri: string;
	roots: string[];
	diagnostics: EngineDiagnostic[];
	counts: { error: number; warning: number; notice: number };
	byUri: Record<string, number>;
	byCode: Record<string, number>;
	extraLines?: string[];
}): Promise<void> {
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (!summaryPath) return;

	const { error, warning, notice } = result.counts;
	const total = result.diagnostics.length;

	const topFiles = Object.entries(result.byUri)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10);
	const topRules = Object.entries(result.byCode)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10);

	const lines: string[] = [];
	lines.push("## Telescope lint");
	lines.push("");
	lines.push(`- Workspace: \`${result.workspaceFolderUri}\``);
	lines.push(`- Roots: ${result.roots.length}`);
	lines.push(
		`- Diagnostics: ${total} (errors: ${error}, warnings: ${warning}, other: ${notice})`,
	);
	if (result.extraLines && result.extraLines.length > 0) {
		for (const l of result.extraLines) lines.push(`- ${l}`);
	}
	lines.push("");

	if (topFiles.length > 0) {
		lines.push("### Top files");
		lines.push("");
		lines.push("| File | Count |");
		lines.push("| --- | ---: |");
		for (const [uri, count] of topFiles) {
			lines.push(`| \`${uri}\` | ${count} |`);
		}
		lines.push("");
	}

	if (topRules.length > 0) {
		lines.push("### Top rules");
		lines.push("");
		lines.push("| Rule | Count |");
		lines.push("| --- | ---: |");
		for (const [code, count] of topRules) {
			lines.push(`| \`${code}\` | ${count} |`);
		}
		lines.push("");
	}

	const content = `${lines.join("\n")}\n`;
	await appendFile(summaryPath, `${content}\n`, { encoding: "utf8" });
}

export async function runLintCommand(argv: string[]): Promise<void> {
	const args = parseLintArgs(argv);
	const result = await runLint(args);

	if (args.format === "github") {
		for (const d of result.diagnostics) console.log(toGithubAnnotation(d));
		if (args.summary) await maybeWriteGithubSummary(result);

		// Back-compat: lint command only fails on errors.
		if (hasErrorDiagnostics(result.diagnostics)) process.exitCode = 1;
	} else {
		const json = {
			workspace: result.workspaceFolderUri,
			roots: result.roots,
			diagnosticCount: result.diagnostics.length,
			diagnostics: result.diagnostics,
			counts: result.counts,
			projectHash: result.projectHash,
		};
		process.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
		if (hasErrorDiagnostics(result.diagnostics)) process.exitCode = 1;
	}

	if (args.reportJsonPath) {
		await writeJsonReport(args.reportJsonPath, result);
	}
	if (args.reportMdPath) {
		const md = writeMarkdownReport(result);
		await writeFile(args.reportMdPath, md, "utf8");
	}
}


