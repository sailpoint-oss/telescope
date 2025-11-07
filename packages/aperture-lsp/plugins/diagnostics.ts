import type {
	CancellationToken,
	LanguageServiceContext,
	LanguageServicePlugin,
} from "@volar/language-service";
import { lintDocument, resolveLintingContext } from "lens";
import type {
	Diagnostic as VsDiagnostic,
	WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import type { ApertureVolarContext } from "../context.js";
import type { SnapshotLike } from "../documents.js";
import { toLspDiagnostic } from "../shared/diagnostic-converter.js";

export function createDiagnosticsPlugin(
	shared: ApertureVolarContext,
): LanguageServicePlugin {
	const logger = shared.getLogger();
	logger.log(`[Diagnostics Plugin] Creating diagnostics plugin`);
	return {
		name: "telescope-openapi-diagnostics",
		capabilities: {
			diagnosticProvider: {
				interFileDependencies: true,
				workspaceDiagnostics: true, // Enable workspace-wide diagnostics
			},
		},
		create(context) {
			logger.log(
				`[Diagnostics Plugin] Plugin create() method called - service instance created`,
			);
			return {
				provideDiagnostics(document, token) {
					logger.log(
						`[Diagnostics Plugin] provideDiagnostics called for: ${document.uri}`,
					);
					return provideDocumentDiagnostics(shared, context, document, token);
				},
				provideWorkspaceDiagnostics(token) {
					logger.log(`[Diagnostics Plugin] provideWorkspaceDiagnostics called`);
					return provideWorkspaceDiagnostics(shared, context, token);
				},
			};
		},
	};
}

async function provideDocumentDiagnostics(
	shared: ApertureVolarContext,
	context: LanguageServiceContext,
	document: TextDocument,
	token: CancellationToken,
): Promise<VsDiagnostic[]> {
	const logger = shared.getLogger();
	logger.log(
		`[Diagnostics] provideDocumentDiagnostics called for: ${document.uri}`,
	);

	if (token.isCancellationRequested) {
		logger.log(`[Diagnostics] Request cancelled for: ${document.uri}`);
		return [];
	}

	updateSnapshot(shared, document);

	try {
		// Decode virtual URI to get source document URI
		const documentUri = URI.parse(document.uri);
		const decoded = context.decodeEmbeddedDocumentUri(documentUri);
		const sourceUri = decoded ? decoded[0].toString() : document.uri;

		if (decoded) {
			logger.log(
				`[Diagnostics] Decoded virtual URI: ${document.uri} -> ${sourceUri} (embedded: ${decoded[1]})`,
			);
		}

		// Normalize to base file URI (strip hash/query)
		const baseUri = normalizeBaseUri(sourceUri);
		logger.log(`[Diagnostics] Normalized base URI: ${baseUri}`);

		logger.log(
			`[Diagnostics] Resolving linting context for: ${baseUri} (workspace folders: ${shared.getWorkspaceFolders().length}, entrypoints: ${shared.getEntrypointUris().length})`,
		);
		const lintContext = await resolveLintingContext(
			baseUri,
			shared.getHost(),
			shared.getWorkspaceFolders(),
			shared.getEntrypointUris(),
			shared.documentCache,
		);
		logger.log(
			`[Diagnostics] Context resolved - mode: ${lintContext.mode}, URIs: ${lintContext.uris.length}${lintContext.rootUris ? `, rootUris: ${lintContext.rootUris.length}` : ""}${lintContext.context ? `, docs in context: ${lintContext.context.docs.size}` : ""}`,
		);
		if (lintContext.uris.length > 0) {
			logger.log(
				`[Diagnostics] Context URIs: ${lintContext.uris.slice(0, 5).join(", ")}${lintContext.uris.length > 5 ? ` ... (${lintContext.uris.length - 5} more)` : ""}`,
			);
		}

		const rules = shared.getRuleImplementations();
		if (rules.length === 0) {
			logger.log(`[Diagnostics] WARNING: No rules loaded!`);
		} else {
			const ruleIds = rules
				.map((r) => r.meta?.id ?? "unknown")
				.slice(0, 10)
				.join(", ");
			logger.log(
				`[Diagnostics] Using ${rules.length} rule(s): ${ruleIds}${rules.length > 10 ? ` ... (${rules.length - 10} more)` : ""}`,
			);
		}

		logger.log(`[Diagnostics] Calling lintDocument...`);
		const diagnostics = await lintDocument(
			lintContext,
			shared.getHost(),
			rules,
		);
		logger.log(
			`[Diagnostics] lintDocument returned ${diagnostics.length} total diagnostic(s)`,
		);

		if (diagnostics.length > 0) {
			// Count diagnostics by URI
			const diagByUri = new Map<string, number>();
			for (const diag of diagnostics) {
				const normalized = normalizeBaseUri(diag.uri);
				diagByUri.set(normalized, (diagByUri.get(normalized) ?? 0) + 1);
			}
			const diagBreakdown = Array.from(diagByUri.entries())
				.map(([uri, count]) => `${count} for ${uri}`)
				.join(", ");
			logger.log(`[Diagnostics] Diagnostics breakdown: ${diagBreakdown}`);
		} else {
			logger.log(`[Diagnostics] No diagnostics returned from lintDocument`);
		}

		// Filter diagnostics to this document using fsPath comparison
		const docPath = toFsPathLower(baseUri);
		logger.log(
			`[Diagnostics] Filtering diagnostics for document path: ${docPath}`,
		);
		const shown = diagnostics.filter(
			(d) => toFsPathLower(normalizeBaseUri(d.uri)) === docPath,
		);
		logger.log(
			`[Diagnostics] Filtered to ${shown.length} diagnostic(s) for this document (from ${diagnostics.length} total)`,
		);

		if (diagnostics.length > 0 && shown.length === 0) {
			const sampleUris = diagnostics
				.slice(0, 3)
				.map((d) => normalizeBaseUri(d.uri))
				.join(", ");
			logger.log(
				`[Diagnostics] WARNING: 0/${diagnostics.length} diagnostics matched for ${document.uri}. Sample diagnostic URIs: ${sampleUris}`,
			);
			warnOnce(
				baseUri,
				`[Diagnostics] 0/${diagnostics.length} diagnostics matched for ${document.uri}`,
				shared,
			);
		}

		const result = shown.map(toLspDiagnostic);
		logger.log(
			`[Diagnostics] Returning ${result.length} diagnostic(s) to Volar`,
		);
		if (result.length > 0) {
			logger.log(
				`[Diagnostics] Successfully provided diagnostics for: ${document.uri}`,
			);
		}
		return result;
	} catch (error) {
		const message =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		logger.error(`[Diagnostics] Failed to lint ${document.uri}: ${message}`);
		return [];
	}
}

function updateSnapshot(shared: ApertureVolarContext, document: TextDocument) {
	const snapshotCandidate = document as unknown as SnapshotLike | undefined;
	if (
		snapshotCandidate &&
		typeof snapshotCandidate.getSnapshot === "function"
	) {
		shared.documents.updateFromDocument(snapshotCandidate);
	}
}

// --- URI helpers ---

function normalizeBaseUri(u: string): string {
	const s = u.split("#")?.[0]?.split("?")?.[0];
	if (!s) {
		throw new Error(`Invalid URI: ${u}`);
	}
	return s;
}

function toFsPathLower(u: string): string {
	try {
		return URI.parse(u).fsPath.toLowerCase();
	} catch {
		return u.toLowerCase();
	}
}

async function provideWorkspaceDiagnostics(
	shared: ApertureVolarContext,
	context: LanguageServiceContext,
	token: CancellationToken,
): Promise<WorkspaceDocumentDiagnosticReport[]> {
	const logger = shared.getLogger();
	logger.log(`[Workspace Diagnostics] Starting workspace diagnostics scan`);

	if (token.isCancellationRequested) {
		logger.log(`[Workspace Diagnostics] Cancelled before starting`);
		return [];
	}

	try {
		// Get all workspace folders
		const workspaceFolders = shared.getWorkspaceFolders();
		if (workspaceFolders.length === 0) {
			logger.log(`[Workspace Diagnostics] No workspace folders found`);
			return [];
		}

		// Use host to glob for all YAML/JSON files
		const patterns = ["**/*.yaml", "**/*.yml", "**/*.json"];
		logger.log(`[Workspace Diagnostics] Glob patterns: ${patterns.join(", ")}`);
		const fileUris = await shared.getHost().glob(patterns);
		logger.log(
			`[Workspace Diagnostics] Found ${fileUris.length} file(s) to validate`,
		);

		if (fileUris.length === 0) {
			return [];
		}

		// Process files in batches to avoid blocking
		const batchSize = 10;
		const reports: WorkspaceDocumentDiagnosticReport[] = [];

		for (let i = 0; i < fileUris.length; i += batchSize) {
			if (token.isCancellationRequested) {
				logger.log(`[Workspace Diagnostics] Cancelled during processing`);
				break;
			}

			const batch = fileUris.slice(i, i + batchSize);
			logger.log(
				`[Workspace Diagnostics] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(fileUris.length / batchSize)} (${batch.length} files)`,
			);

			// Process batch in parallel
			const batchPromises = batch.map(async (uri) => {
				try {
					// Check if file is a root document (OpenAPI spec)
					const isRoot = await shared.documentCache.isRootDocument(
						uri,
						shared.getHost(),
					);

					if (!isRoot) {
						// Not an OpenAPI file, return full report with no diagnostics
						return {
							kind: "full" as const,
							uri,
							version: null,
							items: [],
						};
					}

					// Get or create a TextDocument for this URI
					// We need to read the file to create a document
					const readResult = await shared.getHost().read(uri);
					const document = context.documents.get(
						URI.parse(uri),
						inferLanguageId(uri) || "yaml",
						{
							getText: (start, end) => readResult.text.substring(start, end),
							getLength: () => readResult.text.length,
							getChangeRange: () => undefined,
						},
					);

					// Get diagnostics for this document
					const diagnostics = await provideDocumentDiagnostics(
						shared,
						context,
						document,
						token,
					);

					return {
						kind: "full" as const,
						uri,
						version: null,
						items: diagnostics,
					};
				} catch (error) {
					logger.error(
						`[Workspace Diagnostics] Failed to process ${uri}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
					// Return full report with no diagnostics on error
					return {
						kind: "full" as const,
						uri,
						version: null,
						items: [],
					};
				}
			});

			const batchReports = await Promise.all(batchPromises);
			reports.push(...batchReports);

			// Small delay between batches to avoid overwhelming the system
			if (i + batchSize < fileUris.length) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
		}

		logger.log(
			`[Workspace Diagnostics] Completed: ${reports.length} report(s) generated`,
		);
		return reports;
	} catch (error) {
		const message =
			error instanceof Error ? (error.stack ?? error.message) : String(error);
		logger.error(`[Workspace Diagnostics] Failed: ${message}`);
		return [];
	}
}

// Helper to infer language ID from URI
function inferLanguageId(uri: string): string | undefined {
	const lower = uri.toLowerCase();
	if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
	if (lower.endsWith(".json")) return "json";
	return undefined;
}

const warned = new Set<string>();
function warnOnce(key: string, msg: string, shared: ApertureVolarContext) {
	if (warned.has(key)) return;
	warned.add(key);
	shared.getLogger().warn?.(msg);
}
