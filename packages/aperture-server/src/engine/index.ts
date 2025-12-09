// Export rule authoring API first to avoid circular dependency issues
// These must be exported before any other imports that might cause cycles
export {
	defineRule,
	getField,
	hasNonEmptyString,
	locateField,
	reportAtField,
} from "./rules/api.js";
export type {
	GenericDiagnosticInput,
	GenericFilePatch,
	GenericRule,
	GenericRuleContext,
	GenericRuleMeta,
	GenericVisitors,
	ResolvedGenericRule,
} from "./rules/generic-types.js";
export { defineGenericRule } from "./rules/generic-types.js";
// Export built-in rules (both combined and categorized)
export {
	builtinRules,
	builtinRulesMap,
	openapiRules,
	openapiRulesMap,
	sailpointRules,
	sailpointRulesMap,
} from "./rules/index.js";
export type {
	Rule,
	RuleContext,
	RuleMeta,
	Visitors,
} from "./rules/types.js";
// Export all OpenAPI schemas
export * from "./schemas/index.js";

import { pathToFileURL } from "node:url";
import type { FileSystem } from "@volar/language-service";
import { filterRulesByContext as filterRules } from "./execution/rule-filter.js";
import { runEngine } from "./execution/runner.js";
import { buildIndex } from "./indexes/project-index.js";
import { buildRefGraph } from "./indexes/ref-graph.js";
import { builtinRules } from "./rules/index.js";
import type { Diagnostic as EngineDiagnostic, Rule } from "./rules/types.js";
import { identifyDocumentType as identifyDocType } from "./utils/document-type-utils.js";

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
	ComponentsNode,
	ExampleRef,
	HeaderRef,
	InfoNode,
	ItemRef,
	LinkRef,
	MediaTypeRef,
	OperationRef,
	ParameterRef,
	PathItemRef,
	ProjectIndex,
	ReferenceRef,
	RequestBodyRef,
	ResponseRef,
	RootRef,
	RootResolver,
	SchemaRef,
	ScopeContext,
	SecurityRequirementRef,
	ServerNode,
} from "./indexes/types.js";

import {
	type Diagnostic,
	DiagnosticSeverity,
} from "vscode-languageserver/node";
import YAML from "yaml";
import type { LintingContext } from "./context/context-resolver";
import { loadDocument } from "./load-document.js";
import { MemoryFileSystem } from "./utils/file-system-utils.js";

function isOpenApiRoot(obj: unknown): boolean {
	if (!obj || typeof obj !== "object") return false;
	const data = obj as Record<string, unknown>;
	if (typeof data.openapi === "string") return true;
	return ["info", "paths", "components", "webhooks"].some(
		(key) => data[key] !== undefined,
	);
}

/**
 * Converts engine Diagnostic to LSP Diagnostic format.
 * Since engine diagnostics now use LSP-compatible field names,
 * this is mostly a pass-through.
 */
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

/**
 * Lints documents based on a resolved linting context.
 * Handles project-aware, multi-root, and fragment modes.
 *
 * @param context - The resolved linting context
 * @param fileSystem - The Volar FileSystem for reading files
 * @param rules - Optional array of rules to use. If not provided, uses all registered rules
 * @returns Array of engine diagnostics
 */
export async function lintDocument(
	context: LintingContext,
	fileSystem: FileSystem,
	rules?: Rule[],
): Promise<EngineDiagnostic[]> {
	const parseErrors: EngineDiagnostic[] = [];
	const allDiagnostics: EngineDiagnostic[] = [];

	// Get rules (use provided rules or default to all builtin rules)
	let rulesToUse: Rule[];
	if (rules) {
		rulesToUse = rules;
	} else {
		rulesToUse = builtinRules;
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
							code: "parse-error",
							source: "telescope",
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
					code: "parse-error",
					source: "telescope",
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
						code: "parse-error",
						source: "telescope",
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

		// Run engine with all builtin rules
		const result = runEngine(project, [uri], { rules: builtinRules });

		// Convert diagnostics to LSP format
		return result.diagnostics.map(toLspDiagnostic);
	} catch (_error) {
		// Return empty array on error, or log it
		// Note: In LSP context, errors should be logged via DiagnosticsLogger
		// For standalone usage, errors are silently swallowed
		return [];
	}
}

