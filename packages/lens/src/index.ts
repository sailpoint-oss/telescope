// Export rule authoring API first to avoid circular dependency issues
// These must be exported before any other imports that might cause cycles
export { defineRule } from "./rules/api.js";
export type {
	GenericDiagnosticInput,
	GenericFilePatch,
	GenericRule,
	GenericRuleContext,
	GenericRuleMeta,
	GenericVisitors,
} from "./rules/generic-types.js";
export { defineGenericRule } from "./rules/generic-types.js";
export type {
	Rule,
	RuleContext,
	RuleMeta,
	Visitors,
} from "./rules/types.js";

import { pathToFileURL } from "node:url";
import type { FileSystem } from "@volar/language-service";
import { identifyDocumentType as identifyDocType } from "shared/document-type-utils";
import { filterRulesByContext as filterRules } from "./core/rule-filter.js";
import { runEngine } from "./core/runner.js";
import { buildIndex } from "./indexes/project-index.js";
import { buildRefGraph } from "./indexes/ref-graph.js";
import type { Diagnostic as EngineDiagnostic, Rule } from "./rules/types.js";

export type {
	GraphEdge,
	GraphNode,
	RefGraph,
	Resolver,
} from "./indexes/graph-types.js";
// Indexer exports
export { buildIndex } from "./indexes/project-index.js";
export { buildRefGraph, findRefUris, makeNode } from "./indexes/ref-graph.js";
export type {
	CallbackRef,
	ComponentRef,
	ExampleRef,
	HeaderRef,
	LinkRef,
	MediaTypeRef,
	OperationRef,
	ParameterRef,
	PathItemRef,
	ProjectIndex,
	ReferenceRef,
	RequestBodyRef,
	ResponseRef,
	RootResolver,
	SchemaRef,
	ScopeContext,
	SecurityRequirementRef,
} from "./indexes/types.js";

import { MemoryFileSystem } from "shared/file-system-utils";
import {
	type Diagnostic,
	DiagnosticSeverity,
} from "vscode-languageserver/node";
import YAML from "yaml";
import type { LintingContext } from "./context/context-resolver";
import { loadDocument } from "./load-document.js";
import { ruleRegistry } from "./registry.js";

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
	severity: DiagnosticSeverity | undefined;
	link?: string;
}): Diagnostic {
	return {
		message: diag.message,
		range: diag.range,
		severity: diag.severity,
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
 * @param fileSystem - The Volar FileSystem for reading files
 * @param rules - Optional array of rules to use. If not provided, uses default preset
 * @returns Array of engine diagnostics
 */
export async function lintDocument(
	context: LintingContext,
	fileSystem: FileSystem,
	rules?: Rule[],
): Promise<EngineDiagnostic[]> {
	const parseErrors: EngineDiagnostic[] = [];
	const allDiagnostics: EngineDiagnostic[] = [];

	// Get rules (use provided rules or default to all registered rules)
	let rulesToUse: Rule[];
	if (rules) {
		rulesToUse = rules;
	} else {
		rulesToUse = ruleRegistry.getAllRules();
	}

	if (context.mode === "multi-root" && context.multiRootContexts) {
		// Handle multi-root mode: lint each root context separately
		for (const multiRootContext of context.multiRootContexts) {
			// Filter rules based on this context
			const filteredRules = filterRules(rulesToUse, multiRootContext.context);

			// Load any missing documents
			for (const uri of multiRootContext.uris) {
				if (!multiRootContext.context.docs.has(uri)) {
					try {
						const doc = await loadDocument({ fileSystem, uri });
						// Guard: Only lint known OpenAPI document types
						const docType = identifyDocType(doc.ast);
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
							severity: DiagnosticSeverity.Error,
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
				const parsed = await loadDocument({ fileSystem, uri });
				// Guard: Only lint known OpenAPI document types
				const docType = identifyDocType(parsed.ast);
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
					severity: DiagnosticSeverity.Error,
				});
			}
		}

		// If no valid OpenAPI documents were loaded, return early
		if (docs.size === 0) {
			return [...parseErrors];
		}

		// Build minimal graph and index
		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
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
		const filteredRules = filterRules(rulesToUse, project);

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
					const parsed = await loadDocument({ fileSystem, uri });
					// Guard: Only lint known OpenAPI document types
					const docType = identifyDocType(parsed.ast);
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
						severity: DiagnosticSeverity.Error,
					});
				}
			}

			const { graph, resolver, rootResolver } = buildRefGraph({ docs });
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
		const filteredRules = filterRules(rulesToUse, context.context);

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

	// Create in-memory FileSystem
	const fileSystem = new MemoryFileSystem();
	const uri = pathToFileURL("/tmp/lens-validation.yaml").toString();
	fileSystem.addFile(uri, yamlContent);

	try {
		// Load and parse the document
		const parsedDoc = await loadDocument({ fileSystem, uri });

		// Build reference graph and index
		const docs = new Map([[uri, parsedDoc]]);
		const { graph, resolver, rootResolver } = buildRefGraph({ docs });
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

		// Get all rules from registry
		const rules = ruleRegistry.getAllRules();

		// Run engine
		const result = runEngine(project, [uri], { rules });

		// Convert diagnostics to lens format
		return result.diagnostics.map(toLensDiagnostic);
	} catch (_error) {
		// Return empty array on error, or log it
		// Note: In LSP context, errors should be logged via DiagnosticsLogger
		// For standalone usage, errors are silently swallowed
		return [];
	}
}

