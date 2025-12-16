/**
 * Document Highlights Handler
 *
 * Provides textDocument/documentHighlight for OpenAPI documents.
 * Focuses on in-document occurrences for common identifiers:
 * - $ref targets (highlight all refs to same target within this document)
 * - component definitions (highlight definition key + refs within this document)
 * - operationId values (highlight matching operationIds within this document)
 * - operation tags (highlight matching tag values within this document)
 *
 * @module lsp/handlers/document-highlights
 */

import type { Connection, TextDocuments } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type {
	DocumentHighlight,
	DocumentHighlightKind,
} from "vscode-languageserver-protocol";

import type { TelescopeContext } from "../context.js";
import type { CachedDocument, DocumentCache } from "../document-cache.js";
import {
	findAllRefNodes,
	findRefNodeAtOffset,
	isOpenAPIDocument,
	resolveRefTarget,
} from "./shared.js";

export function registerDocumentHighlightHandlers(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	cache: DocumentCache,
	ctx: TelescopeContext,
): void {
	const logger = ctx.getLogger("DocumentHighlights");

	connection.onDocumentHighlight((params): DocumentHighlight[] => {
		try {
			const doc = documents.get(params.textDocument.uri);
			if (!doc) return [];

			const cached = cache.get(doc);
			if (!isOpenAPIDocument(cached)) return [];

			return provideDocumentHighlights(cached, params.position, cache);
		} catch (error) {
			logger.error(
				`Document highlights failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return [];
		}
	});
}

function provideDocumentHighlights(
	cached: CachedDocument,
	position: { line: number; character: number },
	cache: DocumentCache,
): DocumentHighlight[] {
	const offset = cache.positionToOffset(cached, position);

	// 1) $ref at cursor: highlight all refs to same target within this document.
	const refNode = findRefNodeAtOffset(cached.ir.root, offset, cache, cached);
	if (refNode?.loc && typeof refNode.value === "string") {
		const { targetUri, pointer } = resolveRefTarget(cached.uri, refNode.value);
		if (targetUri === cached.uri) {
			return highlightRefsToPointer(cached, cache, pointer);
		}
		return []; // cross-file highlights are not documentHighlight's job
	}

	// 2) operationId value highlights
	const opIdHit = findOperationIdAtOffset(cached, offset, cache);
	if (opIdHit) {
		return highlightOperationIds(cached, cache, opIdHit);
	}

	// 3) tag value highlights
	const tagHit = findTagAtOffset(cached, offset, cache);
	if (tagHit) {
		return highlightTags(cached, cache, tagHit);
	}

	// 4) component name key highlights + refs
	const componentPointer = findComponentPointerAtOffset(cached, offset, cache);
	if (componentPointer) {
		const out: DocumentHighlight[] = [];
		const keyRange = cache.getKeyRange(cached, pointerToPath(componentPointer));
		if (keyRange) out.push({ range: keyRange, kind: 2 as DocumentHighlightKind });
		out.push(...highlightRefsToPointer(cached, cache, componentPointer));
		return out;
	}

	return [];
}

function highlightRefsToPointer(
	cached: CachedDocument,
	cache: DocumentCache,
	targetPointer: string,
): DocumentHighlight[] {
	const highlights: DocumentHighlight[] = [];
	const refs = findAllRefNodes(cached.ir.root);
	for (const { node, ref } of refs) {
		const { targetUri, pointer } = resolveRefTarget(cached.uri, ref);
		if (targetUri !== cached.uri) continue;
		if (pointer !== targetPointer) continue;
		if (!node.loc) continue;
		const range = cache.locToRange(cached, node.loc);
		if (!range) continue;
		highlights.push({ range, kind: 1 as DocumentHighlightKind });
	}
	return highlights;
}

function findOperationIdAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): string | null {
	const ast = cached.parsedObject as Record<string, unknown>;
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (!paths) return null;

	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;
		for (const method of methods) {
			const op = (pathItem as any)[method] as Record<string, unknown> | undefined;
			if (!op || typeof op.operationId !== "string") continue;
			const range = cache.getRange(cached, ["paths", path, method, "operationId"]);
			if (!range) continue;
			const start = cache.positionToOffset(cached, range.start);
			const end = cache.positionToOffset(cached, range.end);
			if (offset >= start && offset <= end) return op.operationId;
		}
	}
	return null;
}

function highlightOperationIds(
	cached: CachedDocument,
	cache: DocumentCache,
	operationId: string,
): DocumentHighlight[] {
	const highlights: DocumentHighlight[] = [];
	const ast = cached.parsedObject as Record<string, unknown>;
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (!paths) return highlights;

	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;
		for (const method of methods) {
			const op = (pathItem as any)[method] as Record<string, unknown> | undefined;
			if (!op || op.operationId !== operationId) continue;
			const range = cache.getRange(cached, ["paths", path, method, "operationId"]);
			if (range) highlights.push({ range, kind: 1 as DocumentHighlightKind });
		}
	}
	return highlights;
}

function findTagAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): string | null {
	const ast = cached.parsedObject as Record<string, unknown>;
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (!paths) return null;

	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;
		for (const method of methods) {
			const op = (pathItem as any)[method] as Record<string, unknown> | undefined;
			if (!op || !Array.isArray(op.tags)) continue;
			for (let i = 0; i < op.tags.length; i++) {
				const tag = op.tags[i];
				if (typeof tag !== "string") continue;
				const range = cache.getRange(cached, ["paths", path, method, "tags", i]);
				if (!range) continue;
				const start = cache.positionToOffset(cached, range.start);
				const end = cache.positionToOffset(cached, range.end);
				if (offset >= start && offset <= end) return tag;
			}
		}
	}
	return null;
}

function highlightTags(
	cached: CachedDocument,
	cache: DocumentCache,
	tag: string,
): DocumentHighlight[] {
	const highlights: DocumentHighlight[] = [];
	const ast = cached.parsedObject as Record<string, unknown>;
	const paths = ast?.paths as Record<string, unknown> | undefined;
	if (!paths) return highlights;

	const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
	for (const [path, pathItem] of Object.entries(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;
		for (const method of methods) {
			const op = (pathItem as any)[method] as Record<string, unknown> | undefined;
			if (!op || !Array.isArray(op.tags)) continue;
			for (let i = 0; i < op.tags.length; i++) {
				if (op.tags[i] !== tag) continue;
				const range = cache.getRange(cached, ["paths", path, method, "tags", i]);
				if (range) highlights.push({ range, kind: 1 as DocumentHighlightKind });
			}
		}
	}
	return highlights;
}

function findComponentPointerAtOffset(
	cached: CachedDocument,
	offset: number,
	cache: DocumentCache,
): string | null {
	const node = findNodeContainingOffset(cached.ir.root, offset);
	if (!node) return null;
	if (!node.pointer?.startsWith("/components/")) return null;
	const parts = node.pointer.split("/");
	if (parts.length < 4) return null;
	return parts.slice(0, 4).join("/");
}

function findNodeContainingOffset(node: any, offset: number): any | null {
	if (!node?.loc) return null;
	const start = node.loc.start ?? 0;
	const end = node.loc.end ?? start;
	if (offset < start || offset > end) return null;
	if (node.children) {
		for (const child of node.children) {
			const found = findNodeContainingOffset(child, offset);
			if (found) return found;
		}
	}
	return node;
}

function pointerToPath(pointer: string): (string | number)[] {
	return pointer
		.split("/")
		.filter((p) => p.length > 0)
		.map((p) => p);
}


