/**
 * DocumentCache - Caches parsed documents with IR and atoms.
 *
 * This module provides a simple document cache that replaces the complex
 * VirtualCode system from Volar. It caches:
 * - Parsed AST (YAML or JSON)
 * - IR (Intermediate Representation)
 * - Atoms (operations, components, schemas)
 * - Position utilities (line offsets)
 *
 * @module lsp/document-cache
 */

import * as jsonc from "jsonc-parser";
import type { Position, Range } from "vscode-languageserver-protocol";
import type { TextDocument } from "vscode-languageserver-textdocument";
import * as yaml from "yaml";

import type {
	AtomIndex,
	DocumentType,
	IRDocument,
	Loc,
} from "../engine/index.js";
import {
	buildIRFromJson,
	buildIRFromYaml,
	extractAtoms,
	identifyDocumentType,
} from "../engine/index.js";
import { computeDocumentHash } from "../engine/utils/hash-utils.js";
import {
	buildLineOffsets,
	getLineCol,
} from "../engine/utils/line-offset-utils.js";
import type { TelescopeContext } from "./context.js";

/**
 * Represents a cached document with all parsed data.
 */
export interface CachedDocument {
	/** Document URI */
	uri: string;
	/** Document version (for cache invalidation) */
	version: number;
	/** Document format (yaml or json) */
	format: "yaml" | "json";
	/** Raw document content */
	content: string;
	/** Content hash for change detection */
	hash: string;

	// Parsed data
	/** Parsed AST (yaml.Document or jsonc.Node) */
	ast: yaml.Document | jsonc.Node;
	/** Parsed JavaScript object representation */
	parsedObject: unknown;

	// Engine data
	/** Intermediate Representation for rule execution */
	ir: IRDocument;
	/** Extracted atoms (operations, components, etc.) */
	atoms: AtomIndex;
	/** Detected OpenAPI document type */
	documentType: DocumentType;
	/** OpenAPI specification version */
	openapiVersion: string;

	// Position helpers
	/** Line offset array for position calculations */
	lineOffsets: number[];
}

/**
 * DocumentCache manages parsed document data with caching.
 *
 * Documents are cached by URI and version. When a document is requested,
 * the cache checks if the cached version matches. If not, it rebuilds
 * all parsed data (AST, IR, atoms).
 *
 * @example
 * ```typescript
 * const cache = new DocumentCache(ctx);
 * const cached = cache.get(document);
 * console.log(cached.documentType); // "root" | "schema" | etc.
 * ```
 */
export class DocumentCache {
	private cache = new Map<string, CachedDocument>();
	// biome-ignore lint/correctness/noUnusedPrivateClassMembers: reserved for future logging/telemetry hooks
	private ctx: TelescopeContext;

	constructor(ctx: TelescopeContext) {
		this.ctx = ctx;
	}

	/**
	 * Get or build a cached document.
	 *
	 * @param doc - The TextDocument to cache
	 * @returns The cached document with all parsed data
	 */
	get(doc: TextDocument): CachedDocument {
		const cached = this.cache.get(doc.uri);
		if (cached && cached.version === doc.version) {
			return cached;
		}
		return this.build(doc);
	}

	/**
	 * Get a cached document by URI (if it exists in cache).
	 *
	 * @param uri - The document URI
	 * @returns The cached document, or undefined if not cached
	 */
	getByUri(uri: string): CachedDocument | undefined {
		return this.cache.get(uri);
	}

	/**
	 * Check if a document is cached.
	 *
	 * @param uri - The document URI
	 * @returns true if the document is cached
	 */
	has(uri: string): boolean {
		return this.cache.has(uri);
	}

	/**
	 * Invalidate a cached document (forces rebuild on next access).
	 *
	 * @param uri - The document URI to invalidate
	 */
	invalidate(uri: string): void {
		this.cache.delete(uri);
	}

	/**
	 * Remove a document from the cache.
	 *
	 * @param uri - The document URI to remove
	 */
	remove(uri: string): void {
		this.cache.delete(uri);
	}

	/**
	 * Clear all cached documents.
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get all cached document URIs.
	 */
	keys(): IterableIterator<string> {
		return this.cache.keys();
	}

