/**
 * Navigation Handler
 *
 * Provides go-to-definition, find references, and call hierarchy for OpenAPI documents.
 *
 * @module lsp/handlers/navigation
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type {
	CallHierarchyIncomingCall,
	CallHierarchyItem,
	CallHierarchyOutgoingCall,
	Definition,
	Location,
	Position,
} from "vscode-languageserver-protocol";
import { SymbolKind } from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { IRNode } from "../../engine/ir/types.js";
import type { TelescopeContext } from "../context.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import {
	findAllRefNodes,
	findNodeAtPointer,
	findRefNodeAtOffset,
	isOpenAPIDocument,
	resolveRefTarget,
} from "./shared.js";

/**
 * Register navigation handlers on the connection.
 */
export function registerNavigationHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	// Go to Definition
	connection.onDefinition((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		return provideDefinition(cached, params.position, cache);
	});

	// Find References
	connection.onReferences((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		return provideReferences(
			cached,
			params.position,
			params.context.includeDeclaration,
			cache,
			ctx,
		);
	});

	// Call Hierarchy - use connection.languages.callHierarchy API
	connection.languages.callHierarchy.onPrepare((params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		return prepareCallHierarchy(cached, params.position, cache);
	});

	connection.languages.callHierarchy.onIncomingCalls((params) => {
		return provideIncomingCalls(params.item, cache, ctx);
	});

	connection.languages.callHierarchy.onOutgoingCalls((params) => {
		return provideOutgoingCalls(params.item, cache);
	});
}

/**
 * Provide definition for $ref values.
 */
function provideDefinition(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
): Definition | null {
	const offset = cache.positionToOffset(cached, position);

	// Find $ref node at position
	const refNode = findRefNodeAtOffset(cached.ir.root, offset, cache, cached);

	if (!refNode || typeof refNode.value !== "string") {
		return null;
	}

	const refValue = refNode.value;

	// Don't navigate to external URLs
	if (/^https?:/i.test(refValue)) {
		return null;
	}

	const { targetUri, pointer } = resolveRefTarget(cached.uri, refValue);

	// Try to find position in target document
	const targetDoc =
		targetUri === cached.uri ? cached : cache.getByUri(targetUri);

	if (!targetDoc) {
		// Return just the file location
		return {
			uri: targetUri,
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 0 },
			},
		};
	}

	// Find the node at the pointer
	const targetNode = findNodeAtPointer(targetDoc.ir.root, pointer);
	if (targetNode?.loc) {
		const range = cache.locToRange(targetDoc, targetNode.loc);
		if (range) {
			return { uri: targetUri, range };
		}
	}

	// Fallback to start of document
	return {
		uri: targetUri,
		range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
	};
}

/**
 * Provide references to a component.
 */
function provideReferences(
	cached: CachedDocument,
	position: Position,
	includeDeclaration: boolean,
	cache: DocumentCache,
	ctx: TelescopeContext,
): Location[] {
	const locations: Location[] = [];

	// Find what's at the cursor position
	// This could be a $ref value, a component definition, etc.
	const offset = cache.positionToOffset(cached, position);

	// Check if we're on a $ref - if so, find the target and search for refs to it
	const refNode = findRefNodeAtOffset(cached.ir.root, offset, cache, cached);

	let targetPointer: string | null = null;
	let targetUri = cached.uri;

	if (refNode && typeof refNode.value === "string") {
		const { targetUri: resolvedUri, pointer } = resolveRefTarget(
			cached.uri,
			refNode.value,
		);
		targetUri = resolvedUri;
		targetPointer = pointer;
	} else {
		// Try to determine if we're on a component definition
		// Look for pattern like /components/schemas/Name
		targetPointer = findComponentPointerAtOffset(cached, offset);
	}

	if (!targetPointer) {
		return locations;
	}

	// Add declaration if requested
	if (includeDeclaration) {
		const targetDoc =
			targetUri === cached.uri ? cached : cache.getByUri(targetUri);
		if (targetDoc) {
			const targetNode = findNodeAtPointer(targetDoc.ir.root, targetPointer);
			if (targetNode?.loc) {
				const range = cache.locToRange(targetDoc, targetNode.loc);
				if (range) {
					locations.push({ uri: targetUri, range });
				}
			}
		}
	}

	// Search all known OpenAPI files for references
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = cache.getByUri(uri);
		if (!doc) continue;

		const refs = findAllRefNodes(doc.ir.root);
		for (const { node, ref } of refs) {
			// Check if this ref points to our target
			const { targetUri: resolvedUri, pointer } = resolveRefTarget(uri, ref);
			if (resolvedUri === targetUri && pointer === targetPointer) {
				if (node.loc) {
					const range = cache.locToRange(doc, node.loc);
					if (range) {
						locations.push({ uri, range });
					}
				}
			}
		}
	}

	return locations;
}

/**
 * Find a component pointer at a given offset.
 */
