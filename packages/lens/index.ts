import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import type { Rule } from "engine";
import {
	type Diagnostic as EngineDiagnostic,
	filterRulesByContext,
	runEngine,
} from "engine";
import type { ReadResult, VfsHost } from "host";
import { buildIndex, buildRefGraph } from "indexer";
import { identifyDocumentType, loadDocument } from "loader";
import type { Diagnostic } from "vscode-languageserver/node";
import YAML from "yaml";
import type { LintingContext } from "./context/context-resolver";

// Simple in-memory host for lens validation
class MemoryHost implements VfsHost {
	private files = new Map<string, { text: string; mtimeMs: number }>();

	addFile(uri: string, text: string, mtimeMs: number = Date.now()): void {
		this.files.set(uri, { text, mtimeMs });
	}

	async read(uri: string): Promise<ReadResult> {
		const file = this.files.get(uri);
		if (!file) {
			throw new Error(`File not found: ${uri}`);
		}
		return {
			text: file.text,
			mtimeMs: file.mtimeMs,
			hash: crypto.createHash("sha1").update(file.text).digest("hex"),
		};
	}

	async exists(uri: string): Promise<boolean> {
		return this.files.has(uri);
	}

	async glob(_patterns: string[]): Promise<string[]> {
		return Array.from(this.files.keys());
	}

	watch(_uris: string[], _onChange: (uri: string) => void): () => void {
		return () => undefined;
	}

	resolve(_fromUri: string, ref: string): string {
		if (/^https?:/i.test(ref)) return ref;
		// Simple resolution for lens
		return ref;
	}
}

function isOpenApiRoot(obj: unknown): boolean {
	if (!obj || typeof obj !== "object") return false;
	const data = obj as Record<string, unknown>;
	if (typeof data.openapi === "string") return true;
	return ["info", "paths", "components", "webhooks"].some(
		(key) => data[key] !== undefined,
	);
}

/**
 * Converts engine Diagnostic to lens Diagnostic format.
 */
function toLensDiagnostic(diag: {
	ruleId: string;
	message: string;
	uri: string;
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
	severity: "error" | "warning" | "info";
	link?: string;
}): Diagnostic {
	return {
		message: diag.message,
		range: diag.range,
		severity:
			diag.severity === "error"
				? 1 // DiagnosticSeverity.Error
				: diag.severity === "warning"
					? 2 // DiagnosticSeverity.Warning
					: 3, // DiagnosticSeverity.Information
		source: "telescope-openapi",
		code: diag.ruleId,
		codeDescription: diag.link
			? {
					href: diag.link,
				}
			: undefined,
	};
}

/**
 * Lints documents based on a resolved linting context.
 * Handles project-aware, multi-root, and fragment modes.
 *
 * @param context - The resolved linting context
 * @param host - The VFS host for reading files
 * @param rules - Optional array of rules to use. If not provided, uses recommended31 preset
 * @returns Array of engine diagnostics
 */