	/**
	 * Get the number of cached documents.
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Build and cache a document.
	 */
	private build(doc: TextDocument): CachedDocument {
		const content = doc.getText();
		const format = this.detectFormat(doc);
		const hash = computeDocumentHash(content);
		const lineOffsets = buildLineOffsets(content);

		// Parse AST
		let ast: yaml.Document | jsonc.Node;
		let parsedObject: unknown;

		if (format === "yaml") {
			const yamlDoc = yaml.parseDocument(content);
			ast = yamlDoc;
			parsedObject = yamlDoc.toJSON();
		} else {
			ast = jsonc.parseTree(content) ?? {
				type: "object",
				offset: 0,
				length: 0,
			};
			parsedObject = jsonc.parse(content);
		}

		// Detect document type
		const documentType = identifyDocumentType(parsedObject);
		const openapiVersion = this.detectVersion(parsedObject);

		// Build IR
		const ir =
			format === "yaml"
				? buildIRFromYaml(
						doc.uri,
						ast as yaml.Document.Parsed,
						content,
						hash,
						Date.now(),
						openapiVersion,
					)
				: buildIRFromJson(
						doc.uri,
						parsedObject,
						ast as jsonc.Node,
						content,
						hash,
						Date.now(),
						openapiVersion,
					);

		// Extract atoms
		const atoms = extractAtoms(ir);

		const cached: CachedDocument = {
			uri: doc.uri,
			version: doc.version,
			format,
			content,
			hash,
			ast,
			parsedObject,
			ir,
			atoms,
			documentType,
			openapiVersion,
			lineOffsets,
		};

		this.cache.set(doc.uri, cached);
		return cached;
	}

	/**
	 * Detect format from document languageId.
	 */
	private detectFormat(doc: TextDocument): "yaml" | "json" {
		const langId = doc.languageId;
		if (langId === "json" || langId === "jsonc" || langId === "openapi-json") {
			return "json";
		}
		return "yaml";
	}

	/**
	 * Detect OpenAPI version from parsed object.
	 */
	private detectVersion(obj: unknown): string {
		if (typeof obj === "object" && obj !== null && "openapi" in obj) {
			const version = (obj as Record<string, unknown>).openapi;
			if (typeof version === "string") {
				return version;
			}
		}
		return "3.1"; // Default
	}

	// =========================================================================
	// Position Utilities
	// =========================================================================

	/**
	 * Convert an IR Loc (byte offsets) to an LSP Range (line/character).
	 *
	 * @param doc - The cached document
	 * @param loc - The IR location with start/end byte offsets
	 * @returns LSP Range, or null if conversion fails
	 */
	locToRange(doc: CachedDocument, loc: Loc): Range | null {
		if (!loc) return null;
		const start = getLineCol(loc.start ?? 0, doc.lineOffsets);
		const end = getLineCol(loc.end ?? loc.start ?? 0, doc.lineOffsets);
		if (!start || !end) return null;
		return {
			start: { line: start.line - 1, character: start.col - 1 },
			end: { line: end.line - 1, character: end.col - 1 },
		};
	}

	/**
	 * Convert a byte offset to an LSP Position.
	 *
	 * @param doc - The cached document
	 * @param offset - Byte offset in the document
	 * @returns LSP Position
	 */
	offsetToPosition(doc: CachedDocument, offset: number): Position {
		const pos = getLineCol(offset, doc.lineOffsets);
		return { line: (pos?.line ?? 1) - 1, character: (pos?.col ?? 1) - 1 };
	}

	/**
	 * Convert an LSP Position to a byte offset.
	 *
	 * @param doc - The cached document
	 * @param pos - LSP Position
	 * @returns Byte offset in the document
	 */
	positionToOffset(doc: CachedDocument, pos: Position): number {
		const lineOffset = doc.lineOffsets[pos.line] ?? 0;
		return lineOffset + pos.character;
	}

	/**
	 * Get the range of a node at a JSON pointer path.
	 *
	 * @param doc - The cached document
	 * @param path - JSON pointer path segments
	 * @returns LSP Range, or undefined if not found
	 */
	getRange(doc: CachedDocument, path: (string | number)[]): Range | undefined {
		if (doc.format === "yaml" && doc.ast instanceof yaml.Document) {
			const node = doc.ast.getIn(path, true);
			if (
				node &&
				typeof node === "object" &&
				"range" in node &&
				Array.isArray(node.range)
			) {
				const offset = node.range[0];
				const endOffset = node.range[1];
				const start = getLineCol(offset, doc.lineOffsets);
				const end = getLineCol(endOffset, doc.lineOffsets);
				if (start && end) {
					return {
						start: { line: start.line - 1, character: start.col - 1 },
						end: { line: end.line - 1, character: end.col - 1 },
					};
				}
			}
		} else if (doc.format === "json") {
			const tree = doc.ast as jsonc.Node;
			const node = jsonc.findNodeAtLocation(tree, path);
			if (node) {
				const start = getLineCol(node.offset, doc.lineOffsets);
				const end = getLineCol(node.offset + node.length, doc.lineOffsets);
				if (start && end) {
					return {
						start: { line: start.line - 1, character: start.col - 1 },
						end: { line: end.line - 1, character: end.col - 1 },
					};
				}
			}
		}
		return undefined;
	}

