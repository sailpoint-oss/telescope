/**
 * Symbols Handler
 *
 * Provides document and workspace symbols for OpenAPI documents by combining:
 * 1. YAML language service symbols (fallback - basic structure)
 * 2. OpenAPI-specific symbols (preferred - semantic operations, schemas, etc.)
 *
 * @module lsp/handlers/symbols
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
	DocumentSymbol,
	WorkspaceSymbol,
	Range,
} from "vscode-languageserver-protocol";
import { SymbolKind } from "vscode-languageserver-protocol";

import type { DocumentCache, CachedDocument } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import { getYAMLService } from "../services/yaml-service.js";
import { isOpenAPIDocument } from "./shared.js";

/**
 * Register symbol handlers on the connection.
 */
export function registerSymbolHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("Symbols");
	const yamlService = getYAMLService();

	// Document symbols
	connection.onDocumentSymbol((params): DocumentSymbol[] => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) return [];

			// 1. Try OpenAPI symbols first (more semantic)
			const cached = cache.get(doc);
			if (isOpenAPIDocument(cached)) {
				const openapiSymbols = provideOpenAPIDocumentSymbols(cached, cache, ctx);
				if (openapiSymbols.length > 0) {
					return openapiSymbols;
				}
			}

			// 2. Fall back to YAML service symbols
			const yamlSymbols = yamlService.getDocumentSymbols(doc);
			return yamlSymbols;
		} catch (error) {
			logger.error(
				`Document symbols failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});

	// Workspace symbols
	connection.onWorkspaceSymbol((params): WorkspaceSymbol[] => {
		try {
			return provideWorkspaceSymbols(params.query, cache, ctx);
		} catch (error) {
			logger.error(
				`Workspace symbols failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});
}

/**
 * Helper to get selection range (key only) or fall back to full range.
 * 
 * The selection range MUST be contained within the full range per LSP spec.
 * In YAML, getRange() returns the value's range, not including the key.
 * getKeyRange() returns just the key's range.
 * Since these don't overlap, we fall back to using the full range for selection.
 */
function getSelectionRange(
	cache: DocumentCache,
	cached: CachedDocument,
	path: (string | number)[],
	fullRange: Range,
): Range {
	const keyRange = cache.getKeyRange(cached, path);
	
	// Check if keyRange is within fullRange
	if (keyRange) {
		const keyStart = keyRange.start.line * 10000 + keyRange.start.character;
		const keyEnd = keyRange.end.line * 10000 + keyRange.end.character;
		const fullStart = fullRange.start.line * 10000 + fullRange.start.character;
		const fullEnd = fullRange.end.line * 10000 + fullRange.end.character;
		
		// Only use keyRange if it's contained within fullRange
		if (keyStart >= fullStart && keyEnd <= fullEnd) {
			return keyRange;
		}
	}
	
	// Fall back to using fullRange for selection
	// Create a minimal selection at the start of the range
	return {
		start: fullRange.start,
		end: {
			line: fullRange.start.line,
			character: fullRange.start.character + 1,
		},
	};
}

/**
 * Provide OpenAPI-specific document symbols (semantic outline).
 */