export async function lintDocument(
	context: LintingContext,
	host: VfsHost,
	rules?: Rule[],
): Promise<EngineDiagnostic[]> {
	const parseErrors: EngineDiagnostic[] = [];
	const allDiagnostics: EngineDiagnostic[] = [];

	// Get rules (use provided rules or default to recommended31)
	let rulesToUse: Rule[];
	if (rules) {
		rulesToUse = rules;
	} else {
		const { rules: allRulesMap } = await import("blueprint");
		rulesToUse = Object.values(allRulesMap);
	}

	if (context.mode === "multi-root" && context.multiRootContexts) {
		// Handle multi-root mode: lint each root context separately
		for (const multiRootContext of context.multiRootContexts) {
			// Filter rules based on this context
			const filteredRules = filterRulesByContext(
				rulesToUse,
				multiRootContext.context,
			);

			// Load any missing documents
			for (const uri of multiRootContext.uris) {
				if (!multiRootContext.context.docs.has(uri)) {
					try {
						const doc = await loadDocument({ host, uri });
						// Guard: Only lint known OpenAPI document types
						const docType = identifyDocumentType(doc.ast);
						if (docType === "unknown") {
							// Skip unknown document types - don't lint non-OpenAPI files
							continue;
						}
						multiRootContext.context.docs.set(uri, doc);
					} catch (e) {
						parseErrors.push({
							ruleId: "parse-error",
							message: e instanceof Error ? e.message : String(e),
							uri,
							range: {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 0 },
							},
							severity: "error",
						});
					}
				}
			}

			// Run engine for this context
			const result = runEngine(
				multiRootContext.context,
				multiRootContext.uris,
				{
					rules: filteredRules,
				},
			);
			allDiagnostics.push(...result.diagnostics);
		}
	} else if (context.mode === "fragment") {
		// Fragment mode: load only the fragment document, filter rules
		const docs = new Map<string, Awaited<ReturnType<typeof loadDocument>>>();

		for (const uri of context.uris) {
			try {
				const parsed = await loadDocument({ host, uri });
				// Guard: Only lint known OpenAPI document types
				const docType = identifyDocumentType(parsed.ast);
				if (docType === "unknown") {
					// Skip unknown document types - don't lint non-OpenAPI files
					continue;
				}
				docs.set(uri, parsed);
			} catch (e) {
				parseErrors.push({
					ruleId: "parse-error",
					message: e instanceof Error ? e.message : String(e),
					uri,
					range: {
						start: { line: 0, character: 0 },
						end: { line: 0, character: 0 },
					},
					severity: "error",
				});
			}
		}

		// If no valid OpenAPI documents were loaded, return early
		if (docs.size === 0) {
			return [...parseErrors];
		}

		// Build minimal graph and index
		const { graph, resolver, rootResolver } = buildRefGraph({ docs, host });
		const index = buildIndex({ docs, graph, resolver });

		const project = {
			docs,
			index,
			resolver,
			graph,
			rootResolver,
			version: index.version,
		} as const;

		// Filter rules to only those that don't require root/extra context
		const filteredRules = filterRulesByContext(rulesToUse, project);

		// Run engine with filtered rules
		const result = runEngine(project, context.uris, { rules: filteredRules });
		allDiagnostics.push(...result.diagnostics);
	} else {
		// Project-aware mode: use the provided context
		if (!context.context) {
			// Build context if not provided
			const docs = new Map<string, Awaited<ReturnType<typeof loadDocument>>>();

			for (const uri of context.uris) {
				try {
					const parsed = await loadDocument({ host, uri });
					// Guard: Only lint known OpenAPI document types
					const docType = identifyDocumentType(parsed.ast);
					if (docType === "unknown") {
						// Skip unknown document types - don't lint non-OpenAPI files
						continue;
					}
					docs.set(uri, parsed);
				} catch (e) {
					parseErrors.push({
						ruleId: "parse-error",
						message: e instanceof Error ? e.message : String(e),
						uri,
						range: {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						},
						severity: "error",
					});
				}
			}

			const { graph, resolver, rootResolver } = buildRefGraph({ docs, host });
			const index = buildIndex({ docs, graph, resolver });

			context.context = {
				docs,
				index,
				resolver,
				graph,
				rootResolver,
				version: index.version,
			};
		}

		// Filter rules based on context
		const filteredRules = filterRulesByContext(rulesToUse, context.context);

		// Run engine
		const result = runEngine(context.context, context.uris, {
			rules: filteredRules,
		});
		allDiagnostics.push(...result.diagnostics);
	}

	// Return all diagnostics (including parse errors)
	return [...parseErrors, ...allDiagnostics];
}

/**
 * Lints an OpenAPI object by detecting its type and running appropriate validators.
 * Returns all diagnostics collected from all relevant validators.
 */
export async function lint(obj: unknown): Promise<Diagnostic[]> {
	// Only lint full OpenAPI documents; never wrap fragments.
	if (!isOpenApiRoot(obj)) {
		return [];
	}

	// Serialize the provided OpenAPI root object to YAML for the loader
	const yamlContent = YAML.stringify(obj as Record<string, unknown>);

	// Create in-memory file system
	const host = new MemoryHost();
	const uri = pathToFileURL("/tmp/lens-validation.yaml").toString();
	host.addFile(uri, yamlContent);

	try {
		// Load and parse the document
		const parsedDoc = await loadDocument({ host, uri });

		// Build reference graph and index
		const docs = new Map([[uri, parsedDoc]]);
		const { graph, resolver, rootResolver } = buildRefGraph({ docs, host });
		const index = buildIndex({ docs, graph, resolver });

		// Create project context
		const project = {
			docs: new Map([[uri, parsedDoc]]),
			index,
			resolver,
			graph,
			rootResolver,
			version: index.version,
		} as const;

		// Get all rules from presets
		const { rules: allRulesMap } = await import("blueprint");
		const rules = Object.values(allRulesMap);

		// Run engine
		const result = runEngine(project, [uri], { rules });

		// Convert diagnostics to lens format
		return result.diagnostics.map(toLensDiagnostic);
	} catch (error) {
		// Return empty array on error, or log it
		console.error("Error linting object:", error);
		return [];
	}
}

export {
	defaultConfig,
	type LintConfig,
	materializeRules,
	type ResolvedRule,
	type RuleConfigEntry,
	type RuleSetting,
	resolveConfig,
	type Severity,
} from "./config";
export {
	type LintingContext,
	type LintingMode,
	resolveLintingContext,
} from "./context/context-resolver";
export { DocumentTypeCache } from "./context/document-cache";
export {
	findSharedSchemas,
	type MultiRootContext,
	resolveMultipleRoots,
} from "./context/multi-root-handler";
export { ProjectContextCache } from "./context/project-cache";
export {
	discoverWorkspaceRoots,
	findRootDocumentsForPartial,
} from "./context/root-discovery";