function findComponentPointerAtOffset(
	cached: CachedDocument,
	offset: number,
): string | null {
	// Walk the IR to find what node contains this offset
	const node = findNodeContainingOffset(cached.ir.root, offset);
	if (!node) return null;

	// Build pointer from node path
	return node.pointer || null;
}

/**
 * Find the IR node containing a given offset.
 */
function findNodeContainingOffset(node: IRNode, offset: number): IRNode | null {
	if (!node.loc) return null;

	const start = node.loc.start ?? 0;
	const end = node.loc.end ?? start;

	if (offset < start || offset > end) return null;

	// Check children for more specific match
	if (node.children) {
		for (const child of node.children) {
			const found = findNodeContainingOffset(child, offset);
			if (found) return found;
		}
	}

	return node;
}

/**
 * Prepare call hierarchy item at position.
 */
function prepareCallHierarchy(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
): CallHierarchyItem[] | null {
	const offset = cache.positionToOffset(cached, position);

	// Find component at position
	const pointer = findComponentPointerAtOffset(cached, offset);
	if (!pointer) return null;

	const node = findNodeAtPointer(cached.ir.root, pointer);
	if (!node?.loc) return null;

	const range = cache.locToRange(cached, node.loc);
	if (!range) return null;

	const name = getComponentName(pointer);

	return [
		{
			name,
			kind: SymbolKind.Class,
			uri: cached.uri,
			range,
			selectionRange: range,
			data: { pointer },
		},
	];
}

/**
 * Provide incoming calls (what references this item).
 */
function provideIncomingCalls(
	item: CallHierarchyItem,
	cache: DocumentCache,
	ctx: TelescopeContext,
): CallHierarchyIncomingCall[] {
	const calls: CallHierarchyIncomingCall[] = [];
	const targetPointer = (item.data as { pointer?: string } | undefined)
		?.pointer;
	if (!targetPointer) return calls;

	// Search all known OpenAPI files
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = cache.getByUri(uri);
		if (!doc) continue;

		const refs = findAllRefNodes(doc.ir.root);
		for (const { node, ref } of refs) {
			const { targetUri, pointer } = resolveRefTarget(uri, ref);
			if (targetUri === item.uri && pointer === targetPointer) {
				if (node.loc) {
					const range = cache.locToRange(doc, node.loc);
					if (range) {
						// Find the containing component
						const containingPointer = findContainingComponentPointer(node);
						const fromName = containingPointer
							? getComponentName(containingPointer)
							: "unknown";

						calls.push({
							from: {
								name: fromName,
								kind: SymbolKind.Class,
								uri,
								range,
								selectionRange: range,
								data: { pointer: containingPointer },
							},
							fromRanges: [range],
						});
					}
				}
			}
		}
	}

	return calls;
}

/**
 * Provide outgoing calls (what this item references).
 */
function provideOutgoingCalls(
	item: CallHierarchyItem,
	cache: DocumentCache,
): CallHierarchyOutgoingCall[] {
	const calls: CallHierarchyOutgoingCall[] = [];

	const doc = cache.getByUri(item.uri);
	if (!doc) return calls;

	const targetPointer = (item.data as { pointer?: string } | undefined)
		?.pointer;
	if (!targetPointer) return calls;

	// Find the node for this item
	const node = findNodeAtPointer(doc.ir.root, targetPointer);
	if (!node) return calls;

	// Find all refs within this node
	const refs = findAllRefNodes(node);
	for (const { node: refNode, ref } of refs) {
		const { targetUri, pointer } = resolveRefTarget(doc.uri, ref);

		if (refNode.loc) {
			const fromRange = cache.locToRange(doc, refNode.loc);
			if (fromRange) {
				// Get target info
				const targetDoc =
					targetUri === doc.uri ? doc : cache.getByUri(targetUri);
				let targetRange = fromRange; // fallback

				if (targetDoc) {
					const targetNode = findNodeAtPointer(targetDoc.ir.root, pointer);
					if (targetNode?.loc) {
						const r = cache.locToRange(targetDoc, targetNode.loc);
						if (r) targetRange = r;
					}
				}

				calls.push({
					to: {
						name: getComponentName(pointer),
						kind: SymbolKind.Class,
						uri: targetUri,
						range: targetRange,
						selectionRange: targetRange,
						data: { pointer },
					},
					fromRanges: [fromRange],
				});
			}
		}
	}

	return calls;
}

/**
 * Get the component name from a pointer.
 */
function getComponentName(pointer: string): string {
	const parts = pointer.split("/");
	return parts[parts.length - 1] || pointer;
}

/**
 * Find the containing component pointer for a node.
 */
function findContainingComponentPointer(node: IRNode): string | null {
	// Walk up to find /components/... pattern
	if (node.pointer?.startsWith("/components/")) {
		const parts = node.pointer.split("/");
		if (parts.length >= 4) {
			return parts.slice(0, 4).join("/");
		}
	}
	return node.pointer || null;
}
