/**
 * OpenAPI Service Plugin
 *
 * This module provides the Volar language service plugin for OpenAPI document
 * validation. It integrates the Telescope rule engine with the LSP to provide:
 *
 * - Per-document diagnostics from OpenAPI rules
 * - Workspace-wide diagnostics for all OpenAPI files
 * - Document links for $ref references (local, relative files, and external URLs)
 * - Code Actions / Quick Fixes
 * - Find All References
 * - Workspace Symbols
 * - OpenAPI-Specific Completions
 * - Rename Symbol
 * - Code Lens
 * - Inlay Hints
 * - Enhanced Go to Definition
 * - Call Hierarchy
 * - Semantic Tokens
 *
 * The service accesses IR and atoms directly from OpenAPIVirtualCode instances,
 * which are managed by Volar's native cache. The WorkspaceIndex coordinates
 * cross-document features like $ref relationships and operationId tracking.
 *
 * @module lsp/services/openapi
 *
 * @see {@link runEngine} - The rule execution engine
 * @see {@link ProjectContext} - Context built for rule execution
 * @see {@link telescopeVolarContext} - Shared LSP context
 * @see {@link OpenAPIVirtualCode} - VirtualCode with IR/atoms
 *
 * @example
 * ```typescript
 * import { createOpenAPIServicePlugin } from "telescope-server";
 *
 * // Create the plugin with shared context
 * const plugin = createOpenAPIServicePlugin(sharedContext);
 *
 * // Register with Volar
 * languageService.installPlugin(plugin);
 * ```
 */

