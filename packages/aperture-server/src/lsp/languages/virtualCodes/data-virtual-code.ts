/**
 * DataVirtualCode - Base VirtualCode for JSON and YAML documents.
 *
 * This is the base class for all data documents (JSON/YAML). It provides:
 * - AST parsing (yaml.Document or jsonc.Node)
 * - Parsed object representation
 * - Line offset tracking for position conversion
 * - Range lookup utilities
 * - Incremental update support via update() method
 *
 * For OpenAPI documents, use OpenAPIVirtualCode which extends this class
 * with IR, atoms, and OpenAPI-specific functionality.
 *
 * @module lsp/languages/virtualCodes/data-virtual-code
 */

import type { CodeMapping, VirtualCode } from "@volar/language-core";
import * as jsonc from "jsonc-parser";
import type { IScriptSnapshot, TextChangeRange } from "typescript";
import type { Range } from "vscode-languageserver-protocol";
import * as yaml from "yaml";
import {
	buildLineOffsets,
	getLineCol,
	patchLineOffsets,
} from "../../../engine/utils/line-offset-utils.js";

/**
 * Options for creating a DataVirtualCode instance.
 */
export interface DataVirtualCodeOptions {
	/**
	 * Optional format override. If not provided, derived from languageId.
	 * Use this when languageId doesn't directly indicate the format.
	 */
	format?: "yaml" | "json";
	/**
	 * Optional schema key for schema registry lookup.
	 * Services use this to resolve the appropriate JSON schema for validation/completion.
	 * Examples: "openapi-root", "openapi-schema", "telescope-config"
	 */
	schemaKey?: string;
	/**
	 * Optional custom ID for this virtual code.
	 * Defaults to "root" for the main document.
	 */
	id?: string;
}

/**
 * Base VirtualCode for JSON and YAML documents.
 *
 * @example
 * ```typescript
 * // For generic YAML/JSON files
 * const vc = new DataVirtualCode(snapshot, "yaml");
 *
 * // For custom languageIds with explicit format and schema
 * const vc = new DataVirtualCode(snapshot, "yaml", {
 *   format: "yaml",
 *   schemaKey: "openapi-root"
 * });
 * ```
 */
export class DataVirtualCode implements VirtualCode {
	id = "root";
	embeddedCodes: VirtualCode[] = [];
	mappings: CodeMapping[] = [];

	/**
	 * The parsed AST (yaml.Document for YAML, jsonc.Node for JSON).
	 * Access via the `ast` getter to ensure lazy re-parsing when dirty.
	 */
	protected _ast: jsonc.Node | yaml.Document;

	/**
	 * Cached parsed JavaScript object representation.
	 * Invalidated when AST is marked dirty.
	 */
	protected _parsedObject: unknown;

	/**
	 * Whether the AST needs to be re-parsed before access.
	 */
	protected _astDirty = false;

	/**
	 * The document format ("yaml" or "json")
	 */
	readonly format: "yaml" | "json";

	/**
	 * Schema key for schema registry lookup.
	 * Services use this to resolve the appropriate JSON schema.
	 * Can be updated after construction (e.g., when document type is detected).
	 */
	private _schemaKey?: string;

	/**
	 * Get the schema key for schema registry lookup.
	 */
	get schemaKey(): string | undefined {
		return this._schemaKey;
	}

	/**
	 * Set the schema key for schema registry lookup.
	 * Used when document type is detected after initial parsing.
	 */
	set schemaKey(value: string | undefined) {
		this._schemaKey = value;
	}

	/**
	 * Line offsets for efficient offset-to-position conversion.
	 * Protected so subclasses can access for locToRange().
	 */
	protected _lineOffsets: number[];

