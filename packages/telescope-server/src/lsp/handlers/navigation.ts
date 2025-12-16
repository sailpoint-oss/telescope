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
import * as jsonc from "jsonc-parser";
import * as yaml from "yaml";
import type { IRNode } from "../../engine/ir/types.js";
import { joinPointer } from "../../engine/utils/pointer-utils.js";
import type { TelescopeContext } from "../context.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import { createDocumentProvider } from "../services/document-provider.js";
import type { ReferencesIndex } from "../services/references-index.js";
import type { WorkspaceProject } from "../workspace/workspace-project.js";
import {
	findAllRefNodes,
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
	getProject: () => WorkspaceProject,
	getReferencesIndex: () => ReferencesIndex,
): void {
	// Go to Definition
	connection.onDefinition(async (params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		const provider = createDocumentProvider({
			documents,
			cache,
			project: getProject(),
		});

		return await provideDefinition(cached, params.position, cache, ctx, provider);
	});

	// Find References
	connection.onReferences(async (params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		const provider = createDocumentProvider({
			documents,
			cache,
			project: getProject(),
		});

		return await provideReferences(
			cached,
			params.position,
			params.context.includeDeclaration,
			cache,
			ctx,
			provider,
			getReferencesIndex(),
		);
	});

	// Call Hierarchy - use connection.languages.callHierarchy API
	connection.languages.callHierarchy.onPrepare(async (params) => {
		const doc = documents.get(params.textDocument.uri);
		if (!doc) return null;

		const cached = cache.get(doc);
		if (!isOpenAPIDocument(cached)) return null;

		const provider = createDocumentProvider({
			documents,
			cache,
			project: getProject(),
		});

		return await prepareCallHierarchy(cached, params.position, cache, provider);
	});

	connection.languages.callHierarchy.onIncomingCalls(async (params) => {
		const provider = createDocumentProvider({
			documents,
			cache,
			project: getProject(),
		});
		return await provideIncomingCalls(params.item, cache, ctx, provider);
	});

	connection.languages.callHierarchy.onOutgoingCalls(async (params) => {
		const provider = createDocumentProvider({
			documents,
			cache,
			project: getProject(),
		});
		return await provideOutgoingCalls(params.item, cache, provider);
	});
}

/**
 * Provide definition for $ref values.
 */
