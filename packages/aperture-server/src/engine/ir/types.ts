/**
 * Intermediate Representation (IR) types for unified JSON/YAML handling.
 * The IR provides a format-agnostic view with precise location information.
 */

export type IRNodeKind =
	| "object"
	| "array"
	| "string"
	| "number"
	| "boolean"
	| "null";

/**
 * Location information with byte offsets into the source text.
 * All offsets are 0-based byte positions.
 */
export interface Loc {
	/** Start byte offset of the node */
	start: number;
	/** End byte offset of the node */
	end: number;
	/** Start byte offset of the key (for object properties) */
	keyStart?: number;
	/** End byte offset of the key (for object properties) */
	keyEnd?: number;
	/** Start byte offset of the value */
	valStart?: number;
	/** End byte offset of the value */
	valEnd?: number;
}

/**
 * IR Node representing a normalized view of JSON/YAML content.
 * All nodes have a JSON Pointer for stable identity and location info.
 */
export interface IRNode {
	/** JSON Pointer (escaped ~0/~1) for stable identity */
	ptr: string;
	/** Property key (for child nodes in objects) */
	key?: string;
	/** Node kind */
	kind: IRNodeKind;
	/** Scalar value if leaf node */
	value?: unknown;
	/** Child nodes if object/array */
	children?: IRNode[];
	/** Location information with byte offsets */
	loc: Loc;
	/** Source document URI */
	uri: string;
	/** Alias target pointer (for YAML anchors/aliases) */
	aliasTargetPtr?: string;
}

/**
 * IR Document containing the root node and metadata.
 */
export interface IRDocument {
	/** Root IR node */
	root: IRNode;
	/** Source document URI */
	uri: string;
	/** Document format */
	format: "json" | "yaml";
	/** OpenAPI version detected */
	version: string;
	/** Raw text content */
	rawText: string;
	/** Document hash for change detection */
	hash: string;
	/** Modification time */
	mtimeMs: number;
}