	/**
	 * Create a new DataVirtualCode.
	 *
	 * @param snapshot - The document snapshot
	 * @param languageId - The languageId (e.g., "yaml", "json")
	 * @param options - Optional configuration (format, schemaKey, id)
	 */
	constructor(
		public snapshot: IScriptSnapshot,
		public languageId: string,
		options?: DataVirtualCodeOptions,
	) {
		const text = snapshot.getText(0, snapshot.getLength());

		// Apply options
		if (options?.id) {
			this.id = options.id;
		}
		this._schemaKey = options?.schemaKey;

		// Build line offsets for position conversion
		this._lineOffsets = buildLineOffsets(text);

		// Use provided format, or derive from languageId
		this.format = options?.format ?? (languageId === "json" ? "json" : "yaml");

		// Parse based on format
		if (this.format === "yaml") {
			this._ast = yaml.parseDocument(text, { keepSourceTokens: true });
			this._parsedObject = this._ast.toJSON();
		} else {
			const ast = jsonc.parseTree(text);
			if (!ast) {
				console.warn(
					`Failed to parse JSON content for languageId "${this.languageId}". Using empty object fallback.`,
				);
				this._ast = jsonc.parseTree("{}") as jsonc.Node;
				this._parsedObject = {};
			} else {
				this._ast = ast;
				this._parsedObject = jsonc.getNodeValue(this._ast);
			}
		}

		this.mappings = [
			{
				sourceOffsets: [0],
				generatedOffsets: [0],
				lengths: [snapshot.getLength()],
				data: {
					verification: true,
					completion: true,
					semantic: true,
					navigation: true,
					structure: true,
					format: true,
				},
			},
		];
	}

	// =========================================================================
	// Getters for AST and parsed data (with lazy re-parsing support)
	// =========================================================================

	/**
	 * Get the parsed AST. Re-parses if marked dirty.
	 */
	get ast(): jsonc.Node | yaml.Document {
		if (this._astDirty) {
			this.reparseAst();
		}
		return this._ast;
	}

	/**
	 * Get the parsed JavaScript object representation. Re-parses AST if dirty.
	 */
	get parsedObject(): unknown {
		if (this._astDirty) {
			this.reparseAst();
		}
		return this._parsedObject;
	}

	/**
	 * Get line offsets for position conversion.
	 */
	protected get lineOffsets(): number[] {
		return this._lineOffsets;
	}

	// =========================================================================
	// Incremental Update Support
	// =========================================================================

	/**
	 * Update this VirtualCode incrementally based on a new snapshot.
	 * Uses the change range to patch line offsets and shift mappings
	 * without full re-parsing.
	 *
	 * @param newSnapshot - The new document snapshot
	 * @returns true if incremental update succeeded, false if full recreation needed
	 */
	update(newSnapshot: IScriptSnapshot): boolean {
		// IScriptSnapshot.getChangeRange is called on the new snapshot with the old snapshot as argument
		const changeRange = newSnapshot.getChangeRange?.(this.snapshot);
		if (!changeRange) {
			return false;
		}

		const { span, newLength } = changeRange;
		const delta = newLength - span.length;

		// 1. Update snapshot reference
		this.snapshot = newSnapshot;

		// 2. Patch line offsets incrementally
		const newText = newSnapshot.getText(span.start, span.start + newLength);
		patchLineOffsets(this._lineOffsets, span.start, span.length, newText);

		// 3. Mark AST as dirty for lazy re-parse
		this.markAstDirty();

		// 4. Shift mappings after the change point
		this.shiftMappings(span.start, delta);

		// 5. Update the main mapping length
		if (this.mappings[0]) {
			this.mappings[0].lengths[0] = newSnapshot.getLength();
		}

		return true;
	}

	/**
	 * Mark the AST as dirty, requiring re-parse on next access.
	 * Subclasses can override to invalidate additional cached data.
	 */
	markAstDirty(): void {
		this._astDirty = true;
		this._parsedObject = undefined;
	}

	/**
	 * Re-parse the AST from the current snapshot.
	 */
	protected reparseAst(): void {
		const text = this.snapshot.getText(0, this.snapshot.getLength());

		if (this.format === "yaml") {
			this._ast = yaml.parseDocument(text, { keepSourceTokens: true });
			this._parsedObject = this._ast.toJSON();
		} else {
			const ast = jsonc.parseTree(text);
			if (ast) {
				this._ast = ast;
				this._parsedObject = jsonc.getNodeValue(this._ast);
			} else {
				console.warn(
					`Failed to re-parse JSON content for languageId "${this.languageId}". Keeping previous AST.`,
				);
			}
			// If parsing fails, keep the old AST (better than crashing)
		}

		this._astDirty = false;
	}

	/**
	 * Shift all mapping offsets after a change point by the given delta.
	 *
	 * @param changeStart - The byte offset where the change started
	 * @param delta - The difference in length (newLength - oldLength)
	 */
	protected shiftMappings(changeStart: number, delta: number): void {
		if (delta === 0) return;

		for (const mapping of this.mappings) {
			for (let i = 0; i < mapping.sourceOffsets.length; i++) {
				const offset = mapping.sourceOffsets[i];
				if (offset !== undefined && offset > changeStart) {
					mapping.sourceOffsets[i] = offset + delta;
				}
			}
		}
	}

