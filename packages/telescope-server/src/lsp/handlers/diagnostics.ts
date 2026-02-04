/**
 * Diagnostics Handler
 *
 * Provides document and workspace diagnostics for OpenAPI documents.
 *
 * This implementation is **root-centric**:
 * - Cross-file rules always run in the context of a **root OpenAPI document** (entrypoint),
 *   similar to how TypeScript runs checks within a program built from entry points.
 * - Workspace diagnostics run off root documents and their reachable `$ref` graphs.
 *
 * @module lsp/handlers/diagnostics
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type {
	Diagnostic,
	DocumentDiagnosticReport,
	WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type {
	ConfiguredSeverity,
	Diagnostic as EngineDiagnostic,
	Rule,
} from "../../engine/index.js";
import { lintDocument } from "../../engine/index.js";
import type { TelescopeContext } from "../context.js";
import type { DocumentCache, ParseError } from "../document-cache.js";
import type { DiagnosticsScheduler } from "../services/diagnostics-scheduler.js";
import { isCancelledError } from "../services/diagnostics-scheduler.js";
import { isConfigFile } from "../utils.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

export interface OpenApiScope {
	isOpenApiInScope(uri: string): boolean;
}

/**
 * Convert parse errors to LSP diagnostics.
 */
function parseErrorsToDiagnostics(errors: ParseError[]): Diagnostic[] {
	return errors.map((error) => ({
		message: error.message,
		range: {
			start: {
				line: error.line ?? 0,
				character: error.column ?? 0,
			},
			end: {
				line: error.endLine ?? error.line ?? 0,
				character: error.endColumn ?? error.column ?? 0,
			},
		},
		severity: DiagnosticSeverity.Error,
		source: "telescope",
		code: "parse-error",
	}));
}

/**
 * Register diagnostic handlers on the connection.
 */