import { createHash } from "node:crypto";
import type {
	CancellationToken,
	LanguageServiceContext,
	LanguageServicePlugin,
} from "@volar/language-service";
import * as jsonc from "jsonc-parser";
import type {
	Diagnostic,
	DocumentLink,
	Hover,
	Position,
	Range,
	WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import * as yaml from "yaml";
import { runEngine } from "../../engine/execution/runner.js";
import { buildIndex } from "../../engine/indexes/project-index.js";
import { buildRefGraph, findRefUris } from "../../engine/indexes/ref-graph.js";
import { findNodeByPointer } from "../../engine/ir/context.js";
import type { IRNode } from "../../engine/ir/types.js";
import { loadDocument } from "../../engine/load-document.js";
import { categorizeRulesByScope } from "../../engine/rules/index.js";
import type { ProjectContext } from "../../engine/rules/types.js";
import type { ParsedDocument } from "../../engine/types.js";
import { normalizeBaseUri } from "../../engine/utils/document-utils.js";
import { globFiles } from "../../engine/utils/file-system-utils.js";
import {
	buildLineOffsets,
	getLineCol,
} from "../../engine/utils/line-offset-utils.js";
import { positionCache } from "./shared/position-cache.js";
import { parseJsonPointer } from "../../engine/utils/pointer-utils.js";
import { normalizeUri, resolveRef } from "../../engine/utils/ref-utils.js";
import type { DataVirtualCode } from "../languages/virtualCodes/data-virtual-code.js";
import type { OpenAPIVirtualCode } from "../languages/virtualCodes/openapi-virtual-code.js";
import type { telescopeVolarContext } from "../workspace/context.js";
import {
	type CodeActionContext,
	prepareCallHierarchy,
	prepareRename,
	provideCallHierarchyIncomingCalls,
	provideCallHierarchyOutgoingCalls,
	provideCodeActions,
	provideCodeLenses,
	provideDefinition as provideEnhancedDefinition,
	provideInlayHints,
	provideOpenAPICompletions,
	provideReferences,
	provideRenameEdits,
	provideSemanticTokens,
	provideWorkspaceSymbols,
	SEMANTIC_TOKEN_MODIFIERS,
	SEMANTIC_TOKEN_TYPES,
} from "./openapi-features.js";
import {
	getDataVirtualCode,
	getOpenAPIVirtualCode,
	resolveOpenAPIDocument,
} from "./shared/virtual-code-utils.js";
import { getZodSchema } from "./shared/schema-cache.js";
import { zodErrorsToDiagnostics } from "./shared/zod-to-diag.js";

/**
 * Build a ProjectContext from an OpenAPIVirtualCode instance.
 *
 * This function creates a complete ProjectContext using the VirtualCode as the
 * source of truth. It:
 * 1. Gets the primary document from VirtualCode
 * 2. Collects all linked documents (dependencies and dependents) via WorkspaceIndex
 * 3. Loads any missing referenced documents from the file system
 * 4. Builds the reference graph and resolver
 * 5. Builds the project index
 *
 * For workspace diagnostics, use the ProjectContextCache via shared.projectContextCache
 * for incremental updates. This function is kept for single-file diagnostics where
 * caching overhead may not be beneficial.
 *
 * @param shared - The shared telescope context
 * @param primaryUri - URI of the primary document to build context for
 * @param primaryVC - The OpenAPIVirtualCode for the primary document
 * @param languageServiceContext - Volar language service context for file system access
 * @returns ProjectContext for rule execution, or null if document not found
 *
 * @internal
 */
async function buildProjectContextFromVirtualCode(
	shared: telescopeVolarContext,
	primaryUri: string,
	primaryVC: OpenAPIVirtualCode,
	languageServiceContext?: LanguageServiceContext,
): Promise<ProjectContext | null> {
	const workspaceIndex = shared.workspaceIndex;
	const logger = shared.getLogger("ProjectContext Builder");

	// Normalize the primary URI
	const normalizedPrimaryUri = normalizeUri(primaryUri);

	// Get the primary document from VirtualCode using normalized URI
	// This ensures doc.uri matches the map key
	const primaryDoc = primaryVC.toParsedDocument(normalizedPrimaryUri);

	// Build docs map with primary and all linked documents
	const docs = new Map<string, ParsedDocument>();
	docs.set(normalizedPrimaryUri, primaryDoc);

	// Add linked documents (dependencies and dependents) from workspace index
	for (const linkedUri of workspaceIndex.getLinkedUris(primaryUri)) {
		const normalizedLinkedUri = normalizeUri(linkedUri);
		if (docs.has(normalizedLinkedUri)) continue;

		// Try to get VirtualCode for linked document
		const linkedVC = getOpenAPIVirtualCode(
			languageServiceContext,
			URI.parse(linkedUri),
		);
		if (linkedVC) {
			// Use normalizedLinkedUri for consistency - ensures doc.uri matches map key
			docs.set(normalizedLinkedUri, linkedVC.toParsedDocument(normalizedLinkedUri));
		}
	}

	// Load missing referenced documents via forward $ref traversal
	// This ensures all externally referenced files are loaded even if not open in editor
	if (languageServiceContext?.env?.fs) {
		const fileSystem = languageServiceContext.env.fs;
		const toLoad = new Set<string>();
		const loaded = new Set<string>(docs.keys());

		// Find all $refs in loaded documents
		for (const doc of docs.values()) {
			const refs = findRefUris(doc, doc.uri);
			for (const refUri of refs) {
				// Normalize URI for consistent lookups
				const normalizedRefUri = normalizeUri(refUri);
				if (!loaded.has(normalizedRefUri) && !toLoad.has(normalizedRefUri)) {
					toLoad.add(normalizedRefUri);
				}
			}
		}

		// Load missing documents
		// Note: URIs in toLoad are already normalized from above
		while (toLoad.size > 0) {
			const uri = toLoad.values().next().value;
			if (!uri) break;
			toLoad.delete(uri);
			loaded.add(uri);

			if (docs.has(uri)) continue;

			try {
				const doc = await loadDocument({ fileSystem, uri });
				// Use normalized URI for map key consistency
				const normalizedDocUri = normalizeUri(doc.uri);
				docs.set(normalizedDocUri, doc);

				// Find more refs in this document
				const refs = findRefUris(doc, doc.uri);
				for (const refUri of refs) {
					const normalizedRefUri = normalizeUri(refUri);
					if (!loaded.has(normalizedRefUri) && !toLoad.has(normalizedRefUri)) {
						toLoad.add(normalizedRefUri);
					}
				}
			} catch (error) {
				// Log but continue - missing refs will be reported by unresolved-ref rule
				logger.warn(
					`Failed to load referenced document ${uri}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}
	}

	// Build graph with proper resolver using buildRefGraph
	const { graph, resolver, rootResolver } = buildRefGraph({ docs });

	// Build index using the proper buildIndex function
	const index = buildIndex({ docs, graph, resolver });

	return {
		docs,
		index,
		resolver,
		graph,
		rootResolver,
		version: index.version,
	};
}

// getOpenAPIVirtualCode and getDataVirtualCode are imported from shared/virtual-code-utils.js

/**
 * Find the position at a JSON pointer in a document.
 *
 * Uses the VirtualCode's IR/AST if the file is open, otherwise parses
 * the file from disk. Returns the line/column position of the element.
 *
 * @param context - Language service context
 * @param shared - Shared telescope context for logging
 * @param targetUri - URI of the target file
 * @param pointer - JSON pointer (with or without leading #)
 * @returns Position at the pointer, or null if not found
 */
async function findPositionAtPointer(
	context: LanguageServiceContext,
	shared: telescopeVolarContext,
	targetUri: URI,
	pointer: string,
): Promise<Position | null> {
	const logger = shared.getLogger("Document Link Resolution");
	const targetUriString = targetUri.toString();
	const isYaml = /\.ya?ml$/i.test(targetUri.path);

	logger.log(
		`findPositionAtPointer: looking for "${pointer}" in ${targetUriString}`,
	);

	// First try OpenAPIVirtualCode with IR (most reliable for OpenAPI files)
	const openApiVc = getOpenAPIVirtualCode(context, targetUri);
	if (openApiVc) {
		logger.log(
			`findPositionAtPointer: found OpenAPIVirtualCode for ${targetUriString}`,
		);
		const ir = openApiVc.getIR(targetUriString);
		const node = findNodeByPointer(ir, pointer);
		if (node?.loc) {
			const range = openApiVc.locToRange(node.loc);
			if (range) {
				logger.log(
					`findPositionAtPointer: found node at IR pointer, position: ${range.start.line}:${range.start.character}`,
				);
				return range.start;
			}
			logger.log(
				"findPositionAtPointer: node found but locToRange returned null",
			);
		} else {
			logger.log(
				`findPositionAtPointer: node not found in IR for pointer "${pointer}"`,
			);
		}
	} else {
		logger.log(
			`findPositionAtPointer: no OpenAPIVirtualCode found for ${targetUriString}`,
		);
	}

	// Fall back to DataVirtualCode with AST
	const path = parseJsonPointer(pointer);
	const dataVc = getDataVirtualCode(context, targetUri);
	if (dataVc) {
		logger.log(
			`findPositionAtPointer: falling back to DataVirtualCode AST lookup`,
		);
		const position = findPositionInVirtualCode(dataVc, path, isYaml);
		if (position) {
			logger.log(
				`findPositionAtPointer: found via AST, position: ${position.line}:${position.character}`,
			);
		} else {
			logger.log("findPositionAtPointer: AST lookup failed");
		}
		return position;
	}

	// File not open - use position cache for efficient lookup
	const fs = context.env.fs;
	if (!fs) {
		logger.log("findPositionAtPointer: no file system available");
		return null;
	}

	logger.log("findPositionAtPointer: file not open, using position cache");
	try {
		// Use position cache for efficient repeated lookups
		const position = await positionCache.findPosition(
			targetUriString,
			path,
			async () => fs.readFile(targetUri),
			isYaml,
		);

		if (position) {
			logger.log(
				`findPositionAtPointer: found via cache, position: ${position.line}:${position.character}`,
			);
		} else {
			logger.log("findPositionAtPointer: path lookup failed in cached file");
		}
		return position;
	} catch (error) {
		logger.error(
			`findPositionAtPointer: error reading file: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

/**
 * Find position in a VirtualCode using its cached AST.
 */
function findPositionInVirtualCode(
	vc: DataVirtualCode,
	path: (string | number)[],
	isYaml: boolean,
): Position | null {
	// Get the raw text to build line offsets
	const text = vc.getRawText();
	const lineOffsets = buildLineOffsets(text);

	if (isYaml && vc.ast instanceof yaml.Document) {
		const node = vc.ast.getIn(path, true);
		if (
			node &&
			typeof node === "object" &&
			"range" in node &&
			Array.isArray(node.range)
		) {
			const offset = node.range[0];
			const pos = getLineCol(offset, lineOffsets);
			return { line: pos.line - 1, character: pos.col - 1 };
		}
	} else if (!isYaml) {
		// JSON - use jsonc-parser on the raw text
		const tree = jsonc.parseTree(text);
		if (tree) {
			const node = jsonc.findNodeAtLocation(tree, path);
			if (node) {
				const pos = getLineCol(node.offset, lineOffsets);
				return { line: pos.line - 1, character: pos.col - 1 };
			}
		}
	}
	return null;
}

/**
 * Find a $ref node at the given byte offset in the IR tree.
 *
 * @param node - The IR node to search
 * @param offset - The byte offset to find
 * @param vc - The VirtualCode for location conversion
 * @returns The $ref node if found at the offset, or null
 */
function findRefNodeAtOffset(
	node: IRNode,
	offset: number,
	vc: OpenAPIVirtualCode,
): IRNode | null {
	// Check if this is a $ref node and the offset is within its value range
	if (node.kind === "string" && node.key === "$ref" && node.loc) {
		const range = vc.locToRange(node.loc);
		if (range) {
			// Convert position to offset for comparison
			const startOffset = node.loc.start ?? 0;
			const endOffset = node.loc.end ?? startOffset;
			if (offset >= startOffset && offset <= endOffset) {
				return node;
			}
		}
	}

	// Recurse into children
	if (node.children) {
		for (const child of node.children) {
			const found = findRefNodeAtOffset(child, offset, vc);
			if (found) return found;
		}
	}

	return null;
}

/**
 * Get a preview of the referenced content for hover display.
 *
 * @param context - The language service context
 * @param shared - The shared telescope context
 * @param sourceUri - The URI of the source document
 * @param refValue - The $ref value to resolve
 * @returns Markdown string with the preview, or null if not found
 */
async function getRefPreview(
	context: LanguageServiceContext,
	shared: telescopeVolarContext,
	sourceUri: URI,
	refValue: string,
): Promise<string | null> {
	// Don't preview external URLs
	if (/^https?:/i.test(refValue)) {
		return `**External Reference**\n\n\`${refValue}\``;
	}

	let targetUri: URI;
	let pointer: string;

	if (refValue.startsWith("#")) {
		// Same-document reference
		targetUri = sourceUri;
		pointer = refValue.substring(1);
	} else {
		// Relative file path - resolve to absolute URI
		const resolved = resolveRef(sourceUri, refValue);
		targetUri = resolved.with({ fragment: "" });
		pointer = resolved.fragment || "";
	}

	// Try to get content from VirtualCode if file is open
	const vc = getDataVirtualCode(context, targetUri);
	if (vc) {
		return getPreviewFromVirtualCode(vc, pointer, targetUri.path);
	}

	// File not open - read from disk
	const fs = context.env.fs;
	if (!fs) return null;

	try {
		const content = await fs.readFile(targetUri);
		if (!content) return null;

		return getPreviewFromContent(content, pointer, targetUri.path);
	} catch {
		return null;
	}
}

/**
 * Get preview content from a VirtualCode.
 */
function getPreviewFromVirtualCode(
	vc: DataVirtualCode,
	pointer: string,
	filePath: string,
): string | null {
	const path = parseJsonPointer(pointer);
	const isYaml = /\.ya?ml$/i.test(filePath);

	let value: unknown;

	if (isYaml && vc.ast instanceof yaml.Document) {
		const node = vc.ast.getIn(path, true);
		if (node && typeof node === "object" && "toJSON" in node) {
			value = (node as yaml.Node).toJSON();
		} else {
			value = node;
		}
	} else {
		// For JSON, navigate through parsedObject
		value = getValueAtPath(vc.parsedObject, path);
	}

	if (value === undefined) return null;

	return formatPreview(value, pointer, filePath, isYaml);
}

/**
 * Get preview content from raw file content.
 */
function getPreviewFromContent(
	content: string,
	pointer: string,
	filePath: string,
): string | null {
	const path = parseJsonPointer(pointer);
	const isYaml = /\.ya?ml$/i.test(filePath);

	let value: unknown;

	try {
		if (isYaml) {
			const doc = yaml.parseDocument(content);
			const node = doc.getIn(path, true);
			if (node && typeof node === "object" && "toJSON" in node) {
				value = (node as yaml.Node).toJSON();
			} else {
				value = node;
			}
		} else {
			const parsed = JSON.parse(content);
			value = getValueAtPath(parsed, path);
		}
	} catch {
		return null;
	}

	if (value === undefined) return null;

	return formatPreview(value, pointer, filePath, isYaml);
}

/**
 * Navigate to a value at a JSON path.
 */
function getValueAtPath(obj: unknown, path: (string | number)[]): unknown {
	let current = obj;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		if (typeof current !== "object") return undefined;
		current = (current as Record<string | number, unknown>)[segment];
	}
	return current;
}

/**
 * Format the preview as markdown.
 */
function formatPreview(
	value: unknown,
	pointer: string,
	filePath: string,
	isYaml: boolean,
): string {
	const fileName = filePath.split("/").pop() || filePath;
	const lang = isYaml ? "yaml" : "json";

	// Serialize the value
	let serialized: string;
	if (isYaml) {
		serialized = yaml.stringify(value, { indent: 2 }).trim();
	} else {
		serialized = JSON.stringify(value, null, 2);
	}

	// Truncate if too long
	const maxLines = 20;
	const lines = serialized.split("\n");
	if (lines.length > maxLines) {
		serialized = lines.slice(0, maxLines).join("\n") + "\n# ... truncated";
	}

	const header = pointer
		? `**${fileName}** \`#${pointer}\``
		: `**${fileName}**`;

	return `${header}\n\n\`\`\`${lang}\n${serialized}\n\`\`\``;
}

/**
 * Create the OpenAPI service plugin for Volar.
 *
 * This plugin provides:
 * - **Diagnostics**: Rule-based validation for OpenAPI documents
 * - **Workspace Diagnostics**: Validation for all OpenAPI files in workspace
 * - **Document Links**: Clickable links for external $ref URLs
 * - **Hover**: Preview of $ref target content
 *
 * The plugin accesses IR and atoms directly from OpenAPIVirtualCode instances,
 * with cross-document coordination via WorkspaceIndex.
 *
 * @param shared - The shared telescope context with WorkspaceIndex and configuration
 * @returns Volar LanguageServicePlugin instance
 *
 * @example
 * ```typescript
 * const shared = new telescopeVolarContext(config);
 * const plugin = createOpenAPIServicePlugin(shared);
 *
 * // Plugin provides:
 * // - provideDiagnostics(document, token) -> Diagnostic[]
 * // - provideWorkspaceDiagnostics(token, previousIds) -> WorkspaceDiagnosticReport[]
 * // - provideDocumentLinks(document) -> DocumentLink[]
 * // - provideHover(document, position) -> Hover
 * ```
 */
export function createOpenAPIServicePlugin({
	shared,
}: {
	shared: telescopeVolarContext;
}): LanguageServicePlugin {
	const logger = shared.getLogger("OpenAPI Service");

	logger.log("Creating OpenAPI service plugin");

	return {
		name: "telescope-openapi-service",
		capabilities: {
			diagnosticProvider: {
				interFileDependencies: true,
				workspaceDiagnostics: true,
			},
			documentLinkProvider: {
				resolveProvider: true,
			},
			hoverProvider: true,
			// New capabilities - Code Actions
			codeActionProvider: {
				codeActionKinds: ["quickfix", "source.organizeImports"],
			},
			// Find All References
			referencesProvider: true,
			// Workspace Symbols
			workspaceSymbolProvider: {},
			// OpenAPI-Specific Completions
			completionProvider: {
				triggerCharacters: ['"', "'", "#", "/"],
			},
			// Rename Symbol
			renameProvider: {
				prepareProvider: true,
			},
			// Code Lens
			codeLensProvider: {
				resolveProvider: false,
			},
			// Inlay Hints
			inlayHintProvider: {
				resolveProvider: false,
			},
			// Enhanced Go to Definition
			definitionProvider: true,
			// Call Hierarchy
			callHierarchyProvider: true,
			// Semantic Tokens
			semanticTokensProvider: {
				legend: {
					tokenTypes: SEMANTIC_TOKEN_TYPES,
					tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
				},
			},
		},
		create(context: LanguageServiceContext) {
			return {
				/**
				 * Provide diagnostics for a single OpenAPI document.
				 *
				 * Runs configured rules against the document and returns
				 * any reported diagnostics.
				 */
				async provideDiagnostics(document, token) {
					if (token?.isCancellationRequested) return null;

					// Ensure OpenAPI rules are loaded before diagnostics
					await shared.rulesLoadPromise;

					try {
						// Use consolidated helper for VirtualCode access
						const resolved = resolveOpenAPIDocument(context, document);
						if (!resolved) {
							return [];
						}

						const { sourceUriString, virtualCode } = resolved;
						const baseUri = normalizeBaseUri(sourceUriString);

						// Collect all diagnostics
						const diagnostics: Diagnostic[] = [];

						// === Zod Schema Validation ===
						// Run Zod validation to get meaningful error messages
						const schemaKey = virtualCode.formatVirtualCode.schemaKey;
						if (schemaKey) {
							const zodSchema = getZodSchema(schemaKey);
							if (zodSchema) {
								const schemaDiagnostics = zodErrorsToDiagnostics(
									zodSchema,
									virtualCode.formatVirtualCode.parsedObject,
									virtualCode.formatVirtualCode,
									"openapi-schema",
								);
								diagnostics.push(...schemaDiagnostics);
							}
						}

						// === Rule-based Validation ===
						// Get workspace-specific rules
						const rules = shared.getRuleImplementationsForUri(baseUri);
						if (rules.length === 0) {
							logger.log(`No rules loaded for ${baseUri}`);
							return diagnostics;
						}

						// Filter to OpenAPI rules only
						const openApiRules = rules.filter(
							(rule) => !rule.meta.ruleType || rule.meta.ruleType === "openapi",
						);

						if (openApiRules.length === 0) return diagnostics;

						// Categorize rules by scope - per-document diagnostics only run single-file rules
						// Cross-file rules run in workspace diagnostics for better performance
						const { singleFile: singleFileRules } =
							categorizeRulesByScope(openApiRules);
						if (singleFileRules.length === 0) return diagnostics;

						// Build ProjectContext from VirtualCode (loads missing refs from file system)
						const projectContext = await buildProjectContextFromVirtualCode(
							shared,
							baseUri,
							virtualCode,
							context,
						);
						if (!projectContext) {
							logger.log(`Failed to build ProjectContext for ${baseUri}`);
							return diagnostics;
						}

						// Run single-file rules only (cross-file rules run in workspace diagnostics)
						const result = runEngine(
							projectContext,
							[baseUri],
							{ rules: singleFileRules },
							token,
						);

						// Add rule diagnostics
						if (result?.diagnostics) {
							diagnostics.push(...result.diagnostics);
						}

						return diagnostics;
					} catch (error) {
						const message =
							error instanceof Error
								? (error.stack ?? error.message)
								: String(error);
						logger.error(`Failed to lint ${document.uri}: ${message}`);
						return [];
					}
				},

				/**
				 * Provide workspace-wide diagnostics for all OpenAPI documents.
				 *
				 * On first call, performs an initial scan to discover all OpenAPI
				 * files. Subsequently, only processes affected files.
				 */
				async provideWorkspaceDiagnostics(
					token: CancellationToken,
					previousResultIds?: Map<string, string>,
				) {
					if (token?.isCancellationRequested) return null;

					// Ensure OpenAPI rules are loaded before workspace diagnostics
					await shared.rulesLoadPromise;

					return provideWorkspaceDiagnostics(
						shared,
						token,
						context,
						previousResultIds,
					);
				},

				/**
				 * Provide hover information for $ref values.
				 *
				 * Shows a preview of the referenced content when hovering over
				 * $ref values. This helps users understand what a reference
				 * points to without navigating away from the current document.
				 */
				async provideHover(document, position): Promise<Hover | null> {
					// Use consolidated helper for VirtualCode access
					const resolved = resolveOpenAPIDocument(context, document);
					if (!resolved) {
						return null;
					}

					const { sourceUri, sourceUriString, virtualCode } = resolved;

					// Get IR directly from VirtualCode
					const ir = virtualCode.getIR(sourceUriString);

					// Find $ref node at the cursor position
					const offset = document.offsetAt(position);
					const refNode = findRefNodeAtOffset(ir.root, offset, virtualCode);

					if (!refNode || typeof refNode.value !== "string") {
						return null;
					}

					const refValue = refNode.value;
					const refRange = virtualCode.locToRange(refNode.loc);
					if (!refRange) return null;

					try {
						// Resolve the reference and get preview content
						const preview = await getRefPreview(
							context,
							shared,
							sourceUri,
							refValue,
						);

						if (preview) {
							return {
								contents: {
									kind: "markdown",
									value: preview,
								},
								range: refRange,
							};
						}
					} catch (error) {
						logger.error(
							`Failed to get hover preview for ${refValue}: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					}

					return null;
				},

				/**
				 * Provide document links for $ref values.
				 *
				 * Returns clickable links for all $ref types:
				 * - External URLs (http:// and https://)
				 * - Same-document references (#/components/schemas/User)
				 * - Relative file paths (./schemas/User.yaml)
				 *
				 * The JSON pointer fragment is stored in `data` for resolution
				 * by `resolveDocumentLink` to provide precise navigation.
				 */
				provideDocumentLinks(document) {
					// Use consolidated helper for VirtualCode access
					const resolved = resolveOpenAPIDocument(context, document);
					if (!resolved) {
						return [];
					}

					const { sourceUri, sourceUriString, virtualCode } = resolved;

					// Get IR directly from VirtualCode
					const ir = virtualCode.getIR(sourceUriString);

					const links: Array<{
						range: Range;
						target: string;
						data?: { fragment?: string; sourceUri?: string };
					}> = [];
					const vc = virtualCode; // Capture for closure

					// Find all $ref nodes in IR
					function collectRefLinks(node: IRNode): void {
						if (
							node.kind === "string" &&
							node.key === "$ref" &&
							typeof node.value === "string"
						) {
							const ref = node.value;
							const range = vc.locToRange(node.loc);
							if (!range) return;

							let target: string;
							let fragment: string | undefined;
							let isSameDocument = false;

							if (/^https?:/i.test(ref)) {
								// External URL - use as-is (no resolution needed)
								target = ref;
							} else if (ref.startsWith("#")) {
								// Same-document reference
								target = sourceUriString;
								fragment = ref.substring(1); // Remove leading #
								isSameDocument = true;
							} else {
								// Relative file path - resolve to absolute URI
								const resolved = resolveRef(sourceUri, ref);
								// Store fragment separately for resolution
								fragment = resolved.fragment || undefined;
								// Target is the file URI without fragment
								target = resolved.with({ fragment: "" }).toString();
							}

							links.push({
								range,
								target,
								data: fragment
									? {
											fragment,
											// Store sourceUri for same-document links to ensure correct VirtualCode lookup
											sourceUri: isSameDocument ? sourceUriString : undefined,
										}
									: undefined,
							});
						}

						if (node.children) {
							for (const child of node.children) {
								collectRefLinks(child);
							}
						}
					}

					collectRefLinks(ir.root);
					logger.log("Links for", sourceUriString, `(${links.length} links)`);
					return links;
				},

				/**
				 * Resolve a document link to provide precise navigation.
				 *
				 * Converts the JSON pointer fragment stored in `data` to a
				 * line/column position using `#L{line},{column}` format that
				 * VSCode understands for navigation.
				 *
				 * For same-document links, uses the sourceUri stored in data
				 * to ensure correct VirtualCode lookup.
				 */
				async resolveDocumentLink(link: DocumentLink): Promise<DocumentLink> {
					// If no fragment data, return as-is
					if (!link.data?.fragment || !link.target) {
						logger.log("resolveDocumentLink: no fragment or target", {
							hasFragment: !!link.data?.fragment,
							hasTarget: !!link.target,
						});
						return link;
					}

					const fragment = link.data.fragment as string;
					const sourceUriFromData = link.data.sourceUri as string | undefined;

					logger.log("resolveDocumentLink: resolving", {
						target: link.target,
						fragment,
						sourceUri: sourceUriFromData,
					});

					try {
						// For same-document links, use the stored sourceUri for VirtualCode lookup
						// This ensures we find the correct VirtualCode even if URI formats differ
						const targetUriString = sourceUriFromData ?? link.target;
						const targetUri = URI.parse(targetUriString);

						const position = await findPositionAtPointer(
							context,
							shared,
							targetUri,
							fragment,
						);

						logger.log("resolveDocumentLink: position result", {
							target: link.target,
							fragment,
							position,
						});

						if (position) {
							// Use VSCode's #L{line},{column} format (1-based)
							const newTarget = `${link.target}#L${position.line + 1},${position.character + 1}`;
							logger.log("resolveDocumentLink: resolved to", newTarget);
							return { ...link, target: newTarget };
						}
					} catch (error) {
						logger.error(
							`Failed to resolve link: ${
								error instanceof Error ? error.message : String(error)
							}`,
						);
					}

					// Fallback: return link with JSON pointer fragment
					// This allows VSCode to at least open the file
					const fallbackTarget = `${link.target}#${fragment}`;
					logger.log("resolveDocumentLink: using fallback", fallbackTarget);
					return { ...link, target: fallbackTarget };
				},

				// ================================================================
				// Code Actions / Quick Fixes
				// ================================================================

				/**
				 * Provide code actions for OpenAPI documents.
				 * Generates quick fixes for common issues.
				 */
				provideCodeActions(document, range, codeActionContext) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return [];
					}

					return provideCodeActions(
						shared,
						context,
						{
							uri: document.uri,
							languageId: document.languageId,
							getText: () => document.getText(),
						},
						range,
						codeActionContext as CodeActionContext,
					);
				},

				// ================================================================
				// Find All References
				// ================================================================

				/**
				 * Find all references to a symbol at the given position.
				 */
				provideReferences(document, position, referenceContext) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return [];
					}

					return provideReferences(
						shared,
						context,
						{ uri: document.uri, languageId: document.languageId },
						position,
						referenceContext.includeDeclaration,
					);
				},

				// ================================================================
				// Workspace Symbols
				// ================================================================

				/**
				 * Provide workspace symbols for searching across all OpenAPI files.
				 */
				provideWorkspaceSymbols(query) {
					return provideWorkspaceSymbols(shared, context, query);
				},

				// ================================================================
				// OpenAPI-Specific Completions
				// ================================================================

				/**
				 * Provide OpenAPI-specific completion items.
				 */
				provideCompletionItems(document, position) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return null;
					}

					const items = provideOpenAPICompletions(
						shared,
						context,
						{
							uri: document.uri,
							languageId: document.languageId,
							getText: () => document.getText(),
						},
						position,
					);

					return items.length > 0 ? { isIncomplete: false, items } : null;
				},

				// ================================================================
				// Rename Symbol
				// ================================================================

				/**
				 * Prepare rename at a position.
				 */
				provideRenameRange(document, position) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return null;
					}

					return prepareRename(
						shared,
						context,
						{ uri: document.uri, languageId: document.languageId },
						position,
					);
				},

				/**
				 * Perform rename across workspace.
				 */
				provideRenameEdits(document, position, newName) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return null;
					}

					return provideRenameEdits(
						shared,
						context,
						{ uri: document.uri, languageId: document.languageId },
						position,
						newName,
					);
				},

				// ================================================================
				// Code Lens
				// ================================================================

				/**
				 * Provide code lenses for OpenAPI documents.
				 */
				provideCodeLenses(document) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return [];
					}

					return provideCodeLenses(shared, context, {
						uri: document.uri,
						languageId: document.languageId,
					});
				},

				// ================================================================
				// Inlay Hints
				// ================================================================

				/**
				 * Provide inlay hints for OpenAPI documents.
				 */
				provideInlayHints(document, range) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return [];
					}

					return provideInlayHints(
						shared,
						context,
						{ uri: document.uri, languageId: document.languageId },
						range,
					);
				},

				// ================================================================
				// Enhanced Go to Definition
				// ================================================================

				/**
				 * Provide enhanced go-to-definition for OpenAPI-specific references.
				 */
				provideDefinition(document, position) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return [];
					}

					return provideEnhancedDefinition(
						shared,
						context,
						{ uri: document.uri, languageId: document.languageId },
						position,
					);
				},

				// ================================================================
				// Call Hierarchy
				// ================================================================

				/**
				 * Prepare call hierarchy item at position.
				 */
				provideCallHierarchyItems(document, position) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return [];
					}

					return prepareCallHierarchy(
						shared,
						context,
						{ uri: document.uri, languageId: document.languageId },
						position,
					);
				},

				/**
				 * Provide incoming calls (what references this item).
				 */
				provideCallHierarchyIncomingCalls(item) {
					return provideCallHierarchyIncomingCalls(shared, context, item);
				},

				/**
				 * Provide outgoing calls (what this item references).
				 */
				provideCallHierarchyOutgoingCalls(item) {
					return provideCallHierarchyOutgoingCalls(shared, context, item);
				},

				// ================================================================
				// Semantic Tokens
				// ================================================================

				/**
				 * Provide semantic tokens for OpenAPI documents.
				 */
				provideDocumentSemanticTokens(document, range) {
					if (
						document.languageId !== "openapi-yaml" &&
						document.languageId !== "openapi-json"
					) {
						return null;
					}

					return provideSemanticTokens(
						shared,
						context,
						{
							uri: document.uri,
							languageId: document.languageId,
							getText: () => document.getText(),
						},
						range,
					);
				},

				/**
				 * Handle file system changes (deletions).
				 *
				 * Removes deleted files from indexes and marks them as affected.
				 */
				onDidChangeWatchedFiles({
					changes,
				}: {
					changes: Array<{ uri: string; type?: number }>;
				}) {
					for (const change of changes) {
						if (change.type === 3) {
							// Deleted
							shared.workspaceIndex.unregisterDocument(change.uri);
							shared.removeRootDocument(change.uri);
							shared.markAffected(change.uri);
							// Invalidate position cache for deleted file
							positionCache.invalidate(change.uri);
							// Invalidate project context cache
							shared.projectContextCache.invalidateUri(change.uri);
						}
					}
				},

				/**
				 * Dispose of resources when the service is shut down.
				 * Clears caches and releases any held resources.
				 */
				dispose() {
					logger.log("Disposing OpenAPI service");
					// Clear position cache
					positionCache.clear();
					// Clear project context cache
					shared.projectContextCache.clear();
				},
			};
		},
	};
}

