/**
 * OpenAPI Additional LSP Features
 *
 * This module provides advanced LSP features for OpenAPI documents:
 * - Code Actions / Quick Fixes
 * - Find All References
 * - Workspace Symbols
 * - OpenAPI-Specific Completions
 * - Rename Symbol
 * - Code Lens
 * - Inlay Hints
 * - Go to Definition Enhancements
 * - Call Hierarchy
 * - Semantic Tokens
 *
 * @module lsp/services/openapi-features
 */

import type { LanguageServiceContext } from "@volar/language-service";
import * as jsonc from "jsonc-parser";
import type {
	CallHierarchyIncomingCall,
	CallHierarchyItem,
	CallHierarchyOutgoingCall,
	CodeAction,
	CodeActionKind,
	CodeLens,
	Command,
	CompletionItem,
	CompletionItemKind,
	DocumentSymbol,
	InlayHint,
	InlayHintKind,
	Location,
	LocationLink,
	Position,
	Range,
	SymbolKind,
	TextEdit,
	WorkspaceEdit,
	WorkspaceSymbol,
} from "vscode-languageserver-protocol";
import { URI } from "vscode-uri";
import * as yaml from "yaml";
import type {
	ComponentAtom,
	OperationAtom,
	SchemaAtom,
} from "../../engine/indexes/atoms.js";
import type { GraphNode } from "../../engine/indexes/graph-types.js";
import type { IRNode } from "../../engine/ir/types.js";
import { getLineCol } from "../../engine/utils/line-offset-utils.js";
import {
	joinPointer,
	parseJsonPointer,
} from "../../engine/utils/pointer-utils.js";
import { normalizeUri, resolveRef } from "../../engine/utils/ref-utils.js";
import { OpenAPIVirtualCode } from "../languages/virtualCodes/openapi-virtual-code.js";
import type { telescopeVolarContext } from "../workspace/context.js";
import {
	getDataVirtualCode,
	getOpenAPIVirtualCode,
	resolveOpenAPIDocument,
	resolveOpenAPIDocumentWithIR,
} from "./shared/virtual-code-utils.js";

// ============================================================================
// Helper Functions
// ============================================================================

// Re-export shared utilities for backwards compatibility
export {
	getDataVirtualCode,
	getOpenAPIVirtualCode,
	resolveOpenAPIDocument,
	resolveOpenAPIDocumentWithIR,
} from "./shared/virtual-code-utils.js";

/**
 * Convert JSON pointer path segments to string representation.
 * Delegates to shared joinPointer utility.
 */
function pointerPathToString(path: (string | number)[]): string {
	return joinPointer(path.map(String));
}

/**
 * Find all $ref nodes in an IR tree.
 */
function findAllRefNodes(node: IRNode): Array<{ node: IRNode; ref: string }> {
	const results: Array<{ node: IRNode; ref: string }> = [];

	if (
		node.kind === "string" &&
		node.key === "$ref" &&
		typeof node.value === "string"
	) {
		results.push({ node, ref: node.value });
	}

	if (node.children) {
		for (const child of node.children) {
			results.push(...findAllRefNodes(child));
		}
	}

	return results;
}

/**
 * Find node at a specific JSON pointer in IR.
 */
function findNodeAtPointer(root: IRNode, pointer: string): IRNode | null {
	if (pointer === "#" || pointer === "") return root;

	const path = parseJsonPointer(pointer);
	let current: IRNode = root;

	for (const segment of path) {
		if (!current.children) return null;

		const found = current.children.find((child) => {
			if (typeof segment === "number") {
				return child.kind === "object" || child.kind === "array";
			}
			return child.key === segment;
		});

		if (!found) return null;
		current = found;
	}

	return current;
}

/**
 * Get the key from a JSON pointer.
 */
function getPointerKey(pointer: string): string | undefined {
	const path = parseJsonPointer(pointer);
	const last = path[path.length - 1];
	return typeof last === "string" ? last : undefined;
}

// ============================================================================
// 1. Code Actions / Quick Fixes
// ============================================================================

export interface CodeActionContext {
	diagnostics: Array<{
		range: Range;
		message: string;
		code?: string | number;
		data?: unknown;
	}>;
}

/**
 * Provide code actions for OpenAPI documents.
 * Generates quick fixes for common issues.
 */
