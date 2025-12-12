/**
 * Shared utilities for LSP handlers.
 *
 * @module lsp/handlers/shared
 */

import type { TextDocuments, Connection } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Range, Position } from "vscode-languageserver-protocol";
import * as yaml from "yaml";
import * as jsonc from "jsonc-parser";

import type { DocumentCache, CachedDocument } from "../document-cache.js";
import type { TelescopeContext } from "../context.js";
import type { IRNode } from "../../engine/ir/types.js";
import {
	joinPointer,
	parseJsonPointer,
} from "../../engine/utils/pointer-utils.js";
import { normalizeUri, resolveRef } from "../../engine/utils/ref-utils.js";
import { URI } from "vscode-uri";

/**
 * Handler context passed to all handler functions.
 */
export interface HandlerContext {
	connection: Connection;
	documents: TextDocuments<TextDocument>;
	cache: DocumentCache;
	ctx: TelescopeContext;
}

/**
 * Check if a cached document is an OpenAPI document.
 */
export function isOpenAPIDocument(cached: CachedDocument): boolean {
	return cached.documentType !== "unknown";
}

/**
 * Get a document from TextDocuments by URI.
 */
export function getDocument(
	documents: TextDocuments<TextDocument>,
	uri: string,
): TextDocument | undefined {
	return documents.get(uri);
}

/**
 * Convert JSON pointer path segments to string.
 */
export function pointerPathToString(path: (string | number)[]): string {
	return joinPointer(path.map(String));
}

/**
 * Find all $ref nodes in an IR tree.
 */
export function findAllRefNodes(
	node: IRNode,
): Array<{ node: IRNode; ref: string }> {
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
 * Find a node at a specific JSON pointer in IR.
 */
export function findNodeAtPointer(root: IRNode, pointer: string): IRNode | null {
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
export function getPointerKey(pointer: string): string | undefined {
	const path = parseJsonPointer(pointer);
	const last = path[path.length - 1];
	return typeof last === "string" ? last : undefined;
}

/**
 * Find a $ref node at a specific byte offset.
 */
export function findRefNodeAtOffset(
	node: IRNode,
	offset: number,
	cache: DocumentCache,
	doc: CachedDocument,
): IRNode | null {
	// Check if this is a $ref node and the offset is within its value range
	if (node.kind === "string" && node.key === "$ref" && node.loc) {
		const startOffset = node.loc.start ?? 0;
		const endOffset = node.loc.end ?? startOffset;
		if (offset >= startOffset && offset <= endOffset) {
			return node;
		}
	}

	// Recurse into children
	if (node.children) {
		for (const child of node.children) {
			const found = findRefNodeAtOffset(child, offset, cache, doc);
			if (found) return found;
		}
	}

	return null;
}

/**
 * Get a value at a JSON pointer path in a JavaScript object.
 */
export function getValueAtPath(
	obj: unknown,
	path: (string | number)[],
): unknown {
	let current = obj;
	for (const segment of path) {
		if (current === null || current === undefined) return undefined;
		if (typeof current !== "object") return undefined;
		current = (current as Record<string | number, unknown>)[segment];
	}
	return current;
}

/**
 * Resolve a $ref value to a target URI and pointer.
 */
export function resolveRefTarget(
	sourceUri: string,
	refValue: string,
): { targetUri: string; pointer: string } {
	if (refValue.startsWith("#")) {
		// Same-document reference
		return {
			targetUri: sourceUri,
			pointer: refValue.substring(1),
		};
	}

	// Relative or absolute file path
	const resolved = resolveRef(URI.parse(sourceUri), refValue);
	return {
		targetUri: resolved.with({ fragment: "" }).toString(),
		pointer: resolved.fragment || "",
	};
}

/**
 * Check if a position is within a range.
 */
export function isPositionInRange(pos: Position, range: Range): boolean {
	if (pos.line < range.start.line || pos.line > range.end.line) {
		return false;
	}
	if (pos.line === range.start.line && pos.character < range.start.character) {
		return false;
	}
	if (pos.line === range.end.line && pos.character > range.end.character) {
		return false;
	}
	return true;
}

/**
 * Create a Range from start and end positions.
 */
export function createRange(
	startLine: number,
	startChar: number,
	endLine: number,
	endChar: number,
): Range {
	return {
		start: { line: startLine, character: startChar },
		end: { line: endLine, character: endChar },
	};
}

