import { createHash } from "node:crypto";
import type { FileSystem } from "../engine/fs-types.js";
import type {
	Diagnostic as EngineDiagnostic,
	Rule,
} from "../engine/index.js";
import {
	DocumentTypeCache,
	ProjectContextCache,
	discoverWorkspaceRoots,
	lintDocument,
	resolveLintingContext,
} from "../engine/index.js";

export interface WorkspaceAnalyzerOptions {
	workspaceFolderUri: string;
	/**
	 * Workspace filesystem path (used for config/rules loading by callers, if desired).
	 * Not required for linting if rules are already provided.
	 */
	workspacePath?: string;
	fileSystem: FileSystem;
	rules: Rule[];
	/**
	 * Optional explicit roots. If omitted, roots will be discovered.
	 */
	roots?: string[];
	/**
	 * Optional OpenAPI glob patterns (workspace-relative). When provided, root discovery
	 * and context resolution will be scoped to these patterns (matching LSP behavior).
	 */
	openapiPatterns?: string[];
	/**
	 * Optional shared caches (recommended for long-lived processes like LSP).
	 */
	docTypeCache?: DocumentTypeCache;
	projectCache?: ProjectContextCache;
}

export interface WorkspaceLintCounts {
	error: number;
	warning: number;
	notice: number;
}

export interface WorkspaceLintResult {
	workspaceFolderUri: string;
	roots: string[];
	diagnostics: EngineDiagnostic[];
	counts: WorkspaceLintCounts;
	/**
	 * Stable fingerprint of the analyzed project inputs (roots + doc hashes).
	 * Useful for caching / “unchanged” detection at higher layers.
	 */
	projectHash: string;
	/**
	 * Counts per file URI.
	 */
	byUri: Record<string, number>;
	/**
	 * Counts per rule code/id (best-effort).
	 */
	byCode: Record<string, number>;
}

export async function lintWorkspace(
	options: WorkspaceAnalyzerOptions,
): Promise<WorkspaceLintResult> {
	const docTypeCache = options.docTypeCache ?? new DocumentTypeCache();
	const projectCache = options.projectCache ?? new ProjectContextCache();

	const roots =
		options.roots && options.roots.length > 0
			? options.roots
			: await discoverWorkspaceRoots(
					[options.workspaceFolderUri],
					options.fileSystem,
					docTypeCache,
					options.openapiPatterns,
				);

	const diagnostics: EngineDiagnostic[] = [];

	for (const rootUri of roots) {
		const ctx = await resolveLintingContext(
			rootUri,
			options.fileSystem,
			[options.workspaceFolderUri],
			docTypeCache,
			projectCache,
			{ openapiPatterns: options.openapiPatterns },
		);
		const diags = await lintDocument(ctx, options.fileSystem, options.rules);
		diagnostics.push(...diags);
	}

	diagnostics.sort(compareEngineDiagnostics);

	const counts = countSeverities(diagnostics);
	const { byUri, byCode } = countByUriAndCode(diagnostics);
	const projectHash = computeProjectHashFromDiagnosticsInputs(roots, diagnostics);

	return {
		workspaceFolderUri: options.workspaceFolderUri,
		roots,
		diagnostics,
		counts,
		projectHash,
		byUri,
		byCode,
	};
}

export function countSeverities(diags: EngineDiagnostic[]): WorkspaceLintCounts {
	let error = 0;
	let warning = 0;
	let notice = 0;
	for (const d of diags) {
		// LSP severities: 1=Error, 2=Warning, 3=Information, 4=Hint
		if (d.severity === 1) error++;
		else if (d.severity === 2) warning++;
		else notice++;
	}
	return { error, warning, notice };
}

export function hasErrorDiagnostics(diags: EngineDiagnostic[]): boolean {
	return diags.some((d) => d.severity === 1);
}

export function compareEngineDiagnostics(
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

function countByUriAndCode(diags: EngineDiagnostic[]): {
	byUri: Record<string, number>;
	byCode: Record<string, number>;
} {
	const byUri: Record<string, number> = {};
	const byCode: Record<string, number> = {};

	for (const d of diags) {
		byUri[d.uri] = (byUri[d.uri] ?? 0) + 1;
		const code = d.code?.toString() ?? "unknown";
		byCode[code] = (byCode[code] ?? 0) + 1;
	}

	return { byUri, byCode };
}

function computeProjectHashFromDiagnosticsInputs(
	roots: string[],
	diags: EngineDiagnostic[],
): string {
	// Best-effort “project signature”: roots + (uri + code + range + message).
	// This is stable across runs and good enough for caching at higher layers.
	// (We can later upgrade to hashing doc content hashes from ProjectContext.)
	const hash = createHash("sha1");
	const pairs: string[] = [];
	for (const r of roots) pairs.push(`root:${r}`);
	for (const d of diags) {
		pairs.push(
			[
				d.uri,
				d.code?.toString() ?? "",
				d.range.start.line,
				d.range.start.character,
				d.range.end.line,
				d.range.end.character,
				d.message ?? "",
			].join("|"),
		);
	}
	pairs.sort();
	for (const p of pairs) {
		hash.update(p);
		hash.update("\n");
	}
	return hash.digest("hex").substring(0, 16);
}


