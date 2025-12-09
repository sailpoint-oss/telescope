/**
 * YAML IR Builder - converts YAML CST to IR with precise offsets.
 */

import YAML, {
	isMap as isYamlMap,
	isSeq as isYamlSeq,
	type Pair,
	type Node as YamlNode,
} from "yaml";
import type { IRDocument, IRNode, IRNodeKind, Loc } from "./types.js";

/**
 * Build IR from YAML document.
 */
export function buildIRFromYaml(
	uri: string,
	document: YAML.Document.Parsed,
	rawText: string,
	hash: string,
	mtimeMs: number,
	version: string,
): IRDocument {
	const contents = document.contents;
	const root = contents
		? yamlNodeToIR(contents, [], uri, document)
		: createScalarIR("#", uri, "null", null, 0, rawText.length);

	return {
		root,
		uri,
		format: "yaml",
		version,
		rawText,
		hash,
		mtimeMs,
	};
}

function yamlNodeToIR(
	node: YamlNode,
	segments: string[],
	uri: string,
	document: YAML.Document.Parsed,
): IRNode {
	const ptr = segments.length === 0 ? "#" : `#/${segments.join("/")}`;
	const range = node.range;
	const start = range?.[0] ?? 0;
	const end = range?.[1] ?? start;
	const loc: Loc = { start, end };

	// Check for alias (YAML anchor reference)
	if (node.type === "ALIAS") {
		const alias = node as YAML.Alias;
		const targetPtr = alias.source
			? findAnchorPointer(alias.source, document)
			: undefined;
		return {
			ptr,
			kind: inferYamlKind(node),
			value: alias.toJSON(),
			loc,
			uri,
			aliasTargetPtr: targetPtr,
		};
	}

	if (isYamlMap(node)) {
		const children: IRNode[] = [];
		for (const item of node.items) {
			const pair = item as Pair;
			const keyNode = pair.key;
			const valueNode = pair.value;
			if (!keyNode || !valueNode) continue;

			// Extract key value and location
			let keyValue: unknown;
			if (
				typeof keyNode === "object" &&
				keyNode !== null &&
				"toJSON" in keyNode &&
				typeof (keyNode as { toJSON(): unknown }).toJSON === "function"
			) {
				keyValue = (keyNode as { toJSON(): unknown }).toJSON();
			} else {
				keyValue = keyNode;
			}
			const key = keyValue == null ? "" : String(keyValue);

			const keyRange = keyNode.range;
			const keyStart = keyRange?.[0] ?? 0;
			const keyEnd = keyRange?.[1] ?? keyStart;

			const valRange = valueNode.range;
			const valStart = valRange?.[0] ?? 0;
			const valEnd = valRange?.[1] ?? valStart;

			const valueIR = yamlNodeToIR(
				valueNode as YamlNode,
				[...segments, escapePointerSegment(key)],
				uri,
				document,
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

	if (isYamlSeq(node)) {
		const children: IRNode[] = [];
		node.items.forEach((child, index) => {
			if (child && typeof child === "object" && "range" in child) {
				const childIR = yamlNodeToIR(
					child as YamlNode,
					[...segments, String(index)],
					uri,
					document,
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
	const value = node.toJSON();
	const kind = inferYamlKind(node);
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

function inferYamlKind(node: YamlNode): IRNodeKind {
	if (node.type === "ALIAS") return "null"; // Will be resolved later
	if (
		node.type === "BLOCK_FOLDED" ||
		node.type === "BLOCK_LITERAL" ||
		node.type === "QUOTE_DOUBLE" ||
		node.type === "QUOTE_SINGLE"
	) {
		return "string";
	}
	if (node.type === "PLAIN") {
		const value = node.toJSON();
		if (value === null) return "null";
		if (typeof value === "boolean") return "boolean";
		if (typeof value === "number") return "number";
		if (typeof value === "string") return "string";
		return "string";
	}
	if (isYamlMap(node)) return "object";
	if (isYamlSeq(node)) return "array";
	return "null";
}

/**
 * Find the JSON pointer for a YAML anchor.
 * This is a simplified implementation - full anchor resolution would require
 * traversing the document to find where the anchor is defined.
 */
function findAnchorPointer(
	anchor: string,
	_document: YAML.Document.Parsed,
): string | undefined {
	// TODO: Implement full anchor resolution
	// For now, return undefined - rules can handle this lazily if needed
	return undefined;
}

/**
 * Escape JSON Pointer segment according to RFC 6901.
 */
function escapePointerSegment(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