export function registerDiagnosticHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	ctx: TelescopeContext,
	getProject: () => WorkspaceProject,
	scheduler: DiagnosticsScheduler,
	cache?: DocumentCache,
): void {
	const logger = ctx.getLogger("Diagnostics");

	// Maintain a stable map of open documents -> current text to avoid rebuilding it per request.
	const openDocsMap = new Map<string, string>();
	for (const d of documents.all()) {
		openDocsMap.set(d.uri, d.getText());
	}
	documents.onDidOpen((e) => {
		openDocsMap.set(e.document.uri, e.document.getText());
	});
	documents.onDidChangeContent((e) => {
		openDocsMap.set(e.document.uri, e.document.getText());
	});
	documents.onDidClose((e) => {
		openDocsMap.delete(e.document.uri);
	});

	// Pull-based diagnostics (LSP 3.17+)
	connection.languages.diagnostics.on(async (params) => {
		await ctx.rulesLoadPromise;

		const uri = params.textDocument.uri;
		if (isConfigFile(uri)) {
			return { kind: "full", items: [] } as DocumentDiagnosticReport;
		}

		try {
			const rules = ctx.getRules();
			const severityOverrides = ctx.getSeverityOverrides();
			const project = getProject();
			const openDoc = documents.get(uri);

			// Get parse errors from the document cache if available
			let parseErrorDiags: Diagnostic[] = [];
			if (cache && openDoc) {
				const cached = cache.get(openDoc);
				if (cached.parseErrors.length > 0) {
					parseErrorDiags = parseErrorsToDiagnostics(cached.parseErrors);
				}
			}

			// Create overlay FS once and reuse for both scheduler and compute
			const fs =
				openDocsMap.size > 0
					? project.createOverlayFileSystem(openDocsMap)
					: project.getFileSystem();

			const computed = await scheduler.getOrComputeDocumentDiagnostics({
				uri,
				previousResultId: params.previousResultId,
				content: openDoc?.getText(),
				fileSystem: fs,
				compute: async () =>
					await computeDocumentDiagnostics(
						uri,
						openDoc,
						openDocsMap,
						project,
						rules,
						ctx,
						fs, // Pass pre-created FS to avoid duplicate creation
						undefined, // token
						severityOverrides,
					),
			});

			if (computed.kind === "unchanged" && parseErrorDiags.length === 0) {
				return {
					kind: "unchanged",
					resultId: computed.resultId ?? params.previousResultId,
				} as DocumentDiagnosticReport;
			}

			// Combine parse errors with computed diagnostics
			const allItems = [...parseErrorDiags, ...computed.items];

			return {
				kind: "full",
				resultId: computed.resultId,
				items: allItems,
			} as DocumentDiagnosticReport;
		} catch (error) {
			logger.error(
				`Failed to compute diagnostics: ${error instanceof Error ? error.message : String(error)}`,
			);
			return { kind: "full", items: [] } as DocumentDiagnosticReport;
		}
	});

	// Workspace diagnostics
	connection.languages.diagnostics.onWorkspace(async (_params, token) => {
		await ctx.rulesLoadPromise;

		const rules = ctx.getRules();
		const severityOverrides = ctx.getSeverityOverrides();
		const project = getProject();
		const rootUris = await project.getRootUris();
		const rulesSignature = computeRulesSignature(rules);

		logger.log(`Workspace diagnostics for ${rootUris.length} root(s)`);

		const fs =
			openDocsMap.size > 0
				? project.createOverlayFileSystem(openDocsMap)
				: project.getFileSystem();
		const useProjectCache = openDocsMap.size === 0;

		const byUri = new Map<string, Diagnostic[]>();

		// Create progress reporter for large workspaces (3+ roots)
		let progress: Awaited<ReturnType<typeof connection.window.createWorkDoneProgress>> | undefined;
		if (rootUris.length >= 3) {
			try {
				progress = await connection.window.createWorkDoneProgress();
				progress.begin("Analyzing OpenAPI workspace", 0, undefined, true);
			} catch {
				// Client may not support progress - that's fine, proceed without it
				progress = undefined;
			}
		}

		let completedRoots = 0;
		const totalRoots = rootUris.length;

		// Process roots in parallel - the scheduler handles concurrency limiting internally.
		// Each root computation is independent, so we can submit them all at once.
		const rootPromises = rootUris.map(async (rootUri) => {
			if (token?.isCancellationRequested) {
				return null;
			}
			try {
				const result = await scheduler.getOrComputeRootDiagnostics({
					rootUri,
					rulesSignature,
					fileSystem: fs,
					resolveContext: async () =>
						await project.resolveLintingContext(rootUri, fs, { useProjectCache, token }),
					token,
					rules,
					severityOverrides,
					toLspDiagnostic,
					compareDiagnostics,
				});

				// Report progress
				completedRoots++;
				if (progress && totalRoots > 0) {
					const percentage = Math.round((completedRoots / totalRoots) * 100);
					progress.report(percentage, `Analyzing root ${completedRoots}/${totalRoots}`);
				}

				return result;
			} catch (error) {
				completedRoots++;
				if (token?.isCancellationRequested || isCancelledError(error)) {
					return null;
				}
				logger.error(
					`Failed workspace diagnostics for root ${rootUri}: ${error instanceof Error ? error.message : String(error)}`,
				);
				return null;
			}
		});

		// Wait for all roots to complete and merge results
		const snapshots = await Promise.all(rootPromises);

		// End progress reporting
		if (progress) {
			progress.done();
		}

		for (const snapshot of snapshots) {
			if (!snapshot) continue;
			for (const [uri, items] of snapshot.byUri) {
				const list = byUri.get(uri) ?? [];
				list.push(...items);
				byUri.set(uri, list);
			}
		}

		// Stable ordering: URI then range then code.
		const uris = Array.from(byUri.keys()).sort();
		const reports: WorkspaceDocumentDiagnosticReport[] = uris.map((uri) => {
			const items = dedupeDiagnostics(byUri.get(uri) ?? []).sort(
				compareDiagnostics,
			);
			const openDoc = documents.get(uri);
			return {
				kind: "full",
				uri,
				version: openDoc?.version ?? null,
				items,
			};
		});

		return { items: reports };
	});
}

