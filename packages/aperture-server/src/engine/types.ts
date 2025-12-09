/**
 * Core Engine Type Definitions
 *
 * This module defines fundamental types used throughout the Telescope engine
 * for document parsing, source mapping, and location tracking.
 *
 * @module engine/types
 *
 * @see {@link loadDocument} - Function that creates ParsedDocument instances
 * @see {@link IRDocument} - Intermediate Representation for detailed location info
 */

import type { IRDocument } from "./ir/types.js";

/**
 * Supported document formats for parsing.
 *
 * @example
 * ```typescript
 * const format: DocumentFormat = "yaml";
 * ```
 */
export type DocumentFormat = "yaml" | "json";

/**
 * A position in a text document expressed as zero-based line and character offset.
 *
 * This type is compatible with LSP Position but defined locally to avoid
 * external dependencies in core types.
 *
 * @example
 * ```typescript
 * const pos: Position = { line: 10, character: 4 };
 * ```
 */
export interface Position {
	/** Zero-based line number */
	line: number;
	/** Zero-based character offset on the line */
	character: number;
}

/**
 * A range in a text document expressed as start and end positions.
 *
 * This type is compatible with LSP Range but defined locally to avoid
 * external dependencies in core types.
 *
 * @example
 * ```typescript
 * const range: Range = {
 *   start: { line: 10, character: 4 },
 *   end: { line: 10, character: 15 }
 * };
 * ```
 */
export interface Range {
	/** The range's start position (inclusive) */
	start: Position;
	/** The range's end position (exclusive) */
	end: Position;
}

/**
 * Provides bidirectional mapping between JSON pointers and source ranges.
 *
 * The source map is built during document parsing and allows rules to
 * find the source location of any node identified by a JSON pointer,
 * or to find the pointer for a given source range.
 *
 * @see {@link loadDocument} - Function that creates documents with source maps
 * @see {@link IRDocument} - IR provides more precise location through byte offsets
 *
 * @example
 * ```typescript
 * const sourceMap: SourceMap = document.sourceMap;
 * const range = sourceMap.pointerToRange("#/paths/~1users/get");
 * if (range) {
 *   console.log(`Operation found at line ${range.start.line}`);
 * }
 * ```
 */
export interface SourceMap {
	/**
	 * Get the source range for a JSON pointer.
	 *
	 * @param pointer - JSON pointer (e.g., "#/paths/~1users/get")
	 * @returns Range in the source document, or null if not found
	 */
	pointerToRange(pointer: string): Range | null;

	/**
	 * Get the JSON pointer for a source range.
	 *
	 * @param range - Range in the source document
	 * @returns JSON pointer, or null if not determinable
	 */
	rangeToPointer(range: Range): string | null;
}

/**
 * A fully parsed document with AST, IR, and source mapping.
 *
 * ParsedDocument is the primary representation of a loaded OpenAPI document.
 * It contains both a plain JavaScript object representation (AST) and an
 * Intermediate Representation (IR) with detailed location information.
 *
 * @see {@link loadDocument} - Function that creates ParsedDocument instances
 * @see {@link ProjectContext} - Contains a map of ParsedDocuments
 *
 * @example
 * ```typescript
 * const doc: ParsedDocument = await loadDocument({
 *   fileSystem,
 *   uri: "file:///api.yaml"
 * });
 *
 * console.log(`Format: ${doc.format}`);
 * console.log(`Version: ${doc.version}`);
 * console.log(`Hash: ${doc.hash}`);
 *
 * // Access the AST
 * const paths = (doc.ast as Record<string, unknown>).paths;
 *
 * // Get source location for a pointer
 * const range = doc.sourceMap.pointerToRange("#/info/title");
 * ```
 */
export interface ParsedDocument {
	/** Document URI (file:// or other protocol) */
	uri: string;
	/** Document format (yaml or json) */
	format: DocumentFormat;
	/** Detected OpenAPI version (e.g., "3.0", "3.1", "3.2", or "unknown") */
	version: string;
	/** Plain JSON/YAML AST (object representation) */
	ast: Record<string, unknown> | unknown;
	/** Intermediate Representation with precise location info */
	ir: IRDocument;
	/** Source map for pointer-to-range conversion */
	sourceMap: SourceMap;
	/** Raw text content of the document */
	rawText: string;
	/** Content hash for change detection */
	hash: string;
	/** File modification timestamp in milliseconds */
	mtimeMs: number;
	/**
	 * Cached line offsets for efficient offset-to-position conversion.
	 * Lazily initialized on first use.
	 * @internal
	 */
	_lineOffsets?: number[];
}
