import type { VfsHost } from "host";
import {
	getNodeValue,
	type Node as JsonNode,
	type ParseError,
	parse as parseJson,
	parseTree as parseJsonTree,
} from "jsonc-parser";
import YAML, {
	isMap as isYamlMap,
	isSeq as isYamlSeq,
	LineCounter,
	type Node as YamlNode,
} from "yaml";
import { identifyDocumentType } from "./document-detection";
import { joinPointer } from "./pointer";
import { MutableSourceMap } from "./source-map";
import type { DocumentFormat, ParsedDocument, Range } from "./types";

export interface LoadDocumentOptions {
	host: VfsHost;
	uri: string;
}

/**
 * Quick check to see if a file might be an OpenAPI document.
 * Returns false for known non-OpenAPI files (package.json, etc.)
 */
function mightBeOpenAPIDocument(uri: string, text: string): boolean {
	const path = toPathname(uri);
	if (!path) return true; // If we can't determine path, proceed with caution

	// Skip known non-OpenAPI files by filename
	const filename = path.toLowerCase();
	const knownNonOpenAPIFiles = [
		"package.json",
		"package-lock.json",
		"pnpm-lock.yaml",
		"tsconfig.json",
		"jsconfig.json",
		"biome.json",
		".prettierrc.json",
		".prettierrc.yaml",
		".prettierrc.yml",
	];

	// Check exact filename matches
	if (knownNonOpenAPIFiles.some((file) => filename.endsWith(file))) {
		return false;
	}

	// Check if filename suggests it's a config file
	if (filename.includes("config") && !filename.includes("openapi")) {
		// Could still be OpenAPI, but check content
	}

	// Quick content check: look for OpenAPI/Swagger indicators in first 10 lines
	const lines = text.split("\n").slice(0, 10).join("\n");
	const hasOpenAPIIndicator =
		/"openapi":/i.test(lines) || /^openapi:/m.test(lines);

	// If it's a JSON file and doesn't have OpenAPI indicators, likely not OpenAPI
	if (/\.json$/i.test(path) && !hasOpenAPIIndicator) {
		// Additional check: if it has common package.json fields, skip it
		if (/"name":|"version":|"dependencies":|"devDependencies":/i.test(lines)) {
			return false;
		}
	}

	return true;
}

export async function loadDocument(
	options: LoadDocumentOptions,
): Promise<ParsedDocument> {
	console.log(`[Document Loading] Loading document: ${options.uri}`);
	const { text, hash, mtimeMs } = await options.host.read(options.uri);

	// Early check: skip known non-OpenAPI files before parsing
	if (!mightBeOpenAPIDocument(options.uri, text)) {
		console.log(
			`[Document Loading] Skipping ${options.uri}: known non-OpenAPI file type`,
		);
		throw new Error(
			`File ${options.uri} is not an OpenAPI document and will not be parsed`,
		);
	}

	const format = detectFormat(options.uri, text);
	console.log(
		`[Document Loading] Detected format: ${format} for ${options.uri}`,
	);
	let result: ParsedDocument;
	if (format === "yaml") {
		result = loadYamlDocument(options.uri, text, hash, mtimeMs);
	} else {
		result = loadJsonDocument(options.uri, text, hash, mtimeMs);
	}

	// Post-parse check: verify this is actually an OpenAPI document
	// Use the unified document type detection
	const docType = identifyDocumentType(result.ast);
	if (docType === "unknown") {
		console.log(
			`[Document Loading] Skipping ${options.uri}: parsed content does not appear to be an OpenAPI document`,
		);
		throw new Error(
			`File ${options.uri} does not appear to be an OpenAPI document`,
		);
	}

	console.log(
		`[Document Loading] Successfully loaded ${options.uri} - version: ${result.version}, format: ${result.format}`,
	);
	return result;
}

/**
 * Detect the OpenAPI version from a parsed document AST.
 */
export function detectDocumentVersion(ast: unknown): string {
	if (!ast || typeof ast !== "object") return "unknown";
	const data = ast as Record<string, unknown>;
	const openapi = data.openapi;
	if (typeof openapi === "string") {
		if (openapi.startsWith("3.2")) return "3.2";
		if (openapi.startsWith("3.1")) return "3.1";
		if (openapi.startsWith("3.0")) return "3.0";
	}
	return "unknown";
}

function detectFormat(uri: string, text: string): DocumentFormat {
	const path = toPathname(uri);
	if (path && /\.ya?ml$/i.test(path)) return "yaml";
	if (/^\s*openapi:/m.test(text)) return "yaml";
	return "json";
}

function toPathname(uri: string): string | null {
	try {
		if (uri.startsWith("file://") || /^[a-zA-Z]+:\/\//.test(uri)) {
			return new URL(uri).pathname;
		}
	} catch {
		return uri;
	}
	return uri;
}