/**
 * Provide workspace-wide diagnostics for all OpenAPI documents.
 *
 * This function implements the TypeScript-like project model for OpenAPI:
 *
 * 1. Uses the "project model" - known OpenAPI files from client scan or server discovery
 * 2. Processes each root document's dependency tree (via GraphIndex)
 * 3. Runs cross-file rules that need project context (unresolved refs, duplicate operationIds)
 * 4. Uses result caching for unchanged reports
 *
 * The key insight is that workspace diagnostics should use the pre-built project model
 * rather than re-scanning the filesystem on every request.
 *
 * @param shared - The shared telescope context
 * @param token - Cancellation token
 * @param languageServiceContext - Volar language service context
 * @param previousResultIds - Map of URI to previous result ID for caching
 * @returns Array of workspace diagnostic reports
 *
 * @internal
 */
async function provideWorkspaceDiagnostics(
	shared: telescopeVolarContext,
	token: CancellationToken,
	languageServiceContext: LanguageServiceContext,
	previousResultIds?: Map<string, string>,
): Promise<WorkspaceDocumentDiagnosticReport[] | null> {
	const logger = shared.getLogger("OpenAPI Workspace Diagnostics");
	const startTime = Date.now();

	if (token.isCancellationRequested) return null;

	// Ensure rules are loaded before processing diagnostics
	await shared.rulesLoadPromise;

	const workspaceIndex = shared.workspaceIndex;

	try {
		// =====================================================================
		// Phase 1: Determine files to process using project model
		// =====================================================================

		// First priority: use files sent from client via telescope/setOpenAPIFiles
		// This is the "TypeScript way" - client tells server what files are in the project
		let knownFiles = shared.getKnownOpenAPIFiles();

		// Fallback: if client hasn't sent files yet, perform discovery (legacy path)
		if (knownFiles.length === 0 && !shared.hasInitialScanBeenPerformed()) {
			logger.log("No files from client, performing fallback discovery...");
			knownFiles = await discoverOpenAPIFiles(shared, token, logger);
			shared.markInitialScanPerformed();
		}

		// Get affected URIs - files that changed since last diagnostics run
		const affectedUris = new Set(workspaceIndex.getAffectedUris());

		// Get root documents (files with openapi: x.x.x)
		const rootDocumentUris = shared.getRootDocumentUris();

		// Find all roots affected by the changed files
		const rootsToProcess = new Set<string>();

		for (const uri of affectedUris) {
			// If the affected file IS a root, process it
			if (rootDocumentUris.includes(uri)) {
				rootsToProcess.add(uri);
			}

			// Find any roots that depend on this file (it might be a fragment)
			const affectedRoots = workspaceIndex.getRootsAffectedByFile(uri);
			for (const rootUri of affectedRoots) {
				rootsToProcess.add(rootUri);
			}
		}

		// If no affected URIs but we have roots, process all roots on first run
		if (
			rootsToProcess.size === 0 &&
			rootDocumentUris.length > 0 &&
			!previousResultIds?.size
		) {
			for (const uri of rootDocumentUris) {
				rootsToProcess.add(uri);
			}
		}

		// Log project summary
		const projectSummary = workspaceIndex.getProjectSummary();
		logger.log(
			`Project model: ${projectSummary.rootCount} roots, ${projectSummary.totalFilesInTrees} total files in trees`,
		);
		logger.log(`Processing ${rootsToProcess.size} root document(s)`);

		if (rootsToProcess.size === 0) {
			// Return unchanged reports for previous results
			if (previousResultIds && previousResultIds.size > 0) {
				return Array.from(previousResultIds.entries()).map(
					([uri, resultId]) => ({
						kind: "unchanged" as const,
						uri,
						version: shared.documents.get(uri)?.version ?? null,
						resultId,
					}),
				);
			}
			return [];
		}

		// =====================================================================
		// Phase 2: Run cross-file rules on each root's dependency tree
		// =====================================================================

		const reports: WorkspaceDocumentDiagnosticReport[] = [];

		for (const rootUri of rootsToProcess) {
			if (token.isCancellationRequested) break;

			try {
				// Get VirtualCode for the root document
				const virtualCode = getOpenAPIVirtualCode(
					languageServiceContext,
					URI.parse(rootUri),
				);
				if (!virtualCode) {
					logger.log(`No VirtualCode for root ${rootUri}, skipping`);
					continue;
				}

				// Get rules for this URI
				const rules = shared.getRuleImplementationsForUri(rootUri);
				if (rules.length === 0) continue;

				// Filter to OpenAPI rules and categorize by scope
				const openApiRules = rules.filter(
					(rule) => !rule.meta.ruleType || rule.meta.ruleType === "openapi",
				);

				// Only run cross-file rules in workspace diagnostics
				// Single-file rules already ran in provideDiagnostics
				const { crossFile: crossFileRules } =
					categorizeRulesByScope(openApiRules);

				if (crossFileRules.length === 0) {
					logger.log(`No cross-file rules for ${rootUri}, skipping`);
					continue;
				}

				// Build ProjectContext using the cache for incremental updates
				// This is significantly faster than rebuilding from scratch each time
				const projectContext = await shared.projectContextCache.getOrBuild(
					rootUri,
					virtualCode,
					languageServiceContext,
					affectedUris,
				);
				if (!projectContext) {
					logger.log(`Failed to build ProjectContext for ${rootUri}`);
					continue;
				}

				// Get all URIs in this root's dependency tree
				const dependencyTree = workspaceIndex.getRootDependencyTree(rootUri);
				const treeUris = Array.from(dependencyTree);

				// Run cross-file rules on all files in the dependency tree
				const result = runEngine(
					projectContext,
					treeUris,
					{ rules: crossFileRules },
					token,
				);

				// Create reports for each file in the tree
				const diagnosticsByUri = new Map<string, typeof result.diagnostics>();
				for (const diagnostic of result?.diagnostics ?? []) {
					const existing = diagnosticsByUri.get(diagnostic.uri) ?? [];
					existing.push(diagnostic);
					diagnosticsByUri.set(diagnostic.uri, existing);
				}

				// Generate reports for files with diagnostics
				for (const [uri, diagnostics] of diagnosticsByUri) {
					const version = shared.documents.get(uri)?.version ?? null;
					const hash = computeDiagnosticsHash(diagnostics, version);
					const currentResultId = workspaceIndex.getResultId(uri, hash);
					const previousResultId = previousResultIds?.get(uri);

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
			} catch (error) {
				logger.error(
					`Failed for root ${rootUri}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
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

/**
 * Discover OpenAPI files using glob patterns (fallback when client hasn't sent files).
 *
 * This is the legacy path - ideally the client sends files via telescope/setOpenAPIFiles.
 *
 * @internal
 */
async function discoverOpenAPIFiles(
	shared: telescopeVolarContext,
	token: CancellationToken,
	logger: {
		log: (...args: unknown[]) => void;
		warn: (...args: unknown[]) => void;
		error: (...args: unknown[]) => void;
	},
): Promise<string[]> {
	const discoveredUris: string[] = [];

	try {
		const config = shared.getConfig();
		const patterns = config.openapi?.patterns ?? [];
		const workspaceFolderUri = shared.getWorkspaceFolderUri();

		if (patterns.length > 0 && workspaceFolderUri) {
			const workspaceUri = URI.parse(workspaceFolderUri);
			const files = await globFiles(shared.getFileSystem(), patterns, [
				workspaceUri,
			]);

			logger.log(`Found ${files.length} files matching patterns`);

			// Verify each file is actually an OpenAPI document by content analysis
			for (const uri of files) {
				if (token.isCancellationRequested) break;
				try {
					const isOpenAPI = await shared.isOpenAPIFileByContent(uri);
					if (isOpenAPI) {
						discoveredUris.push(uri);
						shared.addRootDocument(uri);
					}
				} catch (error) {
					logger.warn(
						`Skipping ${uri}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}
			}

			logger.log(`Discovered ${discoveredUris.length} OpenAPI files`);
		}
	} catch (error) {
		logger.error(
			`Discovery failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	return discoveredUris;
}

/**
 * Compute a hash of diagnostics for change detection.
 *
 * This hash is used to determine if diagnostics have changed between
 * requests, allowing unchanged reports to be returned efficiently.
 *
 * @param diagnostics - Array of diagnostics to hash
 * @param version - Document version (included in hash)
 * @returns SHA1 hash string
 *
 * @internal
 */
function computeDiagnosticsHash(
	diagnostics: Diagnostic[],
	version: number | null,
): string {
	const sorted = diagnostics.slice().sort((a, b) => {
		const lineDiff = a.range.start.line - b.range.start.line;
		if (lineDiff !== 0) return lineDiff;
		const charDiff = a.range.start.character - b.range.start.character;
		if (charDiff !== 0) return charDiff;
		return a.message.localeCompare(b.message);
	});

	const payload = {
		version,
		diagnostics: sorted.map((d) => ({
			range: d.range,
			severity: d.severity,
			code: d.code,
			message: d.message,
		})),
	};

	return createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}
