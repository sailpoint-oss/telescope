/**
 * JSON IR Builder - converts JSON AST to IR with precise offsets.
 */

import type { Node as JsonNode } from "jsonc-parser";
import { getNodeValue } from "jsonc-parser";
import type { IRDocument, IRNode, IRNodeKind, Loc } from "./types.js";

/**
 * Build IR from JSON AST tree.
 */
export function buildIRFromJson(
	uri: string,
	ast: unknown,
	tree: JsonNode | null,
	rawText: string,
	hash: string,
	mtimeMs: number,
	version: string,
): IRDocument {
	const root = tree
		? jsonNodeToIR(tree, [], uri, rawText)
		: createScalarIR("#", uri, inferKind(ast), ast, 0, rawText.length);

	return {
		root,
		uri,
		format: "json",
		version,
		rawText,
		hash,
		mtimeMs,
	};
}

function jsonNodeToIR(
	node: JsonNode,
	segments: string[],
	uri: string,
	text: string,
): IRNode {
	const ptr = segments.length === 0 ? "#" : `#/${segments.join("/")}`;
	const start = node.offset;
	const end = node.offset + node.length;
	const loc: Loc = { start, end };

	if (node.type === "object") {
		const children: IRNode[] = [];
		for (const child of node.children ?? []) {
			if (!child.children || child.children.length < 2) continue;
			const keyNode = child.children[0];
			const valueNode = child.children[1];
			if (!keyNode || !valueNode) continue;

			const keyValue =
				typeof keyNode.value === "string"
					? keyNode.value
					: (getNodeValue(keyNode) ?? "");
			const key = String(keyValue);

			// Extract key location
			const keyStart = keyNode.offset;
			const keyEnd = keyNode.offset + keyNode.length;

			// Extract value location
			const valStart = valueNode.offset;
			const valEnd = valueNode.offset + valueNode.length;

			const valueIR = jsonNodeToIR(
				valueNode,
				[...segments, escapePointerSegment(key)],
				uri,
				text,
			);
			valueIR.key = key;
			valueIR.loc.keyStart = keyStart;
			valueIR.loc.keyEnd = keyEnd;
			valueIR.loc.valStart = valStart;
			valueIR.loc.valEnd = valEnd;
			children.push(valueIR);
		}

		return {
			ptr,
			kind: "object",
			children,
			loc,
			uri,
		};
	}

	if (node.type === "array") {
		const children: IRNode[] = [];
		node.children?.forEach((child, index) => {
			if (child) {
				const childIR = jsonNodeToIR(
					child,
					[...segments, String(index)],
					uri,
					text,
				);
				children.push(childIR);
			}
		});

		return {
			ptr,
			kind: "array",
			children,
			loc,
			uri,
		};
	}

	// Scalar node
	const value = getNodeValue(node);
	const kind = inferKind(value);
	return {
		ptr,
		kind,
		value,
		loc,
		uri,
	};
}

function createScalarIR(
	ptr: string,
	uri: string,
	kind: IRNodeKind,
	value: unknown,
	start: number,
	end: number,
): IRNode {
	return {
		ptr,
		kind,
		value,
		loc: { start, end },
		uri,
	};
}

function inferKind(value: unknown): IRNodeKind {
	if (value === null) return "null";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "number") return "number";
	if (typeof value === "string") return "string";
	if (Array.isArray(value)) return "array";
	if (typeof value === "object") return "object";
	return "null";
}

/**
 * Escape JSON Pointer segment according to RFC 6901.
 */
function escapePointerSegment(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