function loadJsonDocument(
	uri: string,
	text: string,
	hash: string,
	mtimeMs: number,
): ParsedDocument {
	console.log(`[Document Parsing] Parsing JSON document: ${uri}`);
	const errors: ParseError[] = [];
	const ast =
		parseJson(text, errors, {
			disallowComments: false,
			allowTrailingComma: true,
		}) ?? {};
	if (errors.length) {
		const err = errors[0];
		console.error(
			`[Document Parsing] JSON parse error for ${uri} at offset ${err?.offset ?? 0}`,
		);
		throw new Error(
			`Failed to parse JSON for ${uri} at offset ${err?.offset ?? 0}`,
		);
	}
	console.log(`[Document Parsing] Successfully parsed JSON: ${uri}`);
	const tree = parseJsonTree(text, errors);
	const sourceMap = new MutableSourceMap();
	if (tree) {
		const lineStarts = computeLineStarts(text);
		visitJsonNode(tree, [], sourceMap, lineStarts, text);
	}
	return {
		uri,
		format: "json",
		version: detectDocumentVersion(ast),
		ast,
		sourceMap,
		rawText: text,
		hash,
		mtimeMs,
	};
}

function computeLineStarts(text: string): number[] {
	const result = [0];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === "\n") {
			result.push(i + 1);
		}
	}
	return result;
}

function offsetToPosition(
	offset: number,
	lineStarts: number[],
): { line: number; character: number } {
	let low = 0;
	let high = lineStarts.length;
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		const midValue = lineStarts[mid];
		if (midValue !== undefined && midValue > offset) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}
	const line = Math.max(0, low - 1);
	const lineStart = lineStarts[line];
	const character = lineStart !== undefined ? offset - lineStart : 0;
	return { line, character };
}

function visitJsonNode(
	node: JsonNode,
	segments: string[],
	map: MutableSourceMap,
	lineStarts: number[],
	text: string,
) {
	const pointer = joinPointer(segments);
	const start = offsetToPosition(node.offset, lineStarts);
	const end = offsetToPosition(node.offset + node.length, lineStarts);
	map.set(pointer, { start, end });

	if (node.type === "object") {
		for (const child of node.children ?? []) {
			if (!child.children || child.children.length < 2) continue;
			const keyNode = child.children[0];
			const valueNode = child.children[1];
			if (!keyNode || !valueNode) continue;
			const key =
				(typeof keyNode.value === "string"
					? keyNode.value
					: getNodeValue(keyNode)) ?? "";
			visitJsonNode(
				valueNode,
				[...segments, String(key)],
				map,
				lineStarts,
				text,
			);
		}
	} else if (node.type === "array") {
		node.children?.forEach((child, index) => {
			if (child) {
				visitJsonNode(
					child,
					[...segments, String(index)],
					map,
					lineStarts,
					text,
				);
			}
		});
	}
}

function loadYamlDocument(
	uri: string,
	text: string,
	hash: string,
	mtimeMs: number,
): ParsedDocument {
	console.log(`[Document Parsing] Parsing YAML document: ${uri}`);
	const lineCounter = new LineCounter();
	const document = YAML.parseDocument(text, {
		lineCounter,
	});
	if (document.errors.length) {
		const err = document.errors[0];
		console.error(
			`[Document Parsing] YAML parse error for ${uri}: ${err?.message}`,
		);
		throw new Error(`Failed to parse YAML for ${uri}: ${err?.message}`);
	}
	console.log(`[Document Parsing] Successfully parsed YAML: ${uri}`);
	const sourceMap = new MutableSourceMap();
	const contents = document.contents;
	if (contents) {
		visitYamlNode(contents, [], sourceMap, lineCounter);
	}
	// Map the entire document to the full range
	const endOffset = text.length;
	const startPos = lineCounter.linePos(0);
	const endPos = lineCounter.linePos(endOffset);
	sourceMap.set("#", {
		start: {
			line: Math.max(0, startPos.line - 1),
			character: Math.max(0, startPos.col - 1),
		},
		end: {
			line: Math.max(0, endPos.line - 1),
			character: Math.max(0, endPos.col - 1),
		},
	});
	const ast = document.toJSON();
	return {
		uri,
		format: "yaml",
		version: detectDocumentVersion(ast),
		ast,
		sourceMap,
		rawText: text,
		hash,
		mtimeMs,
	};
}

function visitYamlNode(
	node: YamlNode,
	segments: string[],
	map: MutableSourceMap,
	counter: LineCounter,
) {
	const pointer = joinPointer(segments);
	const range = toRange(node, counter);
	if (range) {
		map.set(pointer, range);
	}

	if (isYamlMap(node)) {
		for (const item of node.items) {
			const keyNode = item.key;
			const valueNode = item.value;
			if (!keyNode || !valueNode) continue;
			// Type guard: ensure keyNode has toJSON method
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
			// Type guard: ensure valueNode is a YamlNode
			if (valueNode && typeof valueNode === "object" && "range" in valueNode) {
				visitYamlNode(valueNode as YamlNode, [...segments, key], map, counter);
			}
		}
	} else if (isYamlSeq(node)) {
		node.items.forEach((child, index) => {
			if (child && typeof child === "object" && "range" in child) {
				visitYamlNode(
					child as YamlNode,
					[...segments, String(index)],
					map,
					counter,
				);
			}
		});
	}
}

function toRange(node: YamlNode, counter: LineCounter): Range | null {
	const range = node.range as [number, number] | undefined;
	if (!range) return null;
	const start = counter.linePos(range[0]);
	const end = counter.linePos(range[1]);
	return {
		start: {
			line: Math.max(0, start.line - 1),
			character: Math.max(0, start.col - 1),
		},
		end: {
			line: Math.max(0, end.line - 1),
			character: Math.max(0, end.col - 1),
		},
	};
}
