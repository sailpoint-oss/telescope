/**
 * OpenAPIVirtualCode - VirtualCode for OpenAPI documents.
 *
 * Uses composition (not inheritance) to provide OpenAPI-specific functionality:
 * - IR (Intermediate Representation) with lazy loading
 * - Atoms extraction (operations, components, etc.)
 * - ParsedDocument generation for rule execution
 * - Support for "openapi-yaml" and "openapi-json" languageIds
 *
 * This follows Volar.js best practices where the root VirtualCode delegates to
 * embedded codes for format-specific features.
 *
 * @module lsp/languages/virtualCodes/openapi-virtual-code
 */

import type { CodeMapping, VirtualCode } from "@volar/language-core";
import type { Node as JsonNode } from "jsonc-parser";
import type { IScriptSnapshot } from "typescript";
import type { Range } from "vscode-languageserver-protocol";
import type YAML from "yaml";
import type {
	AtomIndex,
	DocumentType,
	IRDocument,
	Loc,
} from "../../../engine/index.js";
import {
	buildIRFromJson,
	buildIRFromYaml,
	extractAtoms,
	identifyDocumentType,
} from "../../../engine/index.js";
import type { RootResolver } from "../../../engine/indexes/types.js";
import { findNodeByPointer } from "../../../engine/ir/context.js";
import type { ParsedDocument, SourceMap } from "../../../engine/types.js";
import { computeDocumentHash } from "../../../engine/utils/hash-utils.js";
import { getLineCol } from "../../../engine/utils/line-offset-utils.js";
import {
	resolveDocumentVersion,
	type ResolvedVersion,
	type VersionSource,
} from "../../../engine/utils/version-resolution.js";
import { DataVirtualCode } from "./data-virtual-code.js";
import { MarkdownVirtualCode } from "./markdown-virtual-code.js";

/**
 * Supported languageIds for OpenAPI documents.
 * Only "openapi-yaml" and "openapi-json" are now supported since the client
 * classifies documents on open.
 */
export type OpenAPILanguageId = "openapi-yaml" | "openapi-json";

/**
 * Check if a languageId is valid for OpenAPI documents.
 */
export function isOpenAPILanguageId(id: string): id is OpenAPILanguageId {
	return id === "openapi-yaml" || id === "openapi-json";
}

/**
 * Convert a DocumentType and version to a schema key for schema registry lookup.
 * @param docType - The OpenAPI document type
 * @param version - The OpenAPI version (e.g., "3.0", "3.1", "3.2")
 * @returns Schema key string (e.g., "openapi-3.1-root", "openapi-3.0-schema")
 */
export function documentTypeToSchemaKey(
	docType: DocumentType,
	version: string,
): string {
	// Normalize version to supported major.minor format
	const normalizedVersion = normalizeVersion(version);
	return `openapi-${normalizedVersion}-${docType}`;
}

/**
 * Normalize an OpenAPI version string to major.minor format.
 * Falls back to "3.1" for unknown versions.
 *
 * @param version - Full version string (e.g., "3.1.0", "3.2", "unknown")
 * @returns Normalized version (e.g., "3.0", "3.1", "3.2")
 */
function normalizeVersion(version: string): string {
	// Match major.minor from version string
	const match = version.match(/^(\d+\.\d+)/);
	if (match) {
		const majorMinor = match[1];
		// Ensure we support this version
		if (majorMinor === "3.0" || majorMinor === "3.1" || majorMinor === "3.2") {
			return majorMinor;
		}
	}
	// Default to 3.1 for unknown versions (most common, good middle ground)
	return "3.1";
}

/**
 * Detect format (yaml/json) from languageId.
 */
function detectFormat(languageId: OpenAPILanguageId): "yaml" | "json" {
	return languageId === "openapi-json" ? "json" : "yaml";
}

/**
 * VirtualCode for OpenAPI documents using composition pattern.
 *
 * This class implements VirtualCode directly and uses a DataVirtualCode
 * instance internally for format-specific features. This follows Volar.js
 * best practices where the root VirtualCode has embedded codes for different
 * concerns.
 *
 * Architecture:
 * - OpenAPIVirtualCode (root): handles OpenAPI-specific logic (IR, atoms)
 * - embeddedCodes[0] (formatVirtualCode): DataVirtualCode for yaml/json services
 * - embeddedCodes[1+] (markdownCodes): MarkdownVirtualCode for descriptions
 *
 * @example
 * ```typescript
 * const vc = new OpenAPIVirtualCode(snapshot, "openapi-yaml");
 * const ir = vc.getIR("file:///api.yaml"); // Lazy-built on first access
 * const atoms = vc.getAtoms("file:///api.yaml");
 * const doc = vc.toParsedDocument("file:///api.yaml");
 * // vc.embeddedCodes[0] is a DataVirtualCode with languageId "yaml" and schemaKey "openapi-root"
 * ```
 */