	/**
	 * Get the range of just the key (not value) at a JSON pointer path.
	 * Used for error highlighting on unrecognized keys.
	 *
	 * @param doc - The cached document
	 * @param path - JSON pointer path segments
	 * @returns LSP Range for the key, or null if not found
	 */
	getKeyRange(doc: CachedDocument, path: (string | number)[]): Range | null {
		if (path.length === 0) return null;

		const key = path[path.length - 1];
		const parentPath = path.slice(0, -1);

		if (doc.format === "yaml" && doc.ast instanceof yaml.Document) {
			const parent = doc.ast.getIn(parentPath, true);
			if (parent && yaml.isMap(parent)) {
				for (const pair of parent.items) {
					if (
						yaml.isScalar(pair.key) &&
						String(pair.key.value) === String(key)
					) {
						const keyRange = pair.key.range;
						if (keyRange && Array.isArray(keyRange)) {
							const start = getLineCol(keyRange[0], doc.lineOffsets);
							const end = getLineCol(keyRange[1], doc.lineOffsets);
							if (start && end) {
								return {
									start: { line: start.line - 1, character: start.col - 1 },
									end: { line: end.line - 1, character: end.col - 1 },
								};
							}
						}
					}
				}
			}
		} else if (doc.format === "json") {
			const tree = doc.ast as jsonc.Node;
			const parentNode = jsonc.findNodeAtLocation(tree, parentPath);
			if (parentNode && parentNode.type === "object" && parentNode.children) {
				for (const prop of parentNode.children) {
					if (prop.type === "property" && prop.children && prop.children[0]) {
						const keyNode = prop.children[0];
						if (keyNode.value === key) {
							const start = getLineCol(keyNode.offset, doc.lineOffsets);
							const end = getLineCol(
								keyNode.offset + keyNode.length,
								doc.lineOffsets,
							);
							if (start && end) {
								return {
									start: { line: start.line - 1, character: start.col - 1 },
									end: { line: end.line - 1, character: end.col - 1 },
								};
							}
						}
					}
				}
			}
		}
		return null;
	}

	/**
	 * Get the range of the first key under a JSON pointer path.
	 * Used for error highlighting when a required field is missing.
	 *
	 * @param doc - The cached document
	 * @param path - JSON pointer path segments
	 * @returns LSP Range for the first key, or null if not found
	 */
	getFirstKeyRange(
		doc: CachedDocument,
		path: (string | number)[],
	): Range | null {
		if (doc.format === "yaml" && doc.ast instanceof yaml.Document) {
			const node =
				path.length === 0 ? doc.ast.contents : doc.ast.getIn(path, true);
			if (node && yaml.isMap(node) && node.items.length > 0) {
				const firstPair = node.items[0];
				if (yaml.isScalar(firstPair.key)) {
					const keyRange = firstPair.key.range;
					if (keyRange && Array.isArray(keyRange)) {
						const start = getLineCol(keyRange[0], doc.lineOffsets);
						const end = getLineCol(keyRange[1], doc.lineOffsets);
						if (start && end) {
							return {
								start: { line: start.line - 1, character: start.col - 1 },
								end: { line: end.line - 1, character: end.col - 1 },
							};
						}
					}
				}
			}
		} else if (doc.format === "json") {
			const tree = doc.ast as jsonc.Node;
			const node =
				path.length === 0 ? tree : jsonc.findNodeAtLocation(tree, path);
			if (
				node &&
				node.type === "object" &&
				node.children &&
				node.children.length > 0
			) {
				const firstProp = node.children[0];
				if (
					firstProp.type === "property" &&
					firstProp.children &&
					firstProp.children[0]
				) {
					const keyNode = firstProp.children[0];
					const start = getLineCol(keyNode.offset, doc.lineOffsets);
					const end = getLineCol(
						keyNode.offset + keyNode.length,
						doc.lineOffsets,
					);
					if (start && end) {
						return {
							start: { line: start.line - 1, character: start.col - 1 },
							end: { line: end.line - 1, character: end.col - 1 },
						};
					}
				}
			}
		}
		return null;
	}
}