	/**
	 * Get the change range from the last update, if available.
	 * Used by subclasses to update embedded codes.
	 */
	getChangeRange(newSnapshot: IScriptSnapshot): TextChangeRange | undefined {
		return newSnapshot.getChangeRange?.(this.snapshot);
	}

	/**
	 * Get the raw text content of the document.
	 */
	getRawText(): string {
		return this.snapshot.getText(0, this.snapshot.getLength());
	}

	/**
	 * Get byte offsets for a specific JSON Pointer path.
	 * Used internally by getRange().
	 */
	private getByteRange(
		path: (string | number)[],
	): { start: number; end: number } | undefined {
		const ast = this.ast; // Use getter to ensure re-parse if dirty
		if (this.format === "yaml" && ast instanceof yaml.Document) {
			// YAML Implementation
			// YAML node.range is [start, valueEnd, nodeEnd] - a 3-element array
			const node = ast.getIn(path, true);
			if (
				node &&
				typeof node === "object" &&
				"range" in node &&
				Array.isArray(node.range) &&
				node.range.length >= 2
			) {
				return { start: node.range[0], end: node.range[1] };
			}
		} else if (this.format === "json" && ast) {
			// JSONC Implementation
			// jsonc-parser's findNodeAtLocation returns a Node with offset and length
			const node = jsonc.findNodeAtLocation(ast as jsonc.Node, path);
			if (node) {
				return {
					start: node.offset,
					end: node.offset + node.length,
				};
			}
		}
		return undefined;
	}

	/**
	 * Get the LSP Range (line/character positions) for a specific JSON Pointer path.
	 *
	 * @param path - Array path to the node (e.g., ['info', 'title'])
	 * @returns LSP Range, or undefined if path not found
	 *
	 * @example
	 * ```typescript
	 * const range = vc.getRange(['info', 'title']);
	 * // { start: { line: 2, character: 4 }, end: { line: 2, character: 14 } }
	 * ```
	 */
	getRange(path: (string | number)[]): Range | undefined {
		const offsets = this.getByteRange(path);
		if (!offsets) return undefined;

		// Convert byte offsets to line/character positions (getLineCol returns 1-indexed)
		const start = getLineCol(offsets.start, this.lineOffsets);
		const end = getLineCol(offsets.end, this.lineOffsets);

		return {
			start: { line: start.line - 1, character: start.col - 1 },
			end: { line: end.line - 1, character: end.col - 1 },
		};
	}

	/**
	 * Get the range of just the first key in an object at the given path.
	 * This is useful for pointing to an object when a required field is missing,
	 * without highlighting the entire object content.
	 *
	 * @param path - Array path to the object
	 * @returns LSP Range of the first key, or undefined if not found
	 */
	getFirstKeyRange(path: (string | number)[]): Range | undefined {
		const ast = this.ast; // Use getter to ensure re-parse if dirty
		const lineOffsets = this._lineOffsets;

		if (this.format === "yaml" && ast instanceof yaml.Document) {
			const node = ast.getIn(path, true);
			if (node && yaml.isMap(node) && node.items.length > 0) {
				const firstPair = node.items[0];
				const key = firstPair?.key;
				if (key && typeof key === "object" && "range" in key) {
					const keyRange = (key as yaml.Scalar).range;
					if (keyRange && keyRange.length >= 2) {
						const start = getLineCol(keyRange[0], lineOffsets);
						const end = getLineCol(keyRange[1], lineOffsets);
						return {
							start: { line: start.line - 1, character: start.col - 1 },
							end: { line: end.line - 1, character: end.col - 1 },
						};
					}
				}
			}
		} else if (this.format === "json" && ast) {
			const node = jsonc.findNodeAtLocation(ast as jsonc.Node, path);
			if (
				node?.type === "object" &&
				node.children &&
				node.children.length > 0
			) {
				const firstProperty = node.children[0];
				const keyNode = firstProperty?.children?.[0];
				if (keyNode) {
					const start = getLineCol(keyNode.offset, lineOffsets);
					const end = getLineCol(keyNode.offset + keyNode.length, lineOffsets);
					return {
						start: { line: start.line - 1, character: start.col - 1 },
						end: { line: end.line - 1, character: end.col - 1 },
					};
				}
			}
		}
		return undefined;
	}
}