export class OpenAPIVirtualCode implements VirtualCode {
	// =========================================================================
	// VirtualCode interface implementation
	// =========================================================================

	/**
	 * VirtualCode identifier - "root" for the main document
	 */
	readonly id = "root";

	/**
	 * The languageId for this VirtualCode
	 */
	readonly languageId: OpenAPILanguageId;

	/**
	 * Current document snapshot
	 */
	snapshot: IScriptSnapshot;

	/**
	 * Code mappings for source-to-generated position conversion
	 */
	mappings: CodeMapping[];

	/**
	 * Embedded VirtualCodes for format-specific features
	 */
	embeddedCodes: VirtualCode[] = [];

	// =========================================================================
	// Internal DataVirtualCode for format handling (composition)
	// =========================================================================

	/**
	 * The internal DataVirtualCode for format-specific features.
	 * This handles AST parsing, line offsets, and range calculations.
	 * Also exposed as embeddedCodes[0] for yaml/json language services.
	 */
	private readonly dataCode: DataVirtualCode;

	// =========================================================================
	// OpenAPI-specific properties
	// =========================================================================

	/**
	 * Detected OpenAPI document type (root, path-item, schema, etc.)
	 */
	readonly openApiDocumentType: DocumentType;

	/**
	 * OpenAPI specification version (3.0, 3.1, 3.2, or unknown).
	 * This may be updated when reference tracing becomes available.
	 */
	openapiVersion: string;

	/**
	 * How the version was determined.
	 * - `explicit`: From the document's `openapi` field
	 * - `reference`: Inherited from a root document via $ref tracing
	 * - `heuristic`: Detected from content analysis
	 * - `default`: Fallback when no other method succeeds
	 */
	versionSource: VersionSource;

	/**
	 * Warning message when version detection methods disagree.
	 * Set when heuristic and reference-based versions conflict.
	 */
	versionWarning?: string;

	/**
	 * The document format (yaml or json)
	 */
	readonly format: "yaml" | "json";

	/**
	 * The embedded DataVirtualCode for format-specific language services.
	 * This provides yaml-service or json-service with schema-aware features.
	 * (Alias for dataCode, exposed for backwards compatibility)
	 */
	get formatVirtualCode(): DataVirtualCode {
		return this.dataCode;
	}

	// Lazy-loaded IR data
	private _ir?: IRDocument;
	private _atoms?: AtomIndex;
	private _hash?: string;
	private _mtimeMs?: number;

	/**
	 * Whether markdown codes need to be regenerated from AST.
	 * Set to true when a change affects markdown codes that couldn't be updated in place.
	 */
	private _markdownCodesDirty = false;