export function provideCodeActions(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string; getText(): string },
	range: Range,
	actionContext: CodeActionContext,
): CodeAction[] {
	try {
		const actions: CodeAction[] = [];

		// Use consolidated helper for VirtualCode access
		const resolved = resolveOpenAPIDocument(context, document);
		if (!resolved) return actions;

		const { sourceUriString, virtualCode } = resolved;

		const text = document.getText();
		const isYaml =
			document.languageId === "openapi-yaml" || document.languageId === "yaml";

		// Process each diagnostic to generate fixes
		for (const diagnostic of actionContext.diagnostics) {
			const code = String(diagnostic.code ?? "");

			// Add missing description
			if (
				code.includes("description") ||
				diagnostic.message.toLowerCase().includes("description")
			) {
				actions.push({
					title: "Add description",
					kind: "quickfix" as CodeActionKind,
					diagnostics: [diagnostic as any],
					edit: {
						changes: {
							[document.uri]: [
								createAddFieldEdit(
									text,
									range.start,
									"description",
									"TODO: Add description",
									isYaml,
								),
							],
						},
					},
				});
			}

			// Add missing summary
			if (
				code.includes("summary") ||
				diagnostic.message.toLowerCase().includes("summary")
			) {
				actions.push({
					title: "Add summary",
					kind: "quickfix" as CodeActionKind,
					diagnostics: [diagnostic as any],
					edit: {
						changes: {
							[document.uri]: [
								createAddFieldEdit(
									text,
									range.start,
									"summary",
									"TODO: Add summary",
									isYaml,
								),
							],
						},
					},
				});
			}

			// Add missing operationId
			if (
				code.includes("operationId") ||
				diagnostic.message.toLowerCase().includes("operationid")
			) {
				const suggestedId = generateOperationId(virtualCode, range);
				actions.push({
					title: `Add operationId: "${suggestedId}"`,
					kind: "quickfix" as CodeActionKind,
					diagnostics: [diagnostic as any],
					edit: {
						changes: {
							[document.uri]: [
								createAddFieldEdit(
									text,
									range.start,
									"operationId",
									suggestedId,
									isYaml,
								),
							],
						},
					},
				});
			}

			// Fix path casing (kebab-case)
			if (
				code.includes("kebab") ||
				diagnostic.message.toLowerCase().includes("kebab")
			) {
				const lineText = getLineText(text, range.start.line);
				const fixed = toKebabCase(lineText);
				if (fixed !== lineText) {
					actions.push({
						title: "Convert to kebab-case",
						kind: "quickfix" as CodeActionKind,
						diagnostics: [diagnostic as any],
						edit: {
							changes: {
								[document.uri]: [
									{
										range: {
											start: { line: range.start.line, character: 0 },
											end: {
												line: range.start.line,
												character: lineText.length,
											},
										},
										newText: fixed,
									},
								],
							},
						},
					});
				}
			}
		}

		// Source actions (always available)
		actions.push({
			title: "Sort tags alphabetically",
			kind: "source.organizeImports" as CodeActionKind,
			command: {
				title: "Sort Tags",
				command: "telescope.sortTags",
				arguments: [sourceUriString],
			},
		});

		return actions;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideCodeActions failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Create a text edit to add a field.
 */
function createAddFieldEdit(
	text: string,
	position: Position,
	field: string,
	value: string,
	isYaml: boolean,
): TextEdit {
	// Find the indentation of the current line
	const lines = text.split("\n");
	const currentLine = lines[position.line] ?? "";
	const indentMatch = currentLine.match(/^(\s*)/);
	const indent = indentMatch ? indentMatch[1] : "";

	const newText = isYaml
		? `${indent}${field}: ${value}\n`
		: `${indent}"${field}": "${value}",\n`;

	return {
		range: {
			start: { line: position.line + 1, character: 0 },
			end: { line: position.line + 1, character: 0 },
		},
		newText,
	};
}

/**
 * Generate a suggested operationId based on context.
 */
function generateOperationId(vc: OpenAPIVirtualCode, range: Range): string {
	// Try to extract path and method from context
	const text = vc.getRawText();
	const lines = text.split("\n");

	// Look backwards for path and method
	let method = "operation";
	let path = "";

	for (let i = range.start.line; i >= 0 && i > range.start.line - 20; i--) {
		const line = lines[i] ?? "";

		// Check for HTTP method
		const methodMatch = line.match(
			/^\s*(get|post|put|delete|patch|head|options|trace):/i,
		);
		if (methodMatch?.[1]) {
			method = methodMatch[1].toLowerCase();
		}

		// Check for path
		const pathMatch = line.match(/^\s*['"]?(\/[^'":\s]+)['"]?:/);
		if (pathMatch?.[1]) {
			path = pathMatch[1];
			break;
		}
	}

	// Convert path to camelCase identifier
	if (path) {
		const pathParts = path
			.replace(/[{}]/g, "")
			.split("/")
			.filter(Boolean)
			.map((part, i) =>
				i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
			);

		return (
			method +
			pathParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("")
		);
	}

	return `${method}Resource`;
}

/**
 * Get a specific line of text.
 */
function getLineText(text: string, line: number): string {
	const lines = text.split("\n");
	return lines[line] ?? "";
}

/**
 * Convert text to kebab-case.
 */
function toKebabCase(text: string): string {
	return text
		.replace(/([a-z])([A-Z])/g, "$1-$2")
		.replace(/[\s_]+/g, "-")
		.toLowerCase();
}

// ============================================================================
// 2. Find All References
// ============================================================================

/**
 * Find all references to a symbol at the given position.
 */
export function provideReferences(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
	position: Position,
	includeDeclaration: boolean,
): Location[] {
	try {
		const locations: Location[] = [];

		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return locations;

		const { sourceUriString, virtualCode } = resolved;
		const ir = resolved.getIR();
		const text = resolved.getRawText();
		const lineOffsets = resolved.getLineOffsets();

		// Find the node at the cursor position
		const offset = positionToOffset(text, position);
		const nodeAtCursor = findNodeAtOffset(ir.root, offset);

		if (!nodeAtCursor) return locations;

		// Determine what we're looking for
		const workspaceIndex = shared.workspaceIndex;
		const graphIndex = workspaceIndex.getGraphIndex();
		const opIdIndex = workspaceIndex.getOpIdIndex();

		// Check if cursor is on an operationId
		if (
			nodeAtCursor.key === "operationId" &&
			typeof nodeAtCursor.value === "string"
		) {
			const operationId = nodeAtCursor.value;
			const occurrences = opIdIndex.getOccurrences(operationId);

			for (const occ of occurrences) {
				const range = offsetToRange(
					text,
					occ.loc.start ?? 0,
					occ.loc.end ?? occ.loc.start ?? 0,
					lineOffsets,
				);
				if (range) {
					locations.push({ uri: occ.uri, range });
				}
			}

			return locations;
		}

		// Check if cursor is on a $ref target (component definition)
		const componentPointer = nodeAtCursor.ptr;
		if (componentPointer?.startsWith("#/components/")) {
			// This is a component - find all $refs pointing to it
			const targetNode: GraphNode = {
				uri: sourceUriString,
				pointer: componentPointer,
			};
			const dependents = graphIndex.dependentsOf(targetNode);

			// Include declaration if requested
			if (includeDeclaration && nodeAtCursor.loc) {
				const range = virtualCode.locToRange(nodeAtCursor.loc);
				if (range) {
					locations.push({ uri: sourceUriString, range });
				}
			}

			// Add all references
			for (const dep of dependents) {
				const depVc = getOpenAPIVirtualCode(context, URI.parse(dep.uri));
				if (depVc) {
					const depIr = depVc.getIR(dep.uri);
					const refNode = findNodeAtPointer(depIr.root, dep.pointer);
					if (refNode?.loc) {
						const range = depVc.locToRange(refNode.loc);
						if (range) {
							locations.push({ uri: dep.uri, range });
						}
					}
				}
			}
		}

		// Check if cursor is on a $ref value
		if (nodeAtCursor.key === "$ref" && typeof nodeAtCursor.value === "string") {
			const refValue = nodeAtCursor.value;

			// Find all nodes that reference the same target
			const refs = findAllRefNodes(ir.root);
			for (const { node: refNode } of refs) {
				if (refNode.value === refValue && refNode.loc) {
					const range = virtualCode.locToRange(refNode.loc);
					if (range) {
						locations.push({ uri: sourceUriString, range });
					}
				}
			}
		}

		return locations;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideReferences failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Convert position to byte offset.
 */
function positionToOffset(text: string, position: Position): number {
	const lines = text.split("\n");
	let offset = 0;

	for (let i = 0; i < position.line && i < lines.length; i++) {
		offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
	}

	return offset + position.character;
}

/**
 * Convert byte offsets to range.
 */
function offsetToRange(
	text: string,
	start: number,
	end: number,
	lineOffsets: number[],
): Range | null {
	const startPos = getLineCol(start, lineOffsets);
	const endPos = getLineCol(end, lineOffsets);

	if (!startPos || !endPos) return null;

	return {
		start: { line: startPos.line - 1, character: startPos.col - 1 },
		end: { line: endPos.line - 1, character: endPos.col - 1 },
	};
}

/**
 * Find IR node at a specific byte offset.
 */
function findNodeAtOffset(node: IRNode, offset: number): IRNode | null {
	if (node.loc) {
		const start = node.loc.start ?? 0;
		const end = node.loc.end ?? start;

		if (offset < start || offset > end) {
			return null;
		}
	}

	// Check children first (more specific)
	if (node.children) {
		for (const child of node.children) {
			const found = findNodeAtOffset(child, offset);
			if (found) return found;
		}
	}

	// Return this node if offset is within range
	if (node.loc) {
		const start = node.loc.start ?? 0;
		const end = node.loc.end ?? start;
		if (offset >= start && offset <= end) {
			return node;
		}
	}

	return null;
}

// ============================================================================
// 3. Workspace Symbols
// ============================================================================

/**
 * Provide workspace symbols for searching across all OpenAPI files.
 */
export function provideWorkspaceSymbols(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	query: string,
): WorkspaceSymbol[] {
	try {
		const symbols: WorkspaceSymbol[] = [];
		const lowerQuery = query.toLowerCase();

		// Get root documents from shared context
		const rootUris = shared.getRootDocumentUris();

		for (const uriString of rootUris) {
			const uri = URI.parse(uriString);
			const sourceScript = context.language.scripts.get(uri);
			const virtualCode = sourceScript?.generated?.root;
			if (!(virtualCode instanceof OpenAPIVirtualCode)) continue;

			const atoms = virtualCode.getAtoms(uriString);

			// Add operations
			for (const op of atoms.operations) {
				const name = op.operationId ?? `${op.method} ${op.path}`;
				if (name.toLowerCase().includes(lowerQuery)) {
					const range = virtualCode.locToRange(op.loc);
					if (range) {
						symbols.push({
							name,
							kind: 6 as SymbolKind, // Method
							location: { uri: op.uri, range },
							containerName: op.path,
						});
					}
				}
			}

			// Add components
			for (const comp of atoms.components) {
				if (comp.name.toLowerCase().includes(lowerQuery)) {
					const range = virtualCode.locToRange(comp.loc);
					if (range) {
						symbols.push({
							name: comp.name,
							kind: getSymbolKindForComponent(comp.type),
							location: { uri: comp.uri, range },
							containerName: `components/${comp.type}`,
						});
					}
				}
			}

			// Add schemas
			for (const schema of atoms.schemas) {
				if (schema.name && schema.name.toLowerCase().includes(lowerQuery)) {
					const range = virtualCode.locToRange(schema.loc);
					if (range) {
						symbols.push({
							name: schema.name,
							kind: 23 as SymbolKind, // Struct
							location: { uri: schema.uri, range },
							containerName: "components/schemas",
						});
					}
				}
			}
		}

		return symbols;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideWorkspaceSymbols failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Get symbol kind for a component type.
 */
function getSymbolKindForComponent(type: string): SymbolKind {
	switch (type) {
		case "schemas":
			return 23 as SymbolKind; // Struct
		case "responses":
			return 8 as SymbolKind; // Field
		case "parameters":
			return 13 as SymbolKind; // Variable
		case "requestBodies":
			return 8 as SymbolKind; // Field
		case "headers":
			return 14 as SymbolKind; // Constant
		case "securitySchemes":
			return 15 as SymbolKind; // Key
		case "links":
			return 18 as SymbolKind; // Interface
		case "callbacks":
			return 24 as SymbolKind; // Event
		case "examples":
			return 7 as SymbolKind; // Property
		default:
			return 5 as SymbolKind; // Class
	}
}

// ============================================================================
// 4. OpenAPI-Specific Completions
// ============================================================================

/**
 * Provide OpenAPI-specific completion items.
 */
export function provideOpenAPICompletions(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string; getText(): string },
	position: Position,
): CompletionItem[] {
	try {
		const items: CompletionItem[] = [];

		// Use consolidated helper for VirtualCode access
		const resolved = resolveOpenAPIDocument(context, document);
		if (!resolved) return items;

		const { sourceUri, sourceUriString, virtualCode } = resolved;

		const text = document.getText();
		const lines = text.split("\n");
		const currentLine = lines[position.line] ?? "";
		const beforeCursor = currentLine.substring(0, position.character);

		// Check if we're completing a $ref value
		if (
			beforeCursor.includes("$ref") &&
			(beforeCursor.includes(':"') || beforeCursor.includes(": '"))
		) {
			items.push(...getRefCompletions(shared, context, sourceUri, virtualCode));
		}

		// Check if we're completing a security scheme reference
		if (
			beforeCursor.includes("security:") ||
			/^\s+-\s+\w*$/.test(beforeCursor)
		) {
			items.push(...getSecuritySchemeCompletions(virtualCode, sourceUriString));
		}

		// Check if we're completing tags
		if (
			beforeCursor.includes("tags:") ||
			/^\s+-\s+['"]\w*$/.test(beforeCursor)
		) {
			items.push(...getTagCompletions(virtualCode, sourceUriString));
		}

		// Check if we're completing a response status code
		if (
			/responses:\s*$/.test(beforeCursor) ||
			/^\s+['"]?\d*['"]?:?\s*$/.test(beforeCursor)
		) {
			items.push(...getResponseCodeCompletions());
		}

		// Check if we're completing media types
		if (
			beforeCursor.includes("content:") ||
			/^\s+['"]\w*$/.test(beforeCursor)
		) {
			items.push(...getMediaTypeCompletions());
		}

		return items;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideOpenAPICompletions failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Get completion items for $ref values.
 */
function getRefCompletions(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	sourceUri: URI,
	virtualCode: OpenAPIVirtualCode,
): CompletionItem[] {
	const items: CompletionItem[] = [];
	const sourceUriString = sourceUri.toString();
	const atoms = virtualCode.getAtoms(sourceUriString);

	// Add schema refs
	for (const schema of atoms.schemas) {
		if (schema.name) {
			items.push({
				label: `#/components/schemas/${schema.name}`,
				kind: 12 as CompletionItemKind, // Value
				detail: "Schema reference",
				insertText: `#/components/schemas/${schema.name}`,
			});
		}
	}

	// Add component refs
	for (const comp of atoms.components) {
		items.push({
			label: `#/components/${comp.type}/${comp.name}`,
			kind: 12 as CompletionItemKind, // Value
			detail: `${comp.type} reference`,
			insertText: `#/components/${comp.type}/${comp.name}`,
		});
	}

	return items;
}

/**
 * Get completion items for security scheme references.
 */
function getSecuritySchemeCompletions(
	virtualCode: OpenAPIVirtualCode,
	uri: string,
): CompletionItem[] {
	const items: CompletionItem[] = [];
	const atoms = virtualCode.getAtoms(uri);

	for (const scheme of atoms.securitySchemes) {
		items.push({
			label: scheme.name,
			kind: 15 as CompletionItemKind, // Keyword
			detail: `${scheme.type} security scheme`,
			insertText: `${scheme.name}: []`,
		});
	}

	return items;
}

/**
 * Get completion items for tags.
 */
function getTagCompletions(
	virtualCode: OpenAPIVirtualCode,
	uri: string,
): CompletionItem[] {
	const items: CompletionItem[] = [];
	const parsedObject = virtualCode.parsedObject as Record<string, unknown>;
	const tags = parsedObject.tags as
		| Array<{ name: string; description?: string }>
		| undefined;

	if (Array.isArray(tags)) {
		for (const tag of tags) {
			if (tag.name) {
				items.push({
					label: tag.name,
					kind: 20 as CompletionItemKind, // EnumMember
					detail: tag.description ?? "Tag",
				});
			}
		}
	}

	return items;
}

/**
 * Get completion items for response status codes.
 */
function getResponseCodeCompletions(): CompletionItem[] {
	return [
		{ label: "200", kind: 12 as CompletionItemKind, detail: "OK" },
		{ label: "201", kind: 12 as CompletionItemKind, detail: "Created" },
		{ label: "204", kind: 12 as CompletionItemKind, detail: "No Content" },
		{ label: "400", kind: 12 as CompletionItemKind, detail: "Bad Request" },
		{ label: "401", kind: 12 as CompletionItemKind, detail: "Unauthorized" },
		{ label: "403", kind: 12 as CompletionItemKind, detail: "Forbidden" },
		{ label: "404", kind: 12 as CompletionItemKind, detail: "Not Found" },
		{ label: "409", kind: 12 as CompletionItemKind, detail: "Conflict" },
		{
			label: "422",
			kind: 12 as CompletionItemKind,
			detail: "Unprocessable Entity",
		},
		{
			label: "500",
			kind: 12 as CompletionItemKind,
			detail: "Internal Server Error",
		},
		{
			label: "default",
			kind: 12 as CompletionItemKind,
			detail: "Default response",
		},
	];
}

/**
 * Get completion items for media types.
 */
function getMediaTypeCompletions(): CompletionItem[] {
	return [
		{
			label: "application/json",
			kind: 12 as CompletionItemKind,
			detail: "JSON",
		},
		{ label: "application/xml", kind: 12 as CompletionItemKind, detail: "XML" },
		{
			label: "application/x-www-form-urlencoded",
			kind: 12 as CompletionItemKind,
			detail: "Form data",
		},
		{
			label: "multipart/form-data",
			kind: 12 as CompletionItemKind,
			detail: "Multipart form",
		},
		{
			label: "text/plain",
			kind: 12 as CompletionItemKind,
			detail: "Plain text",
		},
		{ label: "text/html", kind: 12 as CompletionItemKind, detail: "HTML" },
		{
			label: "application/octet-stream",
			kind: 12 as CompletionItemKind,
			detail: "Binary",
		},
		{ label: "application/pdf", kind: 12 as CompletionItemKind, detail: "PDF" },
		{ label: "image/png", kind: 12 as CompletionItemKind, detail: "PNG image" },
		{
			label: "image/jpeg",
			kind: 12 as CompletionItemKind,
			detail: "JPEG image",
		},
	];
}

// ============================================================================
// 5. Rename Symbol
// ============================================================================

/**
 * Prepare rename at a position.
 */
export function prepareRename(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
	position: Position,
): { range: Range; placeholder: string } | null {
	try {
		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return null;

		const { virtualCode } = resolved;
		const ir = resolved.getIR();
		const text = resolved.getRawText();
		const offset = positionToOffset(text, position);
		const node = findNodeAtOffset(ir.root, offset);

		if (!node) return null;

		// Check if this is a renameable symbol
		if (
			node.key === "operationId" &&
			typeof node.value === "string" &&
			node.loc
		) {
			const range = virtualCode.locToRange(node.loc);
			if (range) {
				return { range, placeholder: node.value };
			}
		}

		// Check if this is a component name
		if (node.ptr?.startsWith("#/components/") && node.key && node.loc) {
			const range = virtualCode.locToRange(node.loc);
			if (range) {
				return { range, placeholder: node.key };
			}
		}

		return null;
	} catch (error) {
		console.error(
			`[OpenAPI Features] prepareRename failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

/**
 * Perform rename across workspace.
 */
export function provideRenameEdits(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
	position: Position,
	newName: string,
): WorkspaceEdit | null {
	try {
		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return null;

		const { sourceUriString, virtualCode } = resolved;
		const ir = resolved.getIR();
		const text = resolved.getRawText();
		const offset = positionToOffset(text, position);
		const node = findNodeAtOffset(ir.root, offset);

		if (!node) return null;

		const changes: Record<string, TextEdit[]> = {};

		// Handle operationId rename
		if (node.key === "operationId" && typeof node.value === "string") {
			const oldName = node.value;
			const opIdIndex = shared.workspaceIndex.getOpIdIndex();
			const occurrences = opIdIndex.getOccurrences(oldName);

			for (const occ of occurrences) {
				const occVc = getOpenAPIVirtualCode(context, URI.parse(occ.uri));
				if (occVc) {
					const occIr = occVc.getIR(occ.uri);
					// Find the operationId node
					const opNode = findNodeAtPointer(
						occIr.root,
						`${occ.ptr}/operationId`,
					);
					if (opNode?.loc) {
						const range = occVc.locToRange(opNode.loc);
						if (range) {
							const edits = changes[occ.uri] ?? [];
							edits.push({ range, newText: newName });
							changes[occ.uri] = edits;
						}
					}
				}
			}

			// Also find operationId references in links/callbacks
			const rootUris = shared.getRootDocumentUris();
			for (const uriStr of rootUris) {
				const uri = URI.parse(uriStr);
				const sourceScript = context.language.scripts.get(uri);
				const vc = sourceScript?.generated?.root;
				if (!(vc instanceof OpenAPIVirtualCode)) continue;

				const vcIr = vc.getIR(uriStr);
				findOperationIdReferences(vcIr.root, oldName, (refNode) => {
					if (refNode.loc) {
						const range = vc.locToRange(refNode.loc);
						if (range) {
							const edits = changes[uriStr] ?? [];
							edits.push({ range, newText: newName });
							changes[uriStr] = edits;
						}
					}
				});
			}

			return { changes };
		}

		// Handle component rename
		if (node.ptr?.startsWith("#/components/") && node.key) {
			const oldName = node.key;
			const oldRef = node.ptr;
			const graphIndex = shared.workspaceIndex.getGraphIndex();
			const targetNode: GraphNode = { uri: sourceUriString, pointer: oldRef };

			// Rename the definition
			if (node.loc) {
				const range = virtualCode.locToRange({
					...node.loc,
					end: node.loc.start ?? 0 + oldName.length,
				});
				if (range) {
					if (!changes[sourceUriString]) changes[sourceUriString] = [];
					changes[sourceUriString].push({ range, newText: newName });
				}
			}

			// Find all $refs pointing to this component
			const dependents = graphIndex.dependentsOf(targetNode);
			for (const dep of dependents) {
				const depVc = getOpenAPIVirtualCode(context, URI.parse(dep.uri));
				if (depVc) {
					const depIr = depVc.getIR(dep.uri);
					const refNode = findNodeAtPointer(depIr.root, dep.pointer);
					if (
						refNode?.kind === "string" &&
						refNode.key === "$ref" &&
						typeof refNode.value === "string"
					) {
						// Update the $ref value
						const newRef = refNode.value.replace(oldName, newName);
						if (refNode.loc) {
							const range = depVc.locToRange(refNode.loc);
							if (range) {
								const edits = changes[dep.uri] ?? [];
								edits.push({ range, newText: newRef });
								changes[dep.uri] = edits;
							}
						}
					}
				}
			}

			return { changes };
		}

		return null;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideRenameEdits failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

/**
 * Find all operationId references in links/callbacks.
 */
function findOperationIdReferences(
	node: IRNode,
	operationId: string,
	callback: (node: IRNode) => void,
): void {
	// Check if this is an operationId reference in a link
	if (node.key === "operationId" && node.value === operationId) {
		callback(node);
	}

	if (node.children) {
		for (const child of node.children) {
			findOperationIdReferences(child, operationId, callback);
		}
	}
}

// ============================================================================
// 6. Code Lens
// ============================================================================

/**
 * Provide code lenses for OpenAPI documents.
 */
export function provideCodeLenses(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
): CodeLens[] {
	try {
		const lenses: CodeLens[] = [];

		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return lenses;

		const { sourceUriString, virtualCode } = resolved;
		const atoms = resolved.getAtoms();
		const graphIndex = shared.workspaceIndex.getGraphIndex();

		// Add reference count lenses for schemas
		for (const schema of atoms.schemas) {
			if (!schema.name) continue;

			const range = virtualCode.locToRange(schema.loc);
			if (!range) continue;

			const targetNode: GraphNode = { uri: schema.uri, pointer: schema.ptr };
			const dependents = graphIndex.dependentsOf(targetNode);
			const refCount = dependents.length;

			lenses.push({
				range,
				command: {
					title: `${refCount} reference${refCount !== 1 ? "s" : ""}`,
					command: "telescope.showReferences",
					arguments: [sourceUriString, range.start, dependents],
				},
			});
		}

		// Add response summary lenses for operations
		for (const op of atoms.operations) {
			const range = virtualCode.locToRange(op.loc);
			if (!range) continue;

			// Get operation responses
			const ir = virtualCode.getIR(sourceUriString);
			const opNode = findNodeAtPointer(ir.root, op.ptr);
			const responsesNode = opNode?.children?.find(
				(c) => c.key === "responses",
			);
			const responseCodes: string[] = [];

			if (responsesNode?.children) {
				for (const child of responsesNode.children) {
					if (child.key) {
						responseCodes.push(child.key);
					}
				}
			}

			if (responseCodes.length > 0) {
				lenses.push({
					range,
					command: {
						title: `Responses: ${responseCodes.join(", ")}`,
						command: "",
						arguments: [],
					},
				});
			}

			// Add security info
			const securityNode = opNode?.children?.find((c) => c.key === "security");
			if (securityNode?.children && securityNode.children.length > 0) {
				const schemes: string[] = [];
				for (const reqNode of securityNode.children) {
					if (reqNode.children) {
						for (const schemeNode of reqNode.children) {
							if (schemeNode.key) {
								schemes.push(schemeNode.key);
							}
						}
					}
				}
				if (schemes.length > 0) {
					lenses.push({
						range,
						command: {
							title: `🔒 ${schemes.join(", ")}`,
							command: "",
							arguments: [],
						},
					});
				}
			}
		}

		return lenses;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideCodeLenses failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

// ============================================================================
// 7. Inlay Hints
// ============================================================================

/**
 * Provide inlay hints for OpenAPI documents.
 */
export function provideInlayHints(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
	range: Range,
): InlayHint[] {
	try {
		const hints: InlayHint[] = [];

		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return hints;

		const { virtualCode } = resolved;
		const ir = resolved.getIR();
		const refs = findAllRefNodes(ir.root);

		for (const { node: refNode, ref } of refs) {
			if (!refNode.loc) continue;

			const refRange = virtualCode.locToRange(refNode.loc);
			if (!refRange) continue;

			// Check if ref is in the requested range
			if (
				refRange.end.line < range.start.line ||
				refRange.start.line > range.end.line
			) {
				continue;
			}

			// Try to resolve the ref and get the target type
			let targetType: string | undefined;

			if (ref.startsWith("#/")) {
				const targetNode = findNodeAtPointer(ir.root, ref);
				if (targetNode) {
					const typeNode = targetNode.children?.find((c) => c.key === "type");
					if (
						typeNode?.kind === "string" &&
						typeof typeNode.value === "string"
					) {
						targetType = typeNode.value;
					} else if (targetNode.children?.find((c) => c.key === "allOf")) {
						targetType = "allOf composition";
					} else if (targetNode.children?.find((c) => c.key === "oneOf")) {
						targetType = "oneOf composition";
					} else if (targetNode.children?.find((c) => c.key === "anyOf")) {
						targetType = "anyOf composition";
					} else {
						targetType = "object";
					}
				}
			}

			if (targetType) {
				hints.push({
					position: refRange.end,
					label: ` → ${targetType}`,
					kind: 1 as InlayHintKind, // Type
					paddingLeft: true,
				});
			}
		}

		// Add "required" hints for properties
		const parsedObject = virtualCode.parsedObject as Record<string, unknown>;
		addRequiredHints(ir.root, parsedObject, virtualCode, range, hints);

		return hints;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideInlayHints failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Add "required" hints for schema properties.
 */
function addRequiredHints(
	node: IRNode,
	parsedObject: Record<string, unknown>,
	virtualCode: OpenAPIVirtualCode,
	range: Range,
	hints: InlayHint[],
): void {
	// Find all schemas with required properties
	if (node.kind === "object" && node.children) {
		const requiredNode = node.children.find((c) => c.key === "required");
		const propertiesNode = node.children.find((c) => c.key === "properties");

		if (
			requiredNode?.kind === "array" &&
			requiredNode.children &&
			propertiesNode?.children
		) {
			const requiredNames = new Set(
				requiredNode.children
					.filter((c) => typeof c.value === "string")
					.map((c) => c.value as string),
			);

			for (const propNode of propertiesNode.children) {
				if (propNode.key && requiredNames.has(propNode.key) && propNode.loc) {
					const propRange = virtualCode.locToRange(propNode.loc);
					if (
						propRange &&
						propRange.start.line >= range.start.line &&
						propRange.start.line <= range.end.line
					) {
						hints.push({
							position: propRange.start,
							label: "* ",
							kind: 1 as InlayHintKind,
							tooltip: "Required property",
						});
					}
				}
			}
		}
	}

	// Recurse into children
	if (node.children) {
		for (const child of node.children) {
			addRequiredHints(child, parsedObject, virtualCode, range, hints);
		}
	}
}

// ============================================================================
// 8. Go to Definition Enhancements
// ============================================================================

/**
 * Provide enhanced go-to-definition for OpenAPI-specific references.
 */
export function provideDefinition(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
	position: Position,
): LocationLink[] {
	try {
		const locations: LocationLink[] = [];

		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return locations;

		const { sourceUriString, virtualCode } = resolved;
		const ir = resolved.getIR();
		const text = resolved.getRawText();
		const offset = positionToOffset(text, position);
		const node = findNodeAtOffset(ir.root, offset);

		if (!node) return locations;

		// Get origin range for the link
		const originRange = node.loc ? virtualCode.locToRange(node.loc) : null;

		// Handle operationId references in links
		if (node.key === "operationId" && typeof node.value === "string") {
			const operationId = node.value;
			const opIdIndex = shared.workspaceIndex.getOpIdIndex();
			const occurrences = opIdIndex.getOccurrences(operationId);

			// Find the definition (not the current usage)
			for (const occ of occurrences) {
				if (occ.uri !== sourceUriString || occ.ptr !== node.ptr) {
					const targetRange = virtualCode.locToRange(occ.loc);
					if (targetRange) {
						locations.push({
							targetUri: occ.uri,
							targetRange,
							targetSelectionRange: targetRange,
							originSelectionRange: originRange ?? undefined,
						});
					}
				}
			}
		}

		// Handle security scheme references - check if pointer suggests a security context
		if (
			node.ptr?.includes("/security/") &&
			node.kind === "object" &&
			node.key
		) {
			// This might be a security requirement
			const schemeName = node.key;
			const securitySchemePointer = `#/components/securitySchemes/${schemeName}`;
			const schemeNode = findNodeAtPointer(ir.root, securitySchemePointer);
			if (schemeNode?.loc) {
				const targetRange = virtualCode.locToRange(schemeNode.loc);
				if (targetRange) {
					locations.push({
						targetUri: sourceUriString,
						targetRange,
						targetSelectionRange: targetRange,
						originSelectionRange: originRange ?? undefined,
					});
				}
			}
		}

		// Handle tag references - check if pointer suggests a tags context
		if (node.kind === "string" && node.ptr?.includes("/tags/")) {
			const tagName = node.value as string;
			const tagsNode = findNodeAtPointer(ir.root, "#/tags");
			if (tagsNode?.children) {
				for (const tagNode of tagsNode.children) {
					const nameNode = tagNode.children?.find((c) => c.key === "name");
					if (nameNode?.value === tagName && tagNode.loc) {
						const targetRange = virtualCode.locToRange(tagNode.loc);
						if (targetRange) {
							locations.push({
								targetUri: sourceUriString,
								targetRange,
								targetSelectionRange: targetRange,
								originSelectionRange: originRange ?? undefined,
							});
						}
					}
				}
			}
		}

		// Handle discriminator mapping values - check if pointer suggests mapping context
		if (node.ptr?.includes("/mapping/") && typeof node.value === "string") {
			const refValue = node.value as string;
			if (refValue.startsWith("#/")) {
				const targetNode = findNodeAtPointer(ir.root, refValue);
				if (targetNode?.loc) {
					const targetRange = virtualCode.locToRange(targetNode.loc);
					if (targetRange) {
						locations.push({
							targetUri: sourceUriString,
							targetRange,
							targetSelectionRange: targetRange,
							originSelectionRange: originRange ?? undefined,
						});
					}
				}
			}
		}

		return locations;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideDefinition failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

// ============================================================================
// 9. Call Hierarchy
// ============================================================================

/**
 * Prepare call hierarchy item at position.
 */
export function prepareCallHierarchy(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string },
	position: Position,
): CallHierarchyItem[] {
	try {
		const items: CallHierarchyItem[] = [];

		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return items;

		const { sourceUriString, virtualCode } = resolved;
		const ir = resolved.getIR();
		const text = resolved.getRawText();
		const offset = positionToOffset(text, position);
		const node = findNodeAtOffset(ir.root, offset);

		if (!node || !node.loc) return items;

		const range = virtualCode.locToRange(node.loc);
		if (!range) return items;

		// Get name based on node type
		let name = node.key ?? "unknown";
		let kind = 5 as SymbolKind; // Class

		// Check if it's a component
		if (node.ptr?.startsWith("#/components/schemas/")) {
			name = getPointerKey(node.ptr) ?? name;
			kind = 23 as SymbolKind; // Struct
		} else if (node.ptr?.startsWith("#/components/")) {
			name = getPointerKey(node.ptr) ?? name;
			kind = 5 as SymbolKind; // Class
		} else if (
			node.ptr?.includes("/get") ||
			node.ptr?.includes("/post") ||
			node.ptr?.includes("/put") ||
			node.ptr?.includes("/delete")
		) {
			// Operation
			kind = 6 as SymbolKind; // Method
		}

		items.push({
			name,
			kind,
			uri: sourceUriString,
			range,
			selectionRange: range,
			data: { pointer: node.ptr },
		});

		return items;
	} catch (error) {
		console.error(
			`[OpenAPI Features] prepareCallHierarchy failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Provide incoming calls (what references this item).
 */
export function provideCallHierarchyIncomingCalls(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	item: CallHierarchyItem,
): CallHierarchyIncomingCall[] {
	try {
		const calls: CallHierarchyIncomingCall[] = [];

		const graphIndex = shared.workspaceIndex.getGraphIndex();
		const pointer = (item.data as { pointer?: string })?.pointer;

		if (!pointer) return calls;

		const targetNode: GraphNode = { uri: item.uri, pointer };
		const dependents = graphIndex.dependentsOf(targetNode);

		for (const dep of dependents) {
			const depVc = getOpenAPIVirtualCode(context, URI.parse(dep.uri));
			if (!depVc) continue;

			const depIr = depVc.getIR(dep.uri);
			const refNode = findNodeAtPointer(depIr.root, dep.pointer);
			if (!refNode?.loc) continue;

			const range = depVc.locToRange(refNode.loc);
			if (!range) continue;

			calls.push({
				from: {
					name: getPointerKey(dep.pointer) ?? "reference",
					kind: 6 as SymbolKind,
					uri: dep.uri,
					range,
					selectionRange: range,
					data: { pointer: dep.pointer },
				},
				fromRanges: [range],
			});
		}

		return calls;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideCallHierarchyIncomingCalls failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Provide outgoing calls (what this item references).
 */
export function provideCallHierarchyOutgoingCalls(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	item: CallHierarchyItem,
): CallHierarchyOutgoingCall[] {
	try {
		const calls: CallHierarchyOutgoingCall[] = [];

		const graphIndex = shared.workspaceIndex.getGraphIndex();
		const pointer = (item.data as { pointer?: string })?.pointer;

		if (!pointer) return calls;

		const sourceNode: GraphNode = { uri: item.uri, pointer };
		const references = graphIndex.referencesFrom(sourceNode);

		for (const ref of references) {
			const refVc = getOpenAPIVirtualCode(context, URI.parse(ref.uri));
			if (!refVc) continue;

			const refIr = refVc.getIR(ref.uri);
			const targetNode = findNodeAtPointer(refIr.root, ref.pointer);
			if (!targetNode?.loc) continue;

			const range = refVc.locToRange(targetNode.loc);
			if (!range) continue;

			calls.push({
				to: {
					name: getPointerKey(ref.pointer) ?? "target",
					kind: 23 as SymbolKind, // Struct
					uri: ref.uri,
					range,
					selectionRange: range,
					data: { pointer: ref.pointer },
				},
				fromRanges: [range],
			});
		}

		return calls;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideCallHierarchyOutgoingCalls failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

// ============================================================================
// 10. Semantic Tokens
// ============================================================================

// Token types for OpenAPI-specific elements
export const SEMANTIC_TOKEN_TYPES = [
	"namespace", // 0: paths
	"type", // 1: schemas
	"class", // 2: components
	"enum", // 3: status codes
	"interface", // 4: parameters
	"struct", // 5: request/response bodies
	"typeParameter", // 6: path parameters
	"parameter", // 7: query/header parameters
	"variable", // 8: $ref values
	"property", // 9: properties
	"enumMember", // 10: enum values
	"event", // 11: callbacks
	"function", // 12: operations
	"method", // 13: HTTP methods
	"macro", // 14: security schemes
	"keyword", // 15: OpenAPI keywords
	"modifier", // 16: modifiers (deprecated, required)
	"comment", // 17: descriptions
	"string", // 18: media types
	"number", // 19: numbers
	"regexp", // 20: patterns
	"operator", // 21: discriminator
];

export const SEMANTIC_TOKEN_MODIFIERS = [
	"declaration", // 0
	"definition", // 1
	"readonly", // 2
	"deprecated", // 3
	"modification", // 4
	"documentation", // 5
	"defaultLibrary", // 6
];

/**
 * Semantic token type (tuple format expected by Volar).
 */
export type SemanticToken = [
	line: number,
	character: number,
	length: number,
	tokenType: number,
	tokenModifiers: number,
];

/**
 * Provide semantic tokens for OpenAPI documents.
 */
export function provideSemanticTokens(
	shared: telescopeVolarContext,
	context: LanguageServiceContext,
	document: { uri: string; languageId: string; getText(): string },
	range: Range,
): SemanticToken[] {
	try {
		const tokens: SemanticToken[] = [];

		// Use consolidated helper for VirtualCode access with IR
		const resolved = resolveOpenAPIDocumentWithIR(context, document);
		if (!resolved) return tokens;

		const { virtualCode } = resolved;
		const ir = resolved.getIR();
		const rawTokens: Array<{
			line: number;
			char: number;
			length: number;
			type: number;
			modifiers: number;
		}> = [];

		// Traverse IR and collect semantic tokens
		collectSemanticTokens(ir.root, virtualCode, rawTokens);

		// Filter tokens within range and sort by position
		const filteredTokens = rawTokens.filter(
			(t) => t.line >= range.start.line && t.line <= range.end.line,
		);

		filteredTokens.sort((a, b) => {
			if (a.line !== b.line) return a.line - b.line;
			return a.char - b.char;
		});

		// Convert to tuple format
		for (const token of filteredTokens) {
			tokens.push([
				token.line,
				token.char,
				token.length,
				token.type,
				token.modifiers,
			]);
		}

		return tokens;
	} catch (error) {
		console.error(
			`[OpenAPI Features] provideSemanticTokens failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return [];
	}
}

/**
 * Token target specifies whether to highlight the key or value.
 */
type TokenTarget = "key" | "value";

/**
 * Token info for semantic highlighting.
 */
interface TokenInfo {
	type: number;
	modifiers: number;
	target: TokenTarget;
}

/**
 * Get the position for a key from the Loc.
 */
function getKeyPosition(
	loc: { keyStart?: number; keyEnd?: number; start: number; end: number },
	virtualCode: OpenAPIVirtualCode,
): { line: number; char: number; length: number } | null {
	// Use keyStart/keyEnd if available, otherwise fall back to start
	const start = loc.keyStart ?? loc.start;
	const end = loc.keyEnd ?? start;

	const startPos = getLineCol(start, virtualCode.getLineOffsets());
	const endPos = getLineCol(end, virtualCode.getLineOffsets());

	if (!startPos || !endPos) return null;

	return {
		line: startPos.line - 1, // Convert to 0-based
		char: startPos.col - 1,
		length: end - start,
	};
}

/**
 * Get the position for a value from the Loc.
 */
function getValuePosition(
	loc: { valStart?: number; valEnd?: number; start: number; end: number },
	virtualCode: OpenAPIVirtualCode,
): { line: number; char: number; length: number } | null {
	// Use valStart/valEnd if available
	const start = loc.valStart ?? loc.start;
	const end = loc.valEnd ?? loc.end;

	if (start === undefined || end === undefined) return null;

	const startPos = getLineCol(start, virtualCode.getLineOffsets());
	const endPos = getLineCol(end, virtualCode.getLineOffsets());

	if (!startPos || !endPos) return null;

	return {
		line: startPos.line - 1, // Convert to 0-based
		char: startPos.col - 1,
		length: end - start,
	};
}

/**
 * Determine semantic token type for a node.
 */
function getTokenInfo(node: IRNode): TokenInfo | null {
	// HTTP methods - highlight the KEY
	if (
		[
			"get",
			"post",
			"put",
			"delete",
			"patch",
			"head",
			"options",
			"trace",
		].includes(node.key ?? "")
	) {
		return { type: 13, modifiers: 0, target: "key" }; // method
	}

	// Paths - highlight the KEY (the path string like "/users/{id}")
	if (node.key?.startsWith("/")) {
		return { type: 0, modifiers: 0, target: "key" }; // namespace
	}

	// Status codes - highlight the KEY
	if (/^[1-5]\d\d$/.test(node.key ?? "") || node.key === "default") {
		return { type: 3, modifiers: 0, target: "key" }; // enum (status codes)
	}

	// $ref values - highlight the VALUE (the actual reference string)
	if (node.key === "$ref" && typeof node.value === "string") {
		return { type: 8, modifiers: 0, target: "value" }; // variable
	}

	// Security scheme names in security requirements - highlight the KEY
	if (node.ptr?.includes("/security/") && node.kind === "object" && node.key) {
		return { type: 14, modifiers: 0, target: "key" }; // macro
	}

	// Media types - highlight the KEY
	if (node.key?.includes("/") && node.key.match(/^[a-z]+\/[a-z+.-]+$/)) {
		return { type: 18, modifiers: 0, target: "key" }; // string
	}

	// operationId - highlight the VALUE (the actual ID)
	if (node.key === "operationId" && typeof node.value === "string") {
		return { type: 12, modifiers: 0, target: "value" }; // function
	}

	// Schema types - highlight the VALUE (e.g., "integer", "string", "array")
	if (
		node.key === "type" &&
		node.kind === "string" &&
		typeof node.value === "string"
	) {
		return { type: 15, modifiers: 0, target: "value" }; // keyword
	}

	// Deprecated flag - highlight the KEY
	if (node.key === "deprecated" && node.value === true) {
		return { type: 16, modifiers: 8, target: "key" }; // modifier with deprecated flag
	}

	// Path parameters in path strings - highlight the KEY
	if (node.key?.includes("{") && node.key?.includes("}")) {
		return { type: 6, modifiers: 0, target: "key" }; // typeParameter
	}

	// Components sections - highlight the KEY
	if (node.ptr?.match(/^#\/components\/\w+$/)) {
		return { type: 2, modifiers: 0, target: "key" }; // class
	}

	// Schema definitions - highlight the KEY (the schema name)
	if (
		node.ptr?.startsWith("#/components/schemas/") &&
		node.key &&
		!node.ptr.includes("/properties/")
	) {
		// Only match direct schema children, not nested properties
		const parts = node.ptr.split("/");
		if (parts.length === 4) {
			// #/components/schemas/SchemaName
			return { type: 1, modifiers: 2, target: "key" }; // type with definition modifier
		}
	}

	return null;
}

/**
 * Collect semantic tokens from IR tree.
 */
function collectSemanticTokens(
	node: IRNode,
	virtualCode: OpenAPIVirtualCode,
	tokens: Array<{
		line: number;
		char: number;
		length: number;
		type: number;
		modifiers: number;
	}>,
): void {
	if (!node.loc) {
		// Continue to children even if this node has no location
		if (node.children) {
			for (const child of node.children) {
				collectSemanticTokens(child, virtualCode, tokens);
			}
		}
		return;
	}

	// Get token info for this node
	const tokenInfo = getTokenInfo(node);

	if (tokenInfo) {
		// Get position based on whether we're highlighting key or value
		const position =
			tokenInfo.target === "key"
				? getKeyPosition(node.loc, virtualCode)
				: getValuePosition(node.loc, virtualCode);

		if (position && position.length > 0) {
			tokens.push({
				line: position.line,
				char: position.char,
				length: position.length,
				type: tokenInfo.type,
				modifiers: tokenInfo.modifiers,
			});
		}
	}

	// Recurse into children
	if (node.children) {
		for (const child of node.children) {
			collectSemanticTokens(child, virtualCode, tokens);
		}
	}
}