function provideDefinition(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<Definition | null> | Definition | null {
	const offset = cache.positionToOffset(cached, position);

	// Find $ref node at position
	const refNode = findRefNodeAtOffset(cached.ir.root, offset, cache, cached);

	// 1) $ref definition
	if (refNode && typeof refNode.value === "string") {
		const refValue = refNode.value;
		// Don't navigate to external URLs
		if (/^https?:/i.test(refValue)) return null;
		const { targetUri, pointer } = resolveRefTarget(cached.uri, refValue);
		return resolvePointerLocation(provider, targetUri, pointer);
	}

	// 2) Non-$ref definitions (tags, security schemes, operationRef/operationId, discriminator mapping)
	const cursor = findCursorPath(cached, position, cache);
	if (!cursor) return null;

	// security requirement scheme name (key)
	if (cursor.isKey && typeof cursor.key === "string") {
		const scheme = cursor.key;
		if (cursor.path.includes("security")) {
			return findSecuritySchemeDefinition(provider, ctx, scheme);
		}
	}

	// value-based navigation cases
	if (!cursor.isKey && typeof cursor.value === "string") {
		const key = cursor.key;
		const val = cursor.value;

		// Operation tags: jump to Tag Object with matching name
		if (key === "tags" && cursor.path[cursor.path.length - 1] !== "tags") {
			return findTagDefinition(provider, ctx, val);
		}

		// Links/callbacks: operationId → operation definition
		if (key === "operationId" && (cursor.path.includes("links") || cursor.path.includes("callbacks"))) {
			return findOperationByOperationId(provider, ctx, val);
		}

		// operationRef: resolve like a ref target
		if (key === "operationRef") {
			if (/^https?:/i.test(val)) return null;
			const { targetUri, pointer } = resolveRefTarget(cached.uri, val);
			return resolvePointerLocation(provider, targetUri, pointer);
		}

		// discriminator.mapping values: resolve like a ref target
		const parentKey = cursor.path[cursor.path.length - 2];
		if (parentKey === "mapping") {
			if (/^https?:/i.test(val)) return null;
			const { targetUri, pointer } = resolveRefTarget(cached.uri, val);
			return resolvePointerLocation(provider, targetUri, pointer);
		}
	}

	return null;
}

type CursorPath = {
	path: (string | number)[];
	isKey: boolean;
	key: string | null;
	value: string | null;
};

function findCursorPath(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
): CursorPath | null {
	const offset = cache.positionToOffset(cached, position);
	if (cached.format === "json") {
		const loc = jsonc.getLocation(cached.content, offset);
		const path = (loc.path ?? []) as (string | number)[];
		if (loc.isAtPropertyKey) {
			const key = path.length > 0 && typeof path[path.length - 1] === "string" ? String(path[path.length - 1]) : null;
			return { path, isKey: true, key, value: null };
		}
		const value = getValueAtPath(cached.parsedObject, path);
		const parentKey = path.length > 0 && typeof path[path.length - 1] === "number" ? path[path.length - 2] : path[path.length - 1];
		const key = typeof parentKey === "string" ? String(parentKey) : null;
		return { path, isKey: false, key, value: typeof value === "string" ? value : null };
	}

	// YAML
	if (!(cached.ast instanceof yaml.Document)) return null;
	return findYamlCursorPath(cached.ast, offset, []);
}

function findYamlCursorPath(
	doc: yaml.Document | yaml.Node | null,
	offset: number,
	path: (string | number)[],
): CursorPath | null {
	const node = doc && doc instanceof yaml.Document ? doc.contents : doc;
	if (!node) return null;

	if (yaml.isMap(node)) {
		for (const pair of node.items) {
			const keyNode = pair.key;
			const key = yaml.isScalar(keyNode) ? String(keyNode.value) : null;

			if (key && Array.isArray(keyNode.range)) {
				const [start, end] = keyNode.range;
				if (typeof start === "number" && typeof end === "number" && offset >= start && offset <= end) {
					return { path: [...path, key], isKey: true, key, value: null };
				}
			}

			const nextPath = key ? [...path, key] : path;
			const valueNode = pair.value;
			if (yaml.isScalar(valueNode) && typeof valueNode.value === "string" && Array.isArray(valueNode.range)) {
				const [start, end] = valueNode.range;
				if (typeof start === "number" && typeof end === "number" && offset >= start && offset <= end) {
					return { path: nextPath, isKey: false, key, value: String(valueNode.value) };
				}
			}

			const found = findYamlCursorPath(valueNode, offset, nextPath);
			if (found) return found;
		}
		return null;
	}

	if (yaml.isSeq(node)) {
		for (let i = 0; i < node.items.length; i++) {
			const child = node.items[i];
			if (yaml.isScalar(child) && typeof child.value === "string" && Array.isArray(child.range)) {
				const [start, end] = child.range;
				if (typeof start === "number" && typeof end === "number" && offset >= start && offset <= end) {
					const parentKey = path.length > 0 && typeof path[path.length - 1] === "string" ? String(path[path.length - 1]) : null;
					return { path: [...path, i], isKey: false, key: parentKey, value: String(child.value) };
				}
			}
			const found = findYamlCursorPath(child, offset, [...path, i]);
			if (found) return found;
		}
		return null;
	}

	return null;
}

function resolvePointerLocation(
	provider: ReturnType<typeof createDocumentProvider>,
	targetUri: string,
	pointer: string,
): Promise<Definition | null> {
	return (async () => {
		const targetDoc = await provider.get(targetUri);
		if (!targetDoc) {
			return {
				uri: targetUri,
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				},
			};
		}
		const range = provider.pointerToRange(targetDoc, pointer);
		return range
			? { uri: targetUri, range }
			: {
					uri: targetUri,
					range: {
						start: { line: 0, character: 0 },
						end: { line: 0, character: 0 },
					},
				};
	})();
}

async function findSecuritySchemeDefinition(
	provider: ReturnType<typeof createDocumentProvider>,
	ctx: TelescopeContext,
	scheme: string,
): Promise<Definition | null> {
	const candidates = [
		joinPointer(["components", "securitySchemes", scheme]),
		joinPointer(["securityDefinitions", scheme]), // Swagger 2.0
	];
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;
		for (const ptr of candidates) {
			const range = provider.pointerToRange(doc, ptr);
			if (range) return { uri, range };
		}
	}
	return null;
}

async function findTagDefinition(
	provider: ReturnType<typeof createDocumentProvider>,
	ctx: TelescopeContext,
	tagName: string,
): Promise<Definition | null> {
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;
		const ast = doc.kind === "open" ? (doc.cached.parsedObject as any) : (doc.parsed.ast as any);
		const tags = Array.isArray(ast?.tags) ? ast.tags : null;
		if (!tags) continue;
		for (let i = 0; i < tags.length; i++) {
			const t = tags[i];
			if (t && typeof t === "object" && (t as any).name === tagName) {
				const ptr = joinPointer(["tags", String(i), "name"]);
				const range = provider.pointerToRange(doc, ptr);
				if (range) return { uri, range };
			}
		}
	}
	return null;
}

