import path from "node:path";
import { URI } from "vscode-uri";
import type { Diagnostic as EngineDiagnostic } from "../engine/index.js";

export interface GatingResult {
	hasGlobalErrors: boolean;
	hasChangedFileWarnOrError: boolean;
	changedFileCounts: { error: number; warning: number; other: number; total: number };
}

export function repoRelativePathFromDiagnostic(
	d: EngineDiagnostic,
	workspacePath: string,
): string | null {
	try {
		const uri = URI.parse(d.uri);
		if (uri.scheme !== "file") return null;
		const rel = path.relative(workspacePath, uri.fsPath);
		return rel.replace(/\\/g, "/");
	} catch {
		return null;
	}
}

export function computeGates(opts: {
	diagnostics: EngineDiagnostic[];
	workspacePath: string;
	changedFiles?: Set<string>;
}): GatingResult {
	const hasGlobalErrors = opts.diagnostics.some((d) => d.severity === 1);

	let changedError = 0;
	let changedWarning = 0;
	let changedOther = 0;
	let changedTotal = 0;

	let hasChangedFileWarnOrError = false;
	if (opts.changedFiles && opts.changedFiles.size > 0) {
		for (const d of opts.diagnostics) {
			const rel = repoRelativePathFromDiagnostic(d, opts.workspacePath);
			if (!rel) continue;
			if (!opts.changedFiles.has(rel)) continue;

			changedTotal++;
			if (d.severity === 1) changedError++;
			else if (d.severity === 2) changedWarning++;
			else changedOther++;
		}
		hasChangedFileWarnOrError = changedError > 0 || changedWarning > 0;
	}

	return {
		hasGlobalErrors,
		hasChangedFileWarnOrError,
		changedFileCounts: {
			error: changedError,
			warning: changedWarning,
			other: changedOther,
			total: changedTotal,
		},
	};
}