	/**
	 * Create a new OpenAPIVirtualCode.
	 *
	 * @param snapshot - The document snapshot
	 * @param languageId - The languageId ("openapi-yaml" or "openapi-json")
	 */
	constructor(snapshot: IScriptSnapshot, languageId: OpenAPILanguageId) {
		this.snapshot = snapshot;
		this.languageId = languageId;
		this.format = detectFormat(languageId);

		// Create the internal DataVirtualCode for format handling
		// Initially created without schemaKey - it will be set after document type detection
		const baseLanguageId = this.format; // "yaml" or "json"

		this.dataCode = new DataVirtualCode(snapshot, baseLanguageId, {
			format: this.format,
			id: "format",
		});

		// Detect document type and version from parsed content
		this.openApiDocumentType = identifyDocumentType(this.dataCode.parsedObject);

		// Resolve version using explicit or heuristic detection
		// (rootResolver isn't available at construction time)
		const versionResult = resolveDocumentVersion(
			this.dataCode.parsedObject,
			"", // URI not known yet
			undefined, // No rootResolver at construction time
		);
		this.openapiVersion = versionResult.version;
		this.versionSource = versionResult.source;
		this.versionWarning = versionResult.warning;

		// Set the schema key based on detected document type and version
		this.dataCode.schemaKey = documentTypeToSchemaKey(
			this.openApiDocumentType,
			this.openapiVersion,
		);

		// Add the format virtual code as an embedded code
		this.embeddedCodes.push(this.dataCode);

		// Set up mappings for the root VirtualCode
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
	// Delegated getters (from internal DataVirtualCode)
	// =========================================================================

	/**
	 * Get the parsed AST (yaml.Document or jsonc.Node)
	 */
	get ast(): JsonNode | YAML.Document {
		return this.dataCode.ast;
	}

	/**
	 * Get the parsed JavaScript object representation
	 */
	get parsedObject(): unknown {
		return this.dataCode.parsedObject;
	}

	/**
	 * Get line offsets for position calculations
	 */
	protected get lineOffsets(): number[] {
		return this.dataCode["_lineOffsets"];
	}

	/**
	 * Get the raw text content of the document.
	 */
	getRawText(): string {
		return this.dataCode.getRawText();
	}

	/**
	 * Get the LSP Range for a specific JSON Pointer path.
	 */
	getRange(path: (string | number)[]): Range | undefined {
		return this.dataCode.getRange(path);
	}

	/**
	 * Get the range of just the first key in an object at the given path.
	 */
	getFirstKeyRange(path: (string | number)[]): Range | undefined {
		return this.dataCode.getFirstKeyRange(path);
	}

	// =========================================================================
	// Incremental Update Support
	// =========================================================================

	/**
	 * Update this VirtualCode incrementally based on a new snapshot.
	 * Delegates to the internal DataVirtualCode and updates embedded codes.
	 *
	 * @param newSnapshot - The new document snapshot
	 * @returns true if incremental update succeeded, false if full recreation needed
	 */
	update(newSnapshot: IScriptSnapshot): boolean {
		// Get change range before updating
		const changeRange = newSnapshot.getChangeRange?.(this.snapshot);
		if (!changeRange) {
			return false;
		}

		// Update our snapshot reference
		this.snapshot = newSnapshot;

		// Delegate to internal DataVirtualCode for format handling
		if (!this.dataCode.update(newSnapshot)) {
			return false;
		}

		// Invalidate lazy-loaded OpenAPI data (will be rebuilt on demand)
		this._ir = undefined;
		this._atoms = undefined;
		this._hash = undefined;

		// Re-detect version after AST update (the openapi field may have changed)
		// This uses heuristic detection since rootResolver isn't available here
		const newVersionResult = resolveDocumentVersion(
			this.dataCode.parsedObject,
			"", // URI not available in update context
			undefined, // No rootResolver in update context
		);

		// If version changed, update schema key for language services
		if (newVersionResult.version !== this.openapiVersion) {
			this.openapiVersion = newVersionResult.version;
			this.versionSource = newVersionResult.source;
			this.versionWarning = newVersionResult.warning;

			// Update schema key so language services use the correct version-specific schema
			this.dataCode.schemaKey = documentTypeToSchemaKey(
				this.openApiDocumentType,
				this.openapiVersion,
			);
		}

		// Update markdown embedded codes
		this.updateMarkdownCodes(changeRange, newSnapshot);

		// Update our own mappings
		if (this.mappings[0]) {
			this.mappings[0].lengths[0] = newSnapshot.getLength();
		}

		return true;
	}

	/**
	 * Mark the AST as dirty, requiring re-parse on next access.
	 */
	markAstDirty(): void {
		this.dataCode.markAstDirty();
		this._ir = undefined;
		this._atoms = undefined;
	}

	/**
	 * Update markdown VirtualCodes based on the change.
	 */
	private updateMarkdownCodes(
		changeRange: { span: { start: number; length: number }; newLength: number },
		newSnapshot: IScriptSnapshot,
	): void {
		const { span, newLength } = changeRange;
		const changeStart = span.start;
		const changeEnd = span.start + span.length;
		const delta = newLength - span.length;
		const newSourceText = newSnapshot.getText(0, newSnapshot.getLength());

		for (const code of this.embeddedCodes) {
			if (code.id === "format") continue; // Skip format code

			if (code instanceof MarkdownVirtualCode) {
				const sourceRange = code.getSourceRange();
				if (sourceRange) {
					// If change is completely outside this code's range, just shift if needed
					if (changeEnd <= sourceRange.start) {
						// Change is before this code - shift all segments
						for (const segment of code.segments) {
							segment.start += delta;
						}
						// Update mappings
						for (const mapping of code.mappings) {
							if (mapping.sourceOffsets[0] !== undefined) {
								mapping.sourceOffsets[0] += delta;
							}
						}
						continue;
					}

					if (changeStart >= sourceRange.end) {
						// Change is after this code - no update needed
						continue;
					}
				}

				// Try to update in place
				const success = code.update(changeStart, changeEnd, delta, newSourceText);
				if (!success) {
					this._markdownCodesDirty = true;
				}
			}
		}
	}

	/**
	 * Check if markdown codes need to be regenerated.
	 */
	get markdownCodesDirty(): boolean {
		return this._markdownCodesDirty;
	}

	/**
	 * Clear the markdown codes dirty flag (call after regeneration).
	 */
	clearMarkdownCodesDirty(): void {
		this._markdownCodesDirty = false;
	}

	// =========================================================================
	// IR and Atoms Access
	// =========================================================================

	/**
	 * Get the IR (Intermediate Representation) for this document.
	 * The IR is lazy-built on first access.
	 *
	 * @param uri - Document URI (required for IR building)
	 * @returns The IR document
	 */
	getIR(uri: string): IRDocument {
		if (!this._ir) {
			this._ir = this.buildIR(uri);
		}
		return this._ir;
	}

	/**
	 * Get the extracted atoms (operations, components, etc.).
	 * Atoms are lazy-built on first access.
	 *
	 * @param uri - Document URI (required for IR building)
	 * @returns The atom index
	 */
	getAtoms(uri: string): AtomIndex {
		if (!this._atoms) {
			this._atoms = extractAtoms(this.getIR(uri));
		}
		return this._atoms;
	}

	/**
	 * Get the line offsets array for position calculations.
	 *
	 * @returns Array of byte offsets for each line start
	 */
	getLineOffsets(): number[] {
		return this.lineOffsets;
	}

	/**
	 * Convert an IR Loc (byte offsets) to an LSP Range (line/character).
	 *
	 * @param loc - The IR location with start/end byte offsets
	 * @returns LSP Range, or null if conversion fails
	 */
	locToRange(loc: Loc): Range | null {
		if (!loc) return null;

		const lineOffsets = this.lineOffsets;
		const startPos = getLineCol(loc.start ?? 0, lineOffsets);
		const endPos = getLineCol(loc.end ?? loc.start ?? 0, lineOffsets);

		if (!startPos || !endPos) return null;

		return {
			start: {
				line: Math.max(0, startPos.line - 1),
				character: Math.max(0, startPos.col - 1),
			},
			end: {
				line: Math.max(0, endPos.line - 1),
				character: Math.max(0, endPos.col - 1),
			},
		};
	}

	/**
	 * Build a ParsedDocument for rule execution.
	 *
	 * @param uri - The document URI
	 * @returns A ParsedDocument suitable for the rule engine
	 */
	toParsedDocument(uri: string): ParsedDocument {
		const ir = this.getIR(uri);

		const sourceMap: SourceMap = {
			pointerToRange: (pointer: string) => {
				const node = findNodeByPointer(ir, pointer);
				return node?.loc ? this.locToRange(node.loc) : null;
			},
			rangeToPointer: () => null, // Not needed for rule execution
		};

		return {
			uri,
			format: this.format,
			version: this.openapiVersion,
			versionSource: this.versionSource,
			versionWarning: this.versionWarning,
			ast: this.parsedObject as Record<string, unknown>,
			ir,
			sourceMap,
			rawText: this.getRawText(),
			hash: this._hash ?? "",
			mtimeMs: this._mtimeMs ?? 0,
			// Include cached line offsets to avoid recomputation in runner
			_lineOffsets: this.getLineOffsets(),
		};
	}

	/**
	 * Build the IR from the AST.
	 */
	private buildIR(uri: string): IRDocument {
		const rawText = this.getRawText();
		this._hash = computeDocumentHash(rawText);
		this._mtimeMs = Date.now();

		if (this.format === "yaml") {
			return buildIRFromYaml(
				uri,
				this.ast as YAML.Document.Parsed,
				rawText,
				this._hash,
				this._mtimeMs,
				this.openapiVersion,
			);
		}

		return buildIRFromJson(
			uri,
			this.parsedObject,
			this.ast as JsonNode,
			rawText,
			this._hash,
			this._mtimeMs,
			this.openapiVersion,
		);
	}

	/**
	 * Update the version resolution using reference tracing.
	 *
	 * This method should be called when a rootResolver becomes available
	 * (e.g., after the project context is built). It re-resolves the version
	 * using both heuristic and reference-based methods, and warns if they disagree.
	 *
	 * @param uri - The document URI (used for reference tracing)
	 * @param rootResolver - The RootResolver for tracing $ref relationships
	 * @returns The resolved version result
	 *
	 * @example
	 * ```typescript
	 * // After building project context
	 * const { rootResolver } = buildRefGraph({ docs });
	 * const result = virtualCode.updateVersionWithRootResolver(uri, rootResolver);
	 * if (result.warning) {
	 *   console.warn(`Version warning for ${uri}: ${result.warning}`);
	 * }
	 * ```
	 */
	updateVersionWithRootResolver(
		uri: string,
		rootResolver: RootResolver,
	): ResolvedVersion {
		const versionResult = resolveDocumentVersion(
			this.dataCode.parsedObject,
			uri,
			rootResolver,
		);

		// Update internal state
		this.openapiVersion = versionResult.version;
		this.versionSource = versionResult.source;
		this.versionWarning = versionResult.warning;

		// Update schema key if version changed
		this.dataCode.schemaKey = documentTypeToSchemaKey(
			this.openApiDocumentType,
			this.openapiVersion,
		);

		return versionResult;
	}

	/**
	 * Get the current version resolution result.
	 *
	 * @returns The current version, source, and any warning
	 */
	getVersionResult(): ResolvedVersion {
		return {
			version: this.openapiVersion,
			source: this.versionSource,
			warning: this.versionWarning,
		};
	}
}
