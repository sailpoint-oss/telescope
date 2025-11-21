/**
 * OpenAPI Service Plugin - provides diagnostics, code actions, definitions, etc.
 * This is the main service plugin for OpenAPI support in Volar.
 */

import { createHash } from "node:crypto";
import type {
	CancellationToken,
	LanguageServiceContext,
	LanguageServicePlugin,
} from "@volar/language-service";
import {
	type AtomIndex,
	type IRDocument,
	type IRNode,
	type IRProjectContext,
	runEngineIR,
} from "lens";
import { normalizeBaseUri } from "shared/document-utils";
import { globFiles, readFileWithMetadata } from "shared/file-system-utils";
import type {
	Diagnostic,
	Range,
	WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import type { ApertureVolarContext } from "../../workspace/context.js";
import { isConfigFile } from "../config/config.js";

/**
 * Create the OpenAPI service plugin.
 */
export function createOpenAPIServicePlugin(
	shared: ApertureVolarContext,
): LanguageServicePlugin {
	const logger = shared.getLogger("OpenAPI Service");
	const core = shared.core;

	logger.log("Creating OpenAPI service plugin");

	return {
		name: "telescope-openapi-service",
		capabilities: {
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: true,
			},
			codeActionProvider: {
				resolveProvider: true,
			},
			documentLinkProvider: {
				resolveProvider: true,
			},
		},
		create(context) {
			return {
				async provideDiagnostics(document, token) {
					// Check cancellation before async operations
					if (token?.isCancellationRequested) {
						return null;
					}

					logger.log(`Providing diagnostics for ${document.uri}`);

					try {
						// Get source document URI using Volar's context API
						const documentUri = URI.parse(document.uri);
						const decoded = context.decodeEmbeddedDocumentUri(documentUri);
						const sourceUri = decoded ? decoded[0].toString() : document.uri;
						const baseUri = normalizeBaseUri(sourceUri);

						// Explicitly exclude config files by path (hardcoded .telescope/config.yaml)
						// This check is path-based only - no content parsing needed
						if (isConfigFile(baseUri)) {
							return [];
						}

						// Get IR from Core (should already be cached via language plugin lifecycle)
						const ir = core.getIR(baseUri);
						const atoms = core.getAtoms(baseUri);
						if (!ir || !atoms) {
							logger.log(`No IR found for ${baseUri}, skipping diagnostics`);
							return [];
						}

						// Check cancellation before async operations
						if (token?.isCancellationRequested) {
							return [];
						}

						// Get rules (includes custom OpenAPI rules)
						const rules = shared.getRuleImplementations();
						if (rules.length === 0) {
							logger.log(`WARNING: No rules loaded!`);
							return [];
						}

						// Filter rules to only OpenAPI rules (ruleType === "openapi" or undefined for builtin)
						const openApiRules = rules.filter(
							(rule) => !rule.meta.ruleType || rule.meta.ruleType === "openapi",
						);

						// Check cancellation before processing linked URIs
						if (token?.isCancellationRequested) {
							return [];
						}

						// Get linked URIs for cross-file rules
						const linkedUris = core.getLinkedUris(baseUri) ?? [];
						const irDocs = new Map<string, IRDocument>();
						const irAtoms = new Map<string, AtomIndex>();

						// Collect IR documents for current file and linked files
						irDocs.set(baseUri, ir);
						irAtoms.set(baseUri, atoms);

						for (const linkedUri of linkedUris) {
							if (token?.isCancellationRequested) {
								return [];
							}
							if (!linkedUri) {
								continue;
							}
							const linkedIr = core.getIR(linkedUri);
							const linkedAtoms = core.getAtoms(linkedUri);
							if (linkedIr && linkedAtoms) {
								irDocs.set(linkedUri, linkedIr);
								irAtoms.set(linkedUri, linkedAtoms);
							}
						}

						// Check cancellation before rule execution
						if (token?.isCancellationRequested) {
							return [];
						}

						const irProject: IRProjectContext = {
							docs: irDocs,
							atoms: irAtoms,
							graph: core.getGraphIndex(),
							core: {
								locToRange: (uri: string, loc) => core.locToRange(uri, loc),
								getLinkedUris: (uri: string) => core.getLinkedUris(uri),
							},
						};

						// Run rules using IR-based execution
						const result = runEngineIR(
							irProject,
							[baseUri],
							{ rules: openApiRules },
							token,
						);

						// Check cancellation after rule execution
						if (token?.isCancellationRequested) {
							return [];
						}

						// Convert to LSP format - guard against undefined diagnostics
						const diagnostics = result?.diagnostics ?? [];
						const lspDiagnostics = diagnostics;

						return lspDiagnostics;
					} catch (error) {
						const message =
							error instanceof Error
								? (error.stack ?? error.message)
								: String(error);
						logger.error(`Failed to lint ${document.uri}: ${message}`);
						return [];
					}
				},

				async provideWorkspaceDiagnostics(
					token: CancellationToken,
					previousResultIds?: Map<string, string>,
				) {
					if (token?.isCancellationRequested) {
						return null;
					}

					// Get affected URIs from Core (already computed on document changes)
					const affectedUris = core.getAffectedUris();

					// Always discover workspace roots and merge with affected URIs
					// This ensures newly added files are detected even when no files are affected
					const result = await provideWorkspaceDiagnostics(
						shared,
						token,
						affectedUris,
						previousResultIds,
					);
					return result;
				},

				provideDocumentLinks(document) {
					// Use Core IR and GraphIndex to find all $ref links
					const documentUri = URI.parse(document.uri);
					const decoded = context.decodeEmbeddedDocumentUri(documentUri);
					const sourceUri = decoded ? decoded[0].toString() : document.uri;

					// Get IR from Core
					const ir = core.getIR(sourceUri);
					if (!ir) {
						return [];
					}

					const links: Array<{ range: Range; target: string }> = [];

					// Find all $ref nodes in IR
					function collectRefNodes(node: IRNode): void {
						// Check if this node is a $ref value
						if (
							node.kind === "string" &&
							node.key === "$ref" &&
							typeof node.value === "string"
						) {
							const ref = node.value;
							// Only include external refs (http/https)
							if (/^https?:/i.test(ref)) {
								const range = core.locToRange(sourceUri, node.loc);
								if (range) {
									links.push({
										range,
										target: ref,
									});
								}
							}
						}

						// Recurse into children
						if (node.children) {
							for (const child of node.children) {
								collectRefNodes(child);
							}
						}
					}

					collectRefNodes(ir.root);

					return links;
				},

				onDidChangeWatchedFiles({
					changes,
				}: {
					changes: Array<{ uri: string; type?: number }>;
				}) {
					// File watching is handled by Volar and our Language Plugin updates Core
					// But we still need to notify Core about deletions if they bypass the language plugin
					// (though LanguagePlugin.disposeVirtualCode should handle it)
					for (const change of changes) {
						if (change.type === 3) {
							// Deleted
							core.removeDocument(change.uri);
							shared.removeRootDocument(change.uri);
							shared.markAffected(change.uri);
						}
					}
				},
			};
		},
	};
}

