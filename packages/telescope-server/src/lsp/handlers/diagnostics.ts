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
import type {
	Diagnostic,
	DocumentDiagnosticReport,
	WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type {
	Diagnostic as EngineDiagnostic,
	Rule,
} from "../../engine/index.js";
import { lintDocument } from "../../engine/index.js";
import type { TelescopeContext } from "../context.js";
import type { DiagnosticsScheduler } from "../services/diagnostics-scheduler.js";
import { isConfigFile } from "../utils.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";

/**
 * Register diagnostic handlers on the connection.
 */
export function registerDiagnosticHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	ctx: TelescopeContext,
	getProject: () => WorkspaceProject,
	scheduler: DiagnosticsScheduler,
): void {
	const logger = ctx.getLogger("Diagnostics");

	// Pull-based diagnostics (LSP 3.17+)
	connection.languages.diagnostics.on(async (params) => {
		await ctx.rulesLoadPromise;

		const uri = params.textDocument.uri;
		if (isConfigFile(uri)) {
			return { kind: "full", items: [] } as DocumentDiagnosticReport;
		}

		try {
			const rules = ctx.getRules();
			const project = getProject();
			const openDoc = documents.get(uri);

			const computed = await scheduler.getOrComputeDocumentDiagnostics({
				uri,
				previousResultId: params.previousResultId,
				content: openDoc?.getText(),
				fileSystem: project.getFileSystem(),
				compute: async () =>
					await computeDocumentDiagnostics(uri, openDoc, project, rules),
			});

			if (computed.kind === "unchanged") {
				return {
					kind: "unchanged",
					resultId: computed.resultId ?? params.previousResultId,
				} as DocumentDiagnosticReport;
			}

			return {
				kind: "full",
				resultId: computed.resultId,
				items: computed.items,
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
		const project = getProject();
		const rootUris = await project.getRootUris();
		const rulesSignature = computeRulesSignature(rules);

		logger.log(`Workspace diagnostics for ${rootUris.length} root(s)`);

		const byUri = new Map<string, Diagnostic[]>();

		for (const rootUri of rootUris) {
			try {
				const snapshot = await scheduler.getOrComputeRootDiagnostics({
					rootUri,
					rulesSignature,
					fileSystem: project.getFileSystem(),
					resolveContext: async () =>
						await project.resolveLintingContext(rootUri),
					token,
					rules,
					toLspDiagnostic,
					compareDiagnostics,
				});

				for (const [uri, items] of snapshot.byUri) {
					const list = byUri.get(uri) ?? [];
					list.push(...items);
					byUri.set(uri, list);
				}
			} catch (error) {
				logger.error(
					`Failed workspace diagnostics for root ${rootUri}: ${error instanceof Error ? error.message : String(error)}`,
				);
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

async function computeDocumentDiagnostics(
	uri: string,
	openDoc: TextDocument | undefined,
	project: WorkspaceProject,
	rules: Rule[],
): Promise<Diagnostic[]> {
	const openDocs = new Map<string, string>();

	// Overlay open buffer content (if available) so results match the editor.
	if (openDoc) {
		openDocs.set(openDoc.uri, openDoc.getText());
	}

	const fs =
		openDocs.size > 0
			? project.createOverlayFileSystem(openDocs)
			: project.getFileSystem();

	// Avoid poisoning the shared project cache with ephemeral in-memory content.
	const useProjectCache = openDocs.size === 0;

	const lintingContext = await project.resolveLintingContext(uri, fs, {
		useProjectCache,
	});

	const engineDiags = await lintDocument(lintingContext, fs, rules);
	const normalizedTarget = normalizeUriString(uri);

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
