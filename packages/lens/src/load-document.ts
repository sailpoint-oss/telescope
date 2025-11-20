/**
 * Document loading utility for lens package.
 * Replaces loader's loadDocument using engine's IR building.
 */

import type { FileSystem } from "@volar/language-service";
import { buildIRFromJson, buildIRFromYaml, findNodeByPointer } from "./ir/index.js";
import { readFileWithMetadata } from "shared/file-system-utils";
import { mightBeOpenAPIDocument } from "shared/document-utils";
import { buildLineOffsets, getLineCol } from "shared/line-offset-utils";
import { parseTree } from "jsonc-parser";
import { URI } from "vscode-uri";
import YAML from "yaml";
import type { DocumentFormat, ParsedDocument } from "./types";

export interface LoadDocumentOptions {
	fileSystem: FileSystem;
	uri: string;
	text?: string;
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

function detectDocumentVersion(ast: unknown): string {
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

/**
 * Convert IR document to AST by extracting the root value.
 */
function irToAst(ir: {
	root: {
		value?: unknown;
		children?: Array<{ key?: string; value?: unknown; children?: unknown[] }>;
	};
}): unknown {
	if (!ir.root) return {};

	// If root has a direct value (shouldn't happen for objects, but handle it)
	if (ir.root.value !== undefined && ir.root.children === undefined) {
		return ir.root.value;
	}

	// Convert IR node to plain object
	function nodeToValue(node: {
		value?: unknown;
		children?: Array<{ key?: string; value?: unknown; children?: unknown[] }>;
		kind?: string;
	}): unknown {
		if (node.value !== undefined && node.children === undefined) {
			return node.value;
		}

		if (node.kind === "array" && Array.isArray(node.children)) {
			return node.children.map((child) => nodeToValue(child as any));
		}

		if (node.kind === "object" && Array.isArray(node.children)) {
			const obj: Record<string, unknown> = {};
			for (const child of node.children) {
				if (child.key !== undefined) {
					obj[child.key] = nodeToValue(child as any);
				}
			}
			return obj;
		}

		return {};
	}

	return nodeToValue(ir.root);
}

export async function loadDocument(
	options: LoadDocumentOptions,
	allowNonOpenAPI = false,
): Promise<ParsedDocument> {
	const uri = typeof options.uri === "string" ? URI.parse(options.uri) : options.uri;
	let fileData = options.text
		? { text: options.text, hash: "", mtimeMs: Date.now() }
		: await readFileWithMetadata(options.fileSystem, uri);

	if (!fileData) {
		// Fallback if file system read failed (should have been handled by options.text if provided)
		throw new Error(`File not found: ${uri.toString()}`);
	}

	const { text, hash, mtimeMs } = fileData;
	const uriString = uri.toString();

	if (!allowNonOpenAPI && !mightBeOpenAPIDocument(uriString, text)) {
		throw new Error(
			`File ${uriString} is not an OpenAPI document and will not be parsed`,
		);
	}

	const format = detectFormat(uriString, text);
	let ir: ReturnType<typeof buildIRFromJson>;
	let ast: unknown;

	if (format === "yaml") {
		const lineCounter = new YAML.LineCounter();
		const document = YAML.parseDocument(text, { lineCounter });
		if (document.errors.length) {
			throw new Error(`YAML parse error: ${document.errors[0]?.message}`);
		}
		const parsedAst = document.toJSON();
		const version = allowNonOpenAPI ? "unknown" : detectDocumentVersion(parsedAst);
		// Only build IR for OpenAPI documents
		if (allowNonOpenAPI) {
			// For non-OpenAPI files, create a minimal IR-like structure
			ir = {
				root: {
					value: parsedAst,
					kind: typeof parsedAst === "object" && parsedAst !== null
						? Array.isArray(parsedAst)
							? "array"
							: "object"
						: typeof parsedAst,
				},
				version: "unknown",
			} as ReturnType<typeof buildIRFromJson>;
		} else {
			ir = buildIRFromYaml(uriString, document, text, hash, mtimeMs, version);
		}
		ast = parsedAst;
	} else {
		const errors: Array<{ error: number; offset: number; length: number }> = [];
		const parsed = JSON.parse(text);
		const tree = parseTree(text, errors);
		const version = allowNonOpenAPI ? "unknown" : detectDocumentVersion(parsed);
		// Only build IR for OpenAPI documents
		if (allowNonOpenAPI) {
			// For non-OpenAPI files, create a minimal IR-like structure
			ir = {
				root: {
					value: parsed,
					kind: typeof parsed === "object" && parsed !== null
						? Array.isArray(parsed)
							? "array"
							: "object"
						: typeof parsed,
				},
				version: "unknown",
			} as ReturnType<typeof buildIRFromJson>;
		} else {
			ir = buildIRFromJson(
				uriString,
				parsed,
				tree ?? null,
				text,
				hash,
				mtimeMs,
				version,
			);
		}
		ast = parsed;
	}

	// Build line offsets cache for byte offset to line/character conversion

	const lineOffsets = buildLineOffsets(text);

	// Create a source map that uses IR's pointer-to-range conversion
	const sourceMap: ParsedDocument["sourceMap"] = {
		pointerToRange(pointer: string) {
			// Use IR to find the node at the pointer
			const node = findNodeByPointer(ir, pointer);
			if (!node || !node.loc) {
				return null;
			}

			// Convert byte offsets to line/character positions
			const startPos = getLineCol(node.loc.start, lineOffsets);
			const endPos = getLineCol(node.loc.end, lineOffsets);

			return {
				start: { line: startPos.line - 1, character: startPos.col - 1 },
				end: { line: endPos.line - 1, character: endPos.col - 1 },
			};
		},
		rangeToPointer(range: {
			start: { line: number; character: number };
			end: { line: number; character: number };
		}) {
			// Convert range to pointer - simplified
			// This would require traversing the IR to find nodes at specific ranges
			// For now, return null as this is less commonly needed
			return null;
		},
	};

	return {
		uri: uriString,
		format,
		version: ir.version,
		ast,
		sourceMap,
		rawText: text,
		hash,
		mtimeMs,
	};
}

export { detectDocumentVersion };