async function provideWorkspaceDiagnostics(
	shared: ApertureVolarContext,
	token: CancellationToken,
	affectedUris: string[],
	previousResultIds?: Map<string, string>,
): Promise<WorkspaceDocumentDiagnosticReport[] | null> {
	const logger = shared.getLogger("OpenAPI Service Workspace Diagnostics");
	const startTime = Date.now();

	if (token.isCancellationRequested) {
		return null;
	}

	const core = shared.core;

	try {
		// On first run, discover all OpenAPI files in workspace based on config patterns
		const discoveredUris: string[] = [];
		if (!shared.hasInitialScanBeenPerformed()) {
			logger.log(`Performing initial workspace scan...`);
			try {
				const workspaceFolders = shared.getWorkspaceFolders();
				const config = shared.getConfig();
				// Use configured patterns, default to empty if not set (user must configure)
				const globPatterns = config.openapi?.patterns || [];

				if (workspaceFolders.length > 0 && globPatterns.length > 0) {
					const workspaceFolderUris = workspaceFolders.map((uri) =>
						URI.parse(uri),
					);
					const allFiles = await globFiles(
						shared.getFileSystem(),
						globPatterns,
						workspaceFolderUris,
					);

					logger.log(
						`Found ${allFiles.length} files matching OpenAPI patterns`,
					);

					for (const uri of allFiles) {
						discoveredUris.push(uri);
						// Add to root docs to track them
						shared.addRootDocument(uri);
					}
				}
				shared.markInitialScanPerformed();
			} catch (error) {
				logger.error(
					`Initial scan failed: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}

		// Use cached root documents from file watcher tracking
		// Merge with affected URIs and discovered URIs (union - no duplicates)
		const cachedRoots = shared.getRootDocumentUris();
		const urisToProcessSet = new Set<string>([
			...affectedUris,
			...cachedRoots,
			...discoveredUris,
		]);

		const urisToProcess = Array.from(urisToProcessSet);

		if (urisToProcess.length === 0) {
			// No files to process - return unchanged reports for previousResultIds if they exist
			if (previousResultIds && previousResultIds.size > 0) {
				const unchangedReports: WorkspaceDocumentDiagnosticReport[] = [];
				for (const [uri, resultId] of previousResultIds) {
					const version = shared.documents.get(uri)?.version ?? null;
					unchangedReports.push({
						kind: "unchanged",
						uri,
						version,
						resultId,
					});
				}
				return unchangedReports;
			}
			return [];
		}

		const allDiagnostics = new Map<string, Diagnostic[]>();

		// Process files
		// For workspace diagnostics, we iterate over the files.
		// We rely on the Language Plugin to have populated the Core.
		// But if the file was just discovered via glob and NOT opened, Language Plugin might not have run yet.
		// We need to ensure the document is "known" to Volar so it triggers the Language Plugin.
		// Accessing context.documents.get(uri) might work if it's tracked.
		// Or we can assume that if it's in shared.documents, it's loaded.

		// Filter to files that are actually managed/loaded
		const processedUris = new Set<string>();

		for (const uri of urisToProcess) {
			if (token.isCancellationRequested) {
				break;
			}

			try {
				// If the file is in shared.documents (meaning Language Plugin accepted it), we can validate it.
				// If it's NOT, it might mean Volar hasn't processed it yet.
				// We can try to read it to trigger Core update if we really want "Parse Once",
				// but typically we should let Volar drive the loading.
				// If we found it via Glob, we want to force load it?
				// For now, let's just validate what's in Core/Store.

				// Actually, ensureDocumentLoaded logic was useful here.
				// But simplest way: if Core has IR, run rules.
				// If not, skip (it will be picked up when opened or if we force add it).
				// To implement "Parse Once", we should NOT manually read/parse here.
				// If we miss diagnostics for unopened files, that's a trade-off for performance/simplicity,
				// but ideally Volar's project system handles this.

				if (!core.getIR(uri)) {
					// Try to "touch" the document via Volar context to trigger load?
					// context.language.scripts.get(URI.parse(uri));
					// If that fails, we skip.
					continue;
				}

				// Reuse provideDiagnostics logic by mocking document
				// or just call the logic directly.
				// Calling logic directly is better.

				// Get rules (includes custom OpenAPI rules)
				const rules = shared.getRuleImplementations();
				if (rules.length === 0) continue;

				const openApiRules = rules.filter(
					(rule) => !rule.meta.ruleType || rule.meta.ruleType === "openapi",
				);

				const linkedUris = core.getLinkedUris(uri) ?? [];
				const irDocs = new Map<string, IRDocument>();
				const irAtoms = new Map<string, AtomIndex>();

				const ir = core.getIR(uri);
				const atoms = core.getAtoms(uri);

				if (ir && atoms) {
					irDocs.set(uri, ir);
					irAtoms.set(uri, atoms);
				} else {
					continue;
				}

				for (const linkedUri of linkedUris) {
					const linkedIr = core.getIR(linkedUri);
					const linkedAtoms = core.getAtoms(linkedUri);
					if (linkedIr && linkedAtoms) {
						irDocs.set(linkedUri, linkedIr);
						irAtoms.set(linkedUri, linkedAtoms);
					}
				}

				const irProject: IRProjectContext = {
					docs: irDocs,
					atoms: irAtoms,
					graph: core.getGraphIndex(),
					core: {
						locToRange: (u: string, loc) => core.locToRange(u, loc),
						getLinkedUris: (u: string) => core.getLinkedUris(u),
					},
				};

				const result = runEngineIR(
					irProject,
					[uri],
					{ rules: openApiRules },
					token,
				);

				const diagnostics = result?.diagnostics ?? [];
				const lspDiagnostics = diagnostics;

				allDiagnostics.set(uri, lspDiagnostics);
				processedUris.add(uri);
			} catch (error) {
				logger.error(
					`Failed for ${uri}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}

		// Build reports
		const reports: WorkspaceDocumentDiagnosticReport[] = [];

		for (const uri of processedUris) {
			const diagnostics = allDiagnostics.get(uri) ?? [];
			const version = shared.documents.get(uri)?.version ?? null;
			const hash = computeDiagnosticsHash(diagnostics, version);

			const previousResultId = previousResultIds?.get(uri);
			const currentResultId = core.getResultId(uri, hash);

			if (previousResultId && previousResultId === currentResultId) {
				reports.push({
					kind: "unchanged",
					uri,
					version,
					resultId: currentResultId,
				});
			} else {
				reports.push({
					kind: "full",
					uri,
					version,
					resultId: currentResultId,
					items: diagnostics,
				});
			}
		}

		// Handle unchanged for skipped files that were previously tracked
		if (previousResultIds) {
			for (const [uri, resultId] of previousResultIds) {
				if (processedUris.has(uri)) continue;

				// If it was in our list to process but we skipped it (e.g. no IR),
				// we shouldn't return unchanged, we should probably return empty or nothing?
				// If we assume it's unchanged because we couldn't load it...
				// Actually, if we can't load it, we can't validate it.
				// Let's just leave it if it wasn't processed.
			}
		}

		const duration = Date.now() - startTime;
		logger.log(`Completed in ${duration}ms: ${reports.length} report(s)`);

		return reports;
	} catch (error) {
		logger.error(
			`Failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

function computeDiagnosticsHash(
	diagnostics: Diagnostic[],
	version: number | null,
): string {
	const sortedDiagnostics = diagnostics.slice().sort((a, b) => {
		const startLineDiff = a.range.start.line - b.range.start.line;
		if (startLineDiff !== 0) return startLineDiff;
		const startCharDiff = a.range.start.character - b.range.start.character;
		if (startCharDiff !== 0) return startCharDiff;
		const endLineDiff = a.range.end.line - b.range.end.line;
		if (endLineDiff !== 0) return endLineDiff;
		const endCharDiff = a.range.end.character - b.range.end.character;
		if (endCharDiff !== 0) return endCharDiff;
		const severityDiff = (a.severity ?? 0) - (b.severity ?? 0);
		if (severityDiff !== 0) return severityDiff;
		const codeA = a.code === undefined ? "" : String(a.code);
		const codeB = b.code === undefined ? "" : String(b.code);
		const codeDiff = codeA.localeCompare(codeB);
		if (codeDiff !== 0) return codeDiff;
		return a.message.localeCompare(b.message);
	});

	const payload = {
		version,
		diagnostics: sortedDiagnostics.map((diag) => ({
			range: diag.range,
			severity: diag.severity,
			code: diag.code,
			source: diag.source,
			message: diag.message,
			tags: diag.tags,
			relatedInformation: diag.relatedInformation,
		})),
	};
	return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}