async function findOperationByOperationId(
	provider: ReturnType<typeof createDocumentProvider>,
	ctx: TelescopeContext,
	opId: string,
): Promise<Definition | null> {
	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;
		const ast = doc.kind === "open" ? (doc.cached.parsedObject as any) : (doc.parsed.ast as any);
		const paths = ast?.paths && typeof ast.paths === "object" ? ast.paths : null;
		if (!paths) continue;
		for (const [path, pathItem] of Object.entries(paths)) {
			if (!pathItem || typeof pathItem !== "object") continue;
			for (const method of methods) {
				const op = (pathItem as any)[method];
				if (!op || typeof op !== "object") continue;
				if (typeof op.operationId === "string" && op.operationId === opId) {
					const ptr = joinPointer(["paths", String(path), method, "operationId"]);
					const range = provider.pointerToRange(doc, ptr);
					if (range) return { uri, range };
				}
			}
		}
	}
	return null;
}

/**
 * Provide references to a component.
 */
async function provideReferences(
	cached: CachedDocument,
	position: Position,
	includeDeclaration: boolean,
	cache: DocumentCache,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
	referencesIndex: ReferencesIndex,
): Promise<Location[]> {
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
		const targetDoc = await provider.get(targetUri);
		if (targetDoc) {
			const range = provider.pointerToRange(targetDoc, targetPointer);
			if (range) locations.push({ uri: targetUri, range });
		}
	}

	// Use the FS-backed references index for inbound $ref locations
	if (targetPointer) {
		const inbound = await referencesIndex.getInboundRefsToPointer(
			targetUri,
			targetPointer,
		);
		locations.push(...inbound.locations);
	} else {
		const inbound = await referencesIndex.getInboundRefsWithOptions(targetUri);
		locations.push(...inbound.locations);
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
async function prepareCallHierarchy(
	cached: CachedDocument,
	position: Position,
	cache: DocumentCache,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<CallHierarchyItem[] | null> {
	const offset = cache.positionToOffset(cached, position);

	// Find component at position
	const pointer = findComponentPointerAtOffset(cached, offset);
	if (!pointer) return null;

	const openDoc = await provider.get(cached.uri);
	if (!openDoc) return null;
	const node = provider.findNode(openDoc, pointer);
	if (!node?.loc) return null;

	const range = provider.locToRange(openDoc, node.loc);
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
async function provideIncomingCalls(
	item: CallHierarchyItem,
	cache: DocumentCache,
	ctx: TelescopeContext,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<CallHierarchyIncomingCall[]> {
	const calls: CallHierarchyIncomingCall[] = [];
	const targetPointer = (item.data as { pointer?: string } | undefined)
		?.pointer;
	if (!targetPointer) return calls;

	// Search all known OpenAPI files
	for (const uri of ctx.getKnownOpenAPIFiles()) {
		const doc = await provider.get(uri);
		if (!doc) continue;

		const refs = findAllRefNodes(provider.getIR(doc).root);
		for (const { node, ref } of refs) {
			const { targetUri, pointer } = resolveRefTarget(uri, ref);
			if (targetUri === item.uri && pointer === targetPointer) {
				if (node.loc) {
					const range = provider.locToRange(doc, node.loc);
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
async function provideOutgoingCalls(
	item: CallHierarchyItem,
	cache: DocumentCache,
	provider: ReturnType<typeof createDocumentProvider>,
): Promise<CallHierarchyOutgoingCall[]> {
	const calls: CallHierarchyOutgoingCall[] = [];

	const doc = await provider.get(item.uri);
	if (!doc) return calls;

	const targetPointer = (item.data as { pointer?: string } | undefined)
		?.pointer;
	if (!targetPointer) return calls;

	// Find the node for this item
	const node = provider.findNode(doc, targetPointer);
	if (!node) return calls;

	// Find all refs within this node
	const refs = findAllRefNodes(node);
	for (const { node: refNode, ref } of refs) {
		const { targetUri, pointer } = resolveRefTarget(doc.uri, ref);

		if (refNode.loc) {
			const fromRange = provider.locToRange(doc, refNode.loc);
			if (fromRange) {
				// Get target info
				const targetDoc =
					targetUri === doc.uri ? doc : await provider.get(targetUri);
				let targetRange = fromRange; // fallback

				if (targetDoc) {
					const r = provider.pointerToRange(targetDoc, pointer);
					if (r) targetRange = r;
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