export async function computeDocumentDiagnostics(
	uri: string,
	openDoc: TextDocument | undefined,
	openDocs: Map<string, string>,
	project: WorkspaceProject,
	rules: Rule[],
	scope: OpenApiScope,
	/** Pre-created FileSystem to avoid duplicate overlay creation. */
	fileSystemOverride?: import("../../engine/fs-types.js").FileSystem,
	/** Optional cancellation token for early termination. */
	token?: import("../../engine/index.js").CancellationToken,
	/** Optional severity overrides from configuration. */
	severityOverrides?: Map<string, ConfiguredSeverity>,
): Promise<Diagnostic[]> {
	// Defensive fallback for callers that have no tracked open docs map.
	if (openDocs.size === 0 && openDoc) {
		openDocs = new Map([[openDoc.uri, openDoc.getText()]]);
	}

	// Use provided FS or create one (avoids duplicate overlay creation when called from scheduler)
	const fs =
		fileSystemOverride ??
		(openDocs.size > 0
			? project.createOverlayFileSystem(openDocs)
			: project.getFileSystem());

	// Avoid poisoning the shared project cache with ephemeral in-memory content.
	const useProjectCache = openDocs.size === 0 && !fileSystemOverride;

	const lintingContext = await project.resolveLintingContext(uri, fs, {
		useProjectCache,
		token,
	});

	// Scope gating:
	// - Out-of-scope standalone files should not produce OpenAPI diagnostics.
	// - Out-of-scope roots should not produce OpenAPI diagnostics (enforces openapi.patterns).
	// - Out-of-scope fragments that are reached from an in-scope root via $ref are still allowed.
	const inScope = scope.isOpenApiInScope(uri);
	const normalizedTarget = normalizeUriString(uri);
	if (!inScope) {
		// Not connected to any root: treat as non-OpenAPI for diagnostics purposes.
		if (lintingContext.mode === "fragment") {
			return [];
		}
		// If the file is itself a root (linting context rootUris points at the target),
		// enforce that roots must be in-scope.
		const rootUris = (lintingContext.rootUris ?? []).map(normalizeUriString);
		if (rootUris.includes(normalizedTarget)) {
			return [];
		}
	}

	const engineDiags = await lintDocument(lintingContext, fs, rules, severityOverrides);

	return engineDiags
		.filter((d) => normalizeUriString(d.uri) === normalizedTarget)
		.map(toLspDiagnostic)
		.sort(compareDiagnostics);
}

function toLspDiagnostic(diag: EngineDiagnostic): Diagnostic {
	return {
		message: diag.message,
		range: diag.range,
		severity: diag.severity,
		source: diag.source ?? "telescope",
		code: diag.code,
		codeDescription: diag.codeDescription,
		relatedInformation: diag.relatedInformation,
		// Forward arbitrary data for powering code actions.
		data: (diag as unknown as { data?: unknown }).data,
	};
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
	if (a.range.start.line !== b.range.start.line) {
		return a.range.start.line - b.range.start.line;
	}
	if (a.range.start.character !== b.range.start.character) {
		return a.range.start.character - b.range.start.character;
	}
	const aCode = a.code?.toString() ?? "";
	const bCode = b.code?.toString() ?? "";
	if (aCode !== bCode) return aCode.localeCompare(bCode);
	if (a.message !== b.message) return a.message.localeCompare(b.message);
	return (a.severity ?? 0) - (b.severity ?? 0);
}

function normalizeUriString(uri: string): string {
	// Drop fragments so the same file compares equal.
	try {
		// `URI.parse` handles file:// URIs and other schemes.
		return URI.parse(uri).with({ fragment: undefined }).toString();
	} catch {
		const hashIdx = uri.indexOf("#");
		return hashIdx === -1 ? uri : uri.slice(0, hashIdx);
	}
}

function dedupeDiagnostics(items: Diagnostic[]): Diagnostic[] {
	const seen = new Set<string>();
	const out: Diagnostic[] = [];
	for (const d of items) {
		const code = d.code?.toString() ?? "";
		const key = [
			d.range.start.line,
			d.range.start.character,
			d.range.end.line,
			d.range.end.character,
			d.severity ?? "",
			code,
			d.message,
		].join("|");
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(d);
	}
	return out;
}

function computeRulesSignature(rules: Rule[]): string {
	// Create a stable signature that changes when rules list changes.
	const parts: string[] = [];
	for (const r of rules) {
		parts.push(r.meta?.id ?? "rule");
	}
	parts.sort();
	return parts.join("|");
}