export {
	defaultConfig,
	loadCustomExtension,
	loadCustomOpenAPIRule,
	type MaterializedExtensions,
	materializeExtensions,
	materializeRules,
	type ResolvedRule,
	type RuleSetting,
	resolveConfig,
	type Severity,
} from "./config/index.js";
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
export {
	loadGenericRule,
	materializeGenericRules,
} from "./rules/generic.js";
export {
	builtinExtensions,
	builtinExtensionsMap,
	redoclyExtensions,
	scalarExtensions,
	speakeasyExtensions,
	stoplightExtensions,
} from "./schemas/extensions/builtin/index.js";
// Extension schema exports
export {
	buildExtensionRegistry,
	checkRequiredExtensions,
	compileExtension,
	createExtensionRegistry,
	defineExtension,
	type ExtensionDiagnostic,
	getExtensionsForScope,
	registerExtension,
	validateExtensionsAtScope,
	validateExtensionValue,
} from "./schemas/extensions/index.js";
export type {
	CompiledExtension,
	ExtensionRegistry,
	ExtensionSchemaMeta,
	ExtensionScope,
	ExtensionValidationError,
} from "./schemas/extensions/types.js";

import { Type, type TSchema } from "typebox";

/**
 * Helper to define a TypeBox schema for use with Telescope validation.
 * Accepts either a callback function that receives the `Type` builder,
 * or a schema directly. Using the callback pattern is recommended as
 * it eliminates the need for users to install typebox as a separate dependency.
 *
 * @param schemaOrCallback - A TypeBox schema or a callback that receives `Type` and returns a schema
 * @returns The TypeBox schema
 *
 * @example
 * import { defineSchema } from "aperture-server";
 *
 * // Recommended: Use callback pattern (no need to import typebox)
 * export default defineSchema((Type) =>
 *   Type.Object({
 *     name: Type.String(),
 *     version: Type.String(),
 *   })
 * );
 *
 * @example
 * import { defineSchema, Type } from "aperture-server";
 *
 * // Alternative: Use Type directly from aperture-server
 * export default defineSchema(
 *   Type.Object({
 *     name: Type.String(),
 *     version: Type.String(),
 *   })
 * );
 */
export function defineSchema<T extends TSchema>(
	schemaOrCallback: T | ((t: typeof Type) => T),
): T {
	if (typeof schemaOrCallback === "function") {
		return (schemaOrCallback as (t: typeof Type) => T)(Type);
	}
	return schemaOrCallback;
}

// Re-export TypeBox Type for users who want direct access
export { Type } from "typebox";
export type { TSchema, Static } from "typebox";

export type {
	GenericRunOptions,
	GenericRunResult,
} from "./execution/generic-runner.js";
export { runGenericRules } from "./execution/generic-runner.js";
export { filterRulesByContext } from "./execution/rule-filter.js";
// Re-export all engine functionality
// Execution
export { createRuleContext, runEngine } from "./execution/runner.js";
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
// Utilities
export {
	type DocumentType,
	identifyDocumentType,
	isPartialDocument,
	isRootDocument,
} from "./utils/document-type-utils.js";
export {
	decodePointerSegment,
	encodePointerSegment,
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "./utils/pointer-utils.js";
// Version detection and resolution
export {
	detectVersionFromContent,
	type DetectedVersion,
	isVersion,
	meetsConfidence,
	type VersionConfidence,
	type VersionHint,
} from "./utils/version-detection.js";
export {
	getVersionConfidence,
	isResolvedVersion,
	resolveDocumentVersion,
	type ResolvedVersion,
	type VersionSource,
} from "./utils/version-resolution.js";
