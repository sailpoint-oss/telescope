/**
 * Rename Handler
 *
 * Provides rename functionality for OpenAPI documents.
 *
 * @module lsp/handlers/rename
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
	PrepareRenameParams,
	RenameParams,
	Range,
	WorkspaceEdit,
	TextEdit,
} from "vscode-languageserver-protocol";

import type { DocumentCache, CachedDocument } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import {
	isOpenAPIDocument,
	findRefNodeAtOffset,
	findAllRefNodes,
	resolveRefTarget,
	findNodeAtPointer,
} from "./shared.js";

/**
 * Register rename handlers on the connection.
 */
export function registerRenameHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	// Prepare rename
	connection.onPrepareRename((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		return prepareRename(cached, params.position, cache, ctx);
	});

	// Execute rename
	connection.onRenameRequest((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		return executeRename(cached, params, cache, ctx);
	});
}

/**
 * Prepare rename at a position.
 */
function prepareRename(
	cached: CachedDocument,
	position: { line: number; character: number },
	cache: DocumentCache,
	ctx: TelescopeContext,
): Range | { range: Range; placeholder: string } | null {
	const offset = cache.positionToOffset(cached, position);

	// Check if on a component definition
	const componentInfo = findComponentAtOffset(cached, offset, cache);
	if (componentInfo) {
		return {
			range: componentInfo.range,
			placeholder: componentInfo.name,
		};
	}

	// Check if on an operationId
	const opIdInfo = findOperationIdAtOffset(cached, offset, cache);
	if (opIdInfo) {
		return {
			range: opIdInfo.range,
			placeholder: opIdInfo.name,
		};
	}

	return null;
}

/**
 * Execute rename operation.
 */
function executeRename(
	cached: CachedDocument,
	params: RenameParams,
	cache: DocumentCache,
	ctx: TelescopeContext,
): WorkspaceEdit | null {
	const offset = cache.positionToOffset(cached, params.position);
	const newName = params.newName;

	// Check if renaming a component
	const componentInfo = findComponentAtOffset(cached, offset, cache);
	if (componentInfo) {
		return renameComponent(componentInfo, newName, cached, cache, ctx);
	}

	// Check if renaming an operationId
	const opIdInfo = findOperationIdAtOffset(cached, offset, cache);
	if (opIdInfo) {
		return renameOperationId(opIdInfo, newName, cached, cache, ctx);
	}

	return null;
}

interface ComponentInfo {
	type: string; // "schemas", "parameters", etc.
	name: string;
	pointer: string;
	range: Range;
}

interface OperationIdInfo {
	name: string;
	range: Range;
	path: string;
	method: string;
}

/**
 * Find a component definition at the given offset.
 */
function findComponentAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): ComponentInfo | null {
	const ast = cached.parsedObject as Record<string, unknown>;
	const components = ast?.components as Record<string, unknown> | undefined;
	if (!components) return null;

	const componentTypes = [
		"schemas",
		"parameters",
		"responses",
		"requestBodies",
		"headers",
		"securitySchemes",
		"links",
		"callbacks",
	];

	for (const type of componentTypes) {
		const section = components[type] as Record<string, unknown> | undefined;
		if (!section) continue;

		for (const name of Object.keys(section)) {
			const range = cache.getRange(cached, ["components", type, name]);
			if (!range) continue;

			// Check if offset is within the name range (first line of the component)
			const startOffset = cache.positionToOffset(cached, range.start);
			const lineEndOffset = cached.content.indexOf("\n", startOffset);
			const effectiveEndOffset =
				lineEndOffset === -1 ? cached.content.length : lineEndOffset;

			if (offset >= startOffset && offset <= effectiveEndOffset) {
				return {
					type,
					name,
					pointer: `/components/${type}/${name}`,
					range: {
						start: range.start,
						end: {
							line: range.start.line,
							character: range.start.character + name.length,
						},
					},
				};
			}
		}
	}

	return null;
}

/**
 * Find an operationId at the given offset.
 */
function findOperationIdAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): OperationIdInfo | null {
	const ast = cached.parsedObject as Record<string, unknown>;
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (!paths) return null;

	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;

		for (const method of methods) {
			const operation = (pathItem as Record<string, unknown>)[method] as
				| Record<string, unknown>
				| undefined;
			if (!operation?.operationId) continue;

			const opIdRange = cache.getRange(cached, [
				"paths",
				path,
				method,
				"operationId",
			]);
			if (!opIdRange) continue;

			const startOffset = cache.positionToOffset(cached, opIdRange.start);
			const endOffset = cache.positionToOffset(cached, opIdRange.end);

			if (offset >= startOffset && offset <= endOffset) {
				return {
					name: String(operation.operationId),
					range: opIdRange,
					path,
					method,
				};
			}
		}
	}

	return null;
}

/**
 * Rename a component and all its references.
 */
function renameComponent(
	info: ComponentInfo,
	newName: string,
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
): WorkspaceEdit {
	const changes: Record<string, TextEdit[]> = {};

	// Rename the definition
	if (!changes[cached.uri]) changes[cached.uri] = [];
	changes[cached.uri].push({
		range: info.range,
		newText: newName,
	});

	// Find and rename all references
	const oldRefPattern = `#/components/${info.type}/${info.name}`;
	const newRefPattern = `#/components/${info.type}/${newName}`;

	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = cache.getByUri(uri);
		if (!doc) continue;

		const refs = findAllRefNodes(doc.ir.root);
		for (const { node, ref } of refs) {
			// Check for same-document refs
			if (ref === oldRefPattern) {
				if (!node.loc) continue;
				const range = cache.locToRange(doc, node.loc);
				if (!range) continue;

				if (!changes[uri]) changes[uri] = [];
				changes[uri].push({
					range,
					newText: newRefPattern,
				});
			}

			// Check for cross-document refs
			if (uri !== cached.uri) {
				const { targetUri, pointer } = resolveRefTarget(uri, ref);
				if (targetUri === cached.uri && pointer === `/components/${info.type}/${info.name}`) {
					if (!node.loc) continue;
					const range = cache.locToRange(doc, node.loc);
					if (!range) continue;

					// Construct the new ref value maintaining the same format
					const newRef = ref.replace(info.name, newName);

					if (!changes[uri]) changes[uri] = [];
					changes[uri].push({
						range,
						newText: newRef,
					});
				}
			}
		}
	}

	return { changes };
}

/**
 * Rename an operationId and all its references.
 */
function renameOperationId(
	info: OperationIdInfo,
	newName: string,
	cached: CachedDocument,
	cache: DocumentCache,
	ctx: TelescopeContext,
): WorkspaceEdit {
	const changes: Record<string, TextEdit[]> = {};

	// Rename the definition
	if (!changes[cached.uri]) changes[cached.uri] = [];
	changes[cached.uri].push({
		range: info.range,
		newText: newName,
	});

	// Search for operationId references in links and callbacks
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = cache.getByUri(uri);
		if (!doc) continue;

		// Search for operationId in links
		findOperationIdReferences(doc, info.name, cache).forEach(({ range }) => {
			if (!changes[uri]) changes[uri] = [];
			changes[uri].push({ range, newText: newName });
		});
	}

	return { changes };
}

/**
 * Find references to an operationId in links and callbacks.
 */
function findOperationIdReferences(
	doc: CachedDocument,
	operationId: string,
	cache: DocumentCache,
): Array<{ range: Range }> {
	const results: Array<{ range: Range }> = [];
	const ast = doc.parsedObject as Record<string, unknown>;

	// Check links in responses
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (paths) {
		const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

		for (const [path, pathItem] of Object.entries(paths)) {
			if (!pathItem || typeof pathItem !== "object") continue;

			for (const method of methods) {
				const operation = (pathItem as Record<string, unknown>)[method] as
					| Record<string, unknown>
					| undefined;
				if (!operation) continue;

				const responses = operation.responses as Record<string, unknown> | undefined;
				if (!responses) continue;

				for (const [code, response] of Object.entries(responses)) {
					if (!response || typeof response !== "object") continue;

					const links = (response as Record<string, unknown>).links as
						| Record<string, unknown>
						| undefined;
					if (!links) continue;

					for (const [linkName, link] of Object.entries(links)) {
						if (!link || typeof link !== "object") continue;

						const linkObj = link as Record<string, unknown>;
						if (linkObj.operationId === operationId) {
							const range = cache.getRange(doc, [
								"paths",
								path,
								method,
								"responses",
								code,
								"links",
								linkName,
								"operationId",
							]);
							if (range) {
								results.push({ range });
							}
						}
					}
				}
			}
		}
	}

	return results;
}