function provideOpenAPIDocumentSymbols(
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
): DocumentSymbol[] {
	const symbols: DocumentSymbol[] = [];
	const ast = cached.parsedObject as Record<string, unknown>;

	// Add info section
	if (ast.info) {
		const infoRange = cache.getRange(cached, ["info"]);
		if (infoRange) {
			const info = ast.info as Record<string, unknown>;
			symbols.push({
				name: "info",
				detail: String(info.title ?? ""),
				kind: SymbolKind.Module,
				range: infoRange,
				selectionRange: getSelectionRange(cache, cached, ["info"], infoRange),
				children: [],
			});
		}
	}

	// Add paths
	const paths = ast.paths as Record<string, unknown> | undefined;
	if (paths) {
		const pathsRange = cache.getRange(cached, ["paths"]);
		if (pathsRange) {
			const pathChildren: DocumentSymbol[] = [];

			for (const [path, pathItem] of Object.entries(paths)) {
				if (!pathItem || typeof pathItem !== "object") continue;

				const pathRange = cache.getRange(cached, ["paths", path]);
				if (!pathRange) continue;

				const operationChildren: DocumentSymbol[] = [];
				const methods = [
					"get",
					"post",
					"put",
					"patch",
					"delete",
					"options",
					"head",
				];

				for (const method of methods) {
					const operation = (pathItem as Record<string, unknown>)[method] as
						| Record<string, unknown>
						| undefined;
					if (!operation) continue;

					const methodRange = cache.getRange(cached, ["paths", path, method]);
					if (!methodRange) continue;

					operationChildren.push({
						name: method.toUpperCase(),
						detail: String(
							operation.operationId ?? operation.summary ?? "",
						),
						kind: SymbolKind.Method,
						range: methodRange,
						selectionRange: getSelectionRange(cache, cached, ["paths", path, method], methodRange),
					});
				}

				pathChildren.push({
					name: path,
					kind: SymbolKind.Namespace,
					range: pathRange,
					selectionRange: getSelectionRange(cache, cached, ["paths", path], pathRange),
					children: operationChildren,
				});
			}

			symbols.push({
				name: "paths",
				kind: SymbolKind.Package,
				range: pathsRange,
				selectionRange: getSelectionRange(cache, cached, ["paths"], pathsRange),
				children: pathChildren,
			});
		}
	}

	// Add components
	const components = ast.components as Record<string, unknown> | undefined;
	if (components) {
		const componentsRange = cache.getRange(cached, ["components"]);
		if (componentsRange) {
			const componentChildren: DocumentSymbol[] = [];

			const sections = [
				{ key: "schemas", kind: SymbolKind.Class },
				{ key: "parameters", kind: SymbolKind.Property },
				{ key: "responses", kind: SymbolKind.Event },
				{ key: "requestBodies", kind: SymbolKind.Struct },
				{ key: "headers", kind: SymbolKind.Field },
				{ key: "securitySchemes", kind: SymbolKind.Key },
				{ key: "links", kind: SymbolKind.Interface },
				{ key: "callbacks", kind: SymbolKind.Function },
			] as const;

			for (const { key, kind } of sections) {
				const section = components[key] as Record<string, unknown> | undefined;
				if (!section) continue;

				const sectionRange = cache.getRange(cached, ["components", key]);
				if (!sectionRange) continue;

				const sectionChildren: DocumentSymbol[] = [];

				for (const name of Object.keys(section)) {
					const itemRange = cache.getRange(cached, ["components", key, name]);
					if (!itemRange) continue;

					sectionChildren.push({
						name,
						kind,
						range: itemRange,
						selectionRange: getSelectionRange(cache, cached, ["components", key, name], itemRange),
					});
				}

				componentChildren.push({
					name: key,
					kind: SymbolKind.Namespace,
					range: sectionRange,
					selectionRange: getSelectionRange(cache, cached, ["components", key], sectionRange),
					children: sectionChildren,
				});
			}

			symbols.push({
				name: "components",
				kind: SymbolKind.Package,
				range: componentsRange,
				selectionRange: getSelectionRange(cache, cached, ["components"], componentsRange),
				children: componentChildren,
			});
		}
	}

	// Add tags
	const tags = ast.tags as Array<{ name: string }> | undefined;
	if (tags && tags.length > 0) {
		const tagsRange = cache.getRange(cached, ["tags"]);
		if (tagsRange) {
			const tagChildren: DocumentSymbol[] = [];

			for (let i = 0; i < tags.length; i++) {
				const tag = tags[i];
				const tagRange = cache.getRange(cached, ["tags", i]);
				if (!tagRange) continue;

				tagChildren.push({
					name: tag.name,
					kind: SymbolKind.EnumMember,
					range: tagRange,
					selectionRange: tagRange, // Tags don't have keys, use full range
				});
			}

			symbols.push({
				name: "tags",
				kind: SymbolKind.Enum,
				range: tagsRange,
				selectionRange: getSelectionRange(cache, cached, ["tags"], tagsRange),
				children: tagChildren,
			});
		}
	}

	return symbols;
}

/**
 * Provide workspace symbols matching a query.
 */
function provideWorkspaceSymbols(
	query: string,
	cache: DocumentCache,
	ctx: TelescopeContext,
): WorkspaceSymbol[] {
	const symbols: WorkspaceSymbol[] = [];
	const lowerQuery = query.toLowerCase();

	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = cache.getByUri(uri);
		if (!doc || !isOpenAPIDocument(doc)) continue;

		const ast = doc.parsedObject as Record<string, unknown>;

		// Search operations
		const paths = ast.paths as Record<string, unknown> | undefined;
		if (paths) {
			const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

			for (const [path, pathItem] of Object.entries(paths)) {
				if (!pathItem || typeof pathItem !== "object") continue;

				for (const method of methods) {
					const operation = (pathItem as Record<string, unknown>)[method] as
						| Record<string, unknown>
						| undefined;
					if (!operation) continue;

					const opId = operation.operationId
						? String(operation.operationId)
						: `${method.toUpperCase()} ${path}`;

					if (opId.toLowerCase().includes(lowerQuery)) {
						const range = cache.getRange(doc, ["paths", path, method]);
						if (range) {
							symbols.push({
								name: opId,
								kind: SymbolKind.Method,
								location: { uri, range },
								containerName: path,
							});
						}
					}
				}
			}
		}

		// Search components
		const components = ast.components as Record<string, unknown> | undefined;
		if (components) {
			const sections = [
				{ key: "schemas", kind: SymbolKind.Class },
				{ key: "parameters", kind: SymbolKind.Property },
				{ key: "responses", kind: SymbolKind.Event },
			] as const;

			for (const { key, kind } of sections) {
				const section = components[key] as Record<string, unknown> | undefined;
				if (!section) continue;

				for (const name of Object.keys(section)) {
					if (name.toLowerCase().includes(lowerQuery)) {
						const range = cache.getRange(doc, ["components", key, name]);
						if (range) {
							symbols.push({
								name,
								kind,
								location: { uri, range },
								containerName: `components/${key}`,
							});
						}
					}
				}
			}
		}
	}

	return symbols;
}
