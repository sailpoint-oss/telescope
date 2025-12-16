import type { Diagnostic as EngineDiagnostic } from "../engine/index.js";
import type { LintRunResult } from "./lint.js";

function severityLabel(sev: number | undefined): string {
	if (sev === 1) return "error";
	if (sev === 2) return "warning";
	if (sev === 3) return "info";
	if (sev === 4) return "hint";
	return "unknown";
}

function diagLine(d: EngineDiagnostic): number {
	return (d.range?.start?.line ?? 0) + 1;
}

function diagCode(d: EngineDiagnostic): string {
	return d.code?.toString() ?? "unknown";
}

function escapeMd(s: string): string {
	// Minimal escaping for tables/text.
	return s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

export function writeMarkdownReport(result: LintRunResult): string {
	const lines: string[] = [];
	const now = new Date().toISOString();

	lines.push("# Telescope report");
	lines.push("");
	lines.push(`- Workspace: \`${result.workspaceFolderUri}\``);
	lines.push(`- Generated: \`${now}\``);
	lines.push(`- Roots: ${result.roots.length}`);
	lines.push(
		`- Diagnostics: ${result.diagnostics.length} (errors: ${result.counts.error}, warnings: ${result.counts.warning}, other: ${result.counts.notice})`,
	);
	lines.push(`- Project hash: \`${result.projectHash}\``);
	lines.push("");

	// Per-file summary
	const byFile = new Map<string, EngineDiagnostic[]>();
	for (const d of result.diagnostics) {
		const arr = byFile.get(d.uri) ?? [];
		arr.push(d);
		byFile.set(d.uri, arr);
	}

	if (byFile.size > 0) {
		lines.push("## Files");
		lines.push("");
		lines.push("| File | Count | Errors | Warnings |");
		lines.push("| --- | ---: | ---: | ---: |");
		const rows = [...byFile.entries()].map(([uri, diags]) => {
			let e = 0;
			let w = 0;
			for (const d of diags) {
				if (d.severity === 1) e++;
				else if (d.severity === 2) w++;
			}
			return { uri, count: diags.length, e, w };
		});
		rows.sort((a, b) => b.count - a.count || a.uri.localeCompare(b.uri));
		for (const r of rows) {
			lines.push(`| \`${r.uri}\` | ${r.count} | ${r.e} | ${r.w} |`);
		}
		lines.push("");
	}

	// Per-rule summary
	if (Object.keys(result.byCode).length > 0) {
		lines.push("## Rules");
		lines.push("");
		lines.push("| Rule | Count |");
		lines.push("| --- | ---: |");
		const rows = Object.entries(result.byCode).sort((a, b) => b[1] - a[1]);
		for (const [code, count] of rows) {
			lines.push(`| \`${code}\` | ${count} |`);
		}
		lines.push("");
	}

	// Full listing
	if (result.diagnostics.length > 0) {
		lines.push("## Diagnostics");
		lines.push("");
		const uris = [...byFile.keys()].sort((a, b) => a.localeCompare(b));
		for (const uri of uris) {
			lines.push(`### \`${uri}\``);
			lines.push("");
			lines.push("| Severity | Line | Code | Message |");
			lines.push("| --- | ---: | --- | --- |");
			const diags = (byFile.get(uri) ?? []).slice().sort((a, b) => {
				return (
					(a.range?.start?.line ?? 0) - (b.range?.start?.line ?? 0) ||
					(a.range?.start?.character ?? 0) - (b.range?.start?.character ?? 0)
				);
			});
			for (const d of diags) {
				lines.push(
					`| ${severityLabel(d.severity)} | ${diagLine(d)} | \`${escapeMd(
						diagCode(d),
					)}\` | ${escapeMd(d.message ?? "")} |`,
				);
			}
			lines.push("");
		}
	}

	return `${lines.join("\n")}\n`;
}

export async function writeJsonReport(
	path: string,
	result: LintRunResult,
): Promise<void> {
	const { writeFile } = await import("node:fs/promises");
	const payload = {
		workspace: result.workspaceFolderUri,
		roots: result.roots,
		diagnosticCount: result.diagnostics.length,
		diagnostics: result.diagnostics,
		counts: result.counts,
		byUri: result.byUri,
		byCode: result.byCode,
		projectHash: result.projectHash,
	};
	await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}


