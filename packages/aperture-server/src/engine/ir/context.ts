/**
 * IR-based context helpers for rule execution.
 * These utilities allow rules to work directly with IR documents instead of loader's ParsedDocument.
 */

import type { Range } from "vscode-languageserver-protocol";
import { splitPointer } from "../utils/pointer-utils.js";
import type { IRDocument, IRNode, Loc } from "./types.js";

/**
 * Find an IR node by JSON pointer.
 */
export function findNodeByPointer(
	ir: IRDocument | null | undefined,
	ptr: string | null | undefined,
): IRNode | null {
	if (!ir || !ir.root) {
		return null;
	}
	if (!ptr || ptr === "#" || ptr === "") {
		return ir.root;
	}

	const segments = splitPointer(ptr);
	if (!segments || segments.length === 0) {
		return ir.root;
	}

	let current: IRNode = ir.root;

	for (const segment of segments) {
		if (!current || !current.children || !Array.isArray(current.children)) {
			return null;
		}

		if (current.kind === "array") {
			const index = Number(segment);
			if (
				!Number.isInteger(index) ||
				index < 0 ||
				index >= current.children.length
			) {
				return null;
			}
			const nextNode = current.children[index];
			if (!nextNode) {
				return null;
			}
			current = nextNode;
		} else if (current.kind === "object") {
			const found = current.children.find(
				(child) => child && child.key === segment,
			);
			if (!found) {
				return null;
			}
			current = found;
		} else {
			return null;
		}
	}

	return current;
}

/**
 * Get the value at a JSON pointer in an IR document.
 * Returns the JavaScript value (for scalars) or the IR node structure (for objects/arrays).
 */
export function getValueAtPointer(ir: IRDocument, ptr: string): unknown {
	const node = findNodeByPointer(ir, ptr);
	if (!node) {
		return undefined;
	}

	// For leaf nodes, return the scalar value
	if (
		node.kind === "string" ||
		node.kind === "number" ||
		node.kind === "boolean" ||
		node.kind === "null"
	) {
		return node.value;
	}

	// For objects and arrays, convert to plain JavaScript structure
	return irNodeToValue(node);
}

/**
 * Convert an IR node to a plain JavaScript value.
 * This is useful for rules that need to work with the actual data structure.
 */
function irNodeToValue(node: IRNode | null | undefined, depth = 0): unknown {
	// Prevent infinite recursion with depth limit
	if (depth > 100) {
		return undefined;
	}
	if (!node) {
		return undefined;
	}

	switch (node.kind) {
		case "string":
		case "number":
		case "boolean":
			return node.value;
		case "null":
			return null;
		case "array":
			if (!node.children || !Array.isArray(node.children)) {
				return [];
			}
			return node.children
				.filter((child) => child != null)
				.map((child) => irNodeToValue(child, depth + 1));
		case "object": {
			if (!node.children || !Array.isArray(node.children)) {
				return {};
			}
			const obj: Record<string, unknown> = {};
			for (const child of node.children) {
				if (child && child.key) {
					try {
						obj[child.key] = irNodeToValue(child, depth + 1);
					} catch (error) {
						// Skip problematic children
						// Note: In LSP context, warnings should be logged via DiagnosticsLogger
					}
				}
			}
			return obj;
		}
		default:
			return undefined;
	}
}

/**
 * Convert IR Loc to LSP Range using Core's locToRange method.
 * This is a helper that can be used when Core instance is available.
 */
export function irLocToRange(
	core: { locToRange(uri: string, loc: Loc): Range | null },
	uri: string,
	loc: Loc,
): Range | null {
	return core.locToRange(uri, loc);
}

/**
 * Convert IR pointer to LSP Range.
 * Finds the node at the pointer and converts its location to a Range.
 */
export function irPointerToRange(
	ir: IRDocument,
	core: { locToRange(uri: string, loc: Loc): Range | null },
	ptr: string,
): Range | null {
	const node = findNodeByPointer(ir, ptr);
	if (!node) {
		return null;
	}
	return core.locToRange(ir.uri, node.loc);
}
