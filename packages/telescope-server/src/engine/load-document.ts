/**
 * Document Loading Module
 *
 * This module provides functionality to load and parse OpenAPI documents
 * (YAML or JSON) into a unified ParsedDocument structure that includes:
 *
 * - Parsed AST (plain JavaScript object)
 * - Intermediate Representation (IR) with precise location tracking
 * - Source map for pointer-to-range conversion
 * - Metadata (format, version, hash, modification time)
 *
 * The module supports both file system-based loading and in-memory content.
 *
 * @module engine/load-document
 *
 * @see {@link ParsedDocument} - The output type
 * @see {@link IRDocument} - The Intermediate Representation type
 *
 * @example
 * ```typescript
 * import { loadDocument } from "telescope-server";
 *
 * // Load from file system
 * const doc = await loadDocument({
 *   fileSystem,
 *   uri: "file:///path/to/api.yaml"
 * });
 *
 * // Load with provided content
 * const doc = await loadDocument({
 *   fileSystem,
 *   uri: "file:///api.yaml",
 *   text: "openapi: 3.1.0\ninfo:\n  title: My API\n  version: 1.0.0"
 * });
 *
 * console.log(`Format: ${doc.format}, Version: ${doc.version}`);
 * ```
 */

import type { FileSystem } from "@volar/language-service";
import { parseTree } from "jsonc-parser";
import { URI } from "vscode-uri";
import YAML from "yaml";
import {
	buildIRFromJson,
	buildIRFromYaml,
	findNodeByPointer,
} from "./ir/index.js";
import type { DocumentFormat, ParsedDocument } from "./types.js";
import { mightBeOpenAPIDocument } from "./utils/document-utils.js";
import { readFileWithMetadata } from "./utils/file-system-utils.js";
import { buildLineOffsets, getLineCol } from "./utils/line-offset-utils.js";
import { normalizeUri } from "./utils/ref-utils.js";

/**
 * Options for loading a document.
 *
 * @example
 * ```typescript
 * const options: LoadDocumentOptions = {
 *   fileSystem: volarFileSystem,
 *   uri: "file:///api.yaml",
 *   text: undefined // Will read from file system
 * };
 * ```
 */
export interface LoadDocumentOptions {
	/** Volar file system for reading files */
	fileSystem: FileSystem;
	/** URI of the document to load */
	uri: string;
	/** Optional pre-loaded text content (bypasses file system read) */
	text?: string;
}

/**
 * Detect the document format based on file extension and content.
 *
 * Detection order:
 * 1. File extension (.yaml, .yml → yaml)
 * 2. Content pattern (starts with "openapi:" → yaml)
 * 3. Default to json
 *
 * @param uri - Document URI
 * @param text - Document content
 * @returns Detected format ("yaml" or "json")
 *
 * @internal
 */
function detectFormat(uri: string, text: string): DocumentFormat {
	const path = toPathname(uri);
	if (path && /\.ya?ml$/i.test(path)) return "yaml";
	if (/^\s*openapi:/m.test(text)) return "yaml";
	return "json";
}

/**
 * Extract pathname from a URI string.
 *
 * @param uri - URI string (file://, http://, etc.)
 * @returns Pathname portion of the URI, or the original string if not parseable
 *
 * @internal
 */
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

/**
 * Detect the OpenAPI version from a parsed document AST.
 *
 * Checks the `openapi` field to determine the specification version.
 * Supports OpenAPI 3.0.x, 3.1.x, and 3.2.x.
 *
 * @param ast - Parsed document AST
 * @returns Version string ("3.0", "3.1", "3.2") or "unknown"
 *
 * @example
 * ```typescript
 * const version = detectDocumentVersion({ openapi: "3.1.0", info: { ... } });
 * // Returns "3.1"
 * ```
 */
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
 * Load and parse an OpenAPI document.
 *
 * This function reads a document from the file system (or uses provided text),
 * parses it as YAML or JSON, builds an Intermediate Representation with
 * location tracking, and returns a complete ParsedDocument.
 *
 * The function:
 * 1. Reads the file (or uses provided text)
 * 2. Detects the format (YAML or JSON)
 * 3. Parses the content into an AST
 * 4. Builds an IR with precise byte-level location information
 * 5. Creates a source map for pointer-to-range lookups
 * 6. Detects the OpenAPI version
 *
 * @param options - Loading options (file system, URI, optional text)
 * @param allowNonOpenAPI - If true, allows loading non-OpenAPI files (for generic rules)
 * @returns Parsed document with AST, IR, source map, and metadata
 *
 * @throws Error if the file is not found
 * @throws Error if the file is not an OpenAPI document (unless allowNonOpenAPI is true)
 * @throws Error if YAML/JSON parsing fails
 *
 * @example
 * ```typescript
 * // Load an OpenAPI document
 * const doc = await loadDocument({
 *   fileSystem,
 *   uri: "file:///api.yaml"
 * });
 *
 * // Access the parsed content
 * const paths = (doc.ast as Record<string, unknown>).paths;
 *
 * // Find a source location
 * const range = doc.sourceMap.pointerToRange("#/paths/~1users/get");
 *
 * // Check the version
 * if (doc.version === "3.1") {
 *   // Handle OpenAPI 3.1 specific features
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Load a non-OpenAPI file for generic validation
 * const configDoc = await loadDocument({
 *   fileSystem,
 *   uri: "file:///config.yaml"
 * }, true); // allowNonOpenAPI = true
 * ```
 */
export async function loadDocument(
	options: LoadDocumentOptions,
	allowNonOpenAPI = false,
): Promise<ParsedDocument> {
	const uri =
		typeof options.uri === "string" ? URI.parse(options.uri) : options.uri;
	const fileData = options.text
		? { text: options.text, hash: "", mtimeMs: Date.now() }
		: await readFileWithMetadata(options.fileSystem, uri);

	if (!fileData) {
		// Fallback if file system read failed (should have been handled by options.text if provided)
		throw new Error(`File not found: ${uri.toString()}`);
	}

	const { text, hash, mtimeMs } = fileData;
	// Normalize URI for consistent storage and lookup in document maps
	const uriString = normalizeUri(uri);

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
		const version = allowNonOpenAPI
			? "unknown"
			: detectDocumentVersion(parsedAst);
		// Only build IR for OpenAPI documents
		if (allowNonOpenAPI) {
			// For non-OpenAPI files, create a minimal IR-like structure
			ir = {
				root: {
					value: parsedAst,
					kind:
						typeof parsedAst === "object" && parsedAst !== null
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
					kind:
						typeof parsed === "object" && parsed !== null
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
		ir,
		sourceMap,
		rawText: text,
		hash,
		mtimeMs,
	};
}

export { detectDocumentVersion };