export {
	type AdditionalValidationGroup,
	defaultConfig,
	type LintConfig,
	loadCustomOpenAPIRule,
	materializeRules,
	type ResolvedRule,
	type RuleSetting,
	resolveConfig,
	type Severity,
} from "./config.js";
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
export { loadDocument } from "./load-document";
export { matchesPattern } from "./pattern-matcher";
export { type Preset, type RuleConfigEntry, ruleRegistry } from "./registry";
export {
	loadGenericRule,
	materializeGenericRules,
} from "./rules/generic.js";

/**
 * Helper to define a Zod schema for use with Telescope validation.
 * This is a simple identity function that helps with type inference and
 * provides a consistent API for defining schemas.
 *
 * @param schema - The Zod schema to define
 * @returns The passed Zod schema
 *
 * @example
 * import { defineSchema } from "lens";
 * import { z } from "zod";
 *
 * export default defineSchema(
 *   z.object({
 *     name: z.string(),
 *     version: z.string(),
 *   })
 * );
 */
export function defineSchema<T>(schema: T): T {
	return schema;
}

// Utilities
export {
	type DocumentType,
	identifyDocumentType,
	isPartialDocument,
	isRootDocument,
} from "shared/document-type-utils";
export {
	decodePointerSegment,
	encodePointerSegment,
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "shared/pointer-utils";
export type {
	GenericRunOptions,
	GenericRunResult,
} from "./core/generic-runner.js";
export { runGenericRules } from "./core/generic-runner.js";
export type { IRProjectContext } from "./core/ir-runner.js";
export { runEngineIR } from "./core/ir-runner.js";
export { filterRulesByContext } from "./core/rule-filter.js";
// Re-export all engine functionality
// Execution
export { createRuleContext, runEngine } from "./core/runner.js";

// Indexes
export {
	type AtomIndex,
	type ComponentAtom,
	extractAtoms,
	type OperationAtom,
	type SchemaAtom,
	type SecuritySchemeAtom,
} from "./indexes/atoms.js";
export { GraphIndex, type RefEdge } from "./indexes/graph.js";
export { OperationIdIndex } from "./indexes/semantic/opids.js";
export {
	findNodeByPointer,
	getValueAtPointer as getValueAtPointerIR,
	irLocToRange,
	irPointerToRange,
} from "./ir/context.js";
// IR building
export { buildIRFromJson, buildIRFromYaml } from "./ir/index.js";
export type { IRDocument, IRNode, IRNodeKind, Loc } from "./ir/types.js";
// Types
export type {
	Diagnostic,
	DiagnosticInput,
	EngineRunOptions,
	EngineRunResult,
	FilePatch,
	ProjectContext,
	ScopeLocator,
} from "./rules/types.js";
