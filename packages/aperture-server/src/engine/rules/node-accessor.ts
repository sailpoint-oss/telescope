/**
 * Node Accessor Module
 *
 * Provides typed accessors for visitor node values, eliminating the need
 * for manual type casting in rules.
 *
 * ## When to Use NodeAccessor vs Enriched Ref Methods
 *
 * **Prefer Enriched Ref Methods (recommended for most cases):**
 *
 * All standard visitor refs (Operation, Schema, Parameter, Response, etc.)
 * now come with built-in typed accessor methods that provide:
 * - Full type safety with specific return types
 * - Caching for performance
 * - IDE autocomplete for available fields
 *
 * ```typescript
 * // PREFERRED: Use enriched ref methods
 * Operation(op) {
 *   const summary = op.summary();          // Typed, cached
 *   const tags = op.tags();                // string[]
 *   op.eachParameter((param, ref) => {     // Iteration with refs
 *     if (ref.isQuery()) { ... }
 *   });
 * }
 * ```
 *
 * **Use NodeAccessor for:**
 *
 * 1. **Extension fields (x-*)**: Custom vendor extensions not covered by enrichment
 * 2. **Deeply nested access**: Fields within untyped nested objects
 * 3. **Generic rules**: Rules that work across different node types
 * 4. **Fallback**: When enriched methods don't exist for your use case
 *
 * ```typescript
 * // USE NodeAccessor for extension fields
 * Operation(op) {
 *   const $ = accessor(op.node);
 *   const customField = $.getString("x-custom-field");
 *   const nested = $.getObject("x-vendor")?.["nested"];
 * }
 * ```
 *
 * @module rules/node-accessor
 *
 * @see {@link ../indexes/ref-enrichment} - Enriched ref accessor methods
 *
 * @example Basic usage with enriched refs (preferred)
 * ```typescript
 * // For standard OpenAPI fields, use the ref methods directly
 * Operation(op) {
 *   const summary = op.summary();     // Already typed, no accessor needed
 *   const opId = op.operationId();
 *   if (op.deprecated()) { ... }
 * }
 * ```
 *
 * @example NodeAccessor for extension fields
 * ```typescript
 * // For x-* extensions, use NodeAccessor
 * Operation(op) {
 *   const $ = accessor(op.node);
 *   const xInternal = $.getBoolean("x-internal");
 *   const xAudience = $.getString("x-audience");
 * }
 * ```
 */

/**
 * Error thrown when a required field is missing.
 */
export class FieldMissingError extends Error {
	constructor(field: string) {
		super(`Required field "${field}" is missing`);
		this.name = "FieldMissingError";
	}
}

/**
 * Typed accessor for visitor node values.
 *
 * Wraps the raw node and provides type-safe getters for common types.
 * Use for accessing extension fields (x-*) or when enriched ref methods
 * are not available.
 *
 * **Note:** For standard OpenAPI fields, prefer the enriched ref methods:
 * - `op.summary()` instead of `accessor(op.node).getString("summary")`
 * - `schema.type()` instead of `accessor(schema.node).getString("type")`
 *
 * @example Extension field access
 * ```typescript
 * const $ = new NodeAccessor(op.node);
 * const xInternal = $.getBoolean("x-internal");
 * const xTags = $.getArray<string>("x-custom-tags");
 * ```
 *
 * @see {@link accessor} - Factory function to create NodeAccessor instances
 */
export class NodeAccessor {
	private obj: Record<string, unknown>;

	constructor(node: unknown) {
		this.obj =
			node && typeof node === "object" && !Array.isArray(node)
				? (node as Record<string, unknown>)
				: {};
	}

	/**
	 * Get string field, returns undefined if missing or wrong type.
	 */
	getString(field: string): string | undefined {
		const val = this.obj[field];
		return typeof val === "string" ? val : undefined;
	}

	/**
	 * Get string field, throws FieldMissingError if missing or wrong type.
	 */
	requireString(field: string): string {
		const val = this.getString(field);
		if (val === undefined) {
			throw new FieldMissingError(field);
		}
		return val;
	}

	/**
	 * Get number field, returns undefined if missing or wrong type.
	 */
	getNumber(field: string): number | undefined {
		const val = this.obj[field];
		return typeof val === "number" ? val : undefined;
	}

	/**
	 * Get number field, throws FieldMissingError if missing or wrong type.
	 */
	requireNumber(field: string): number {
		const val = this.getNumber(field);
		if (val === undefined) {
			throw new FieldMissingError(field);
		}
		return val;
	}

	/**
	 * Get boolean field, returns undefined if missing or wrong type.
	 */
	getBoolean(field: string): boolean | undefined {
		const val = this.obj[field];
		return typeof val === "boolean" ? val : undefined;
	}

	/**
	 * Get boolean field, throws FieldMissingError if missing or wrong type.
	 */
	requireBoolean(field: string): boolean {
		const val = this.getBoolean(field);
		if (val === undefined) {
			throw new FieldMissingError(field);
		}
		return val;
	}

	/**
	 * Get array field, returns undefined if missing or not an array.
	 */
	getArray<T = unknown>(field: string): T[] | undefined {
		const val = this.obj[field];
		return Array.isArray(val) ? (val as T[]) : undefined;
	}

	/**
	 * Get array field, throws FieldMissingError if missing or not an array.
	 */
	requireArray<T = unknown>(field: string): T[] {
		const val = this.getArray<T>(field);
		if (val === undefined) {
			throw new FieldMissingError(field);
		}
		return val;
	}

	/**
	 * Get object field, returns undefined if missing or not an object.
	 */
	getObject(field: string): Record<string, unknown> | undefined {
		const val = this.obj[field];
		if (val && typeof val === "object" && !Array.isArray(val)) {
			return val as Record<string, unknown>;
		}
		return undefined;
	}

	/**
	 * Get object field, throws FieldMissingError if missing or not an object.
	 */
	requireObject(field: string): Record<string, unknown> {
		const val = this.getObject(field);
		if (val === undefined) {
			throw new FieldMissingError(field);
		}
		return val;
	}

	/**
	 * Check if field exists (even if null or undefined value).
	 */
	has(field: string): boolean {
		return field in this.obj;
	}

	/**
	 * Get raw value without type checking.
	 */
	get<T = unknown>(field: string): T | undefined {
		return this.obj[field] as T | undefined;
	}

	/**
	 * Get the raw node object.
	 */
	raw(): Record<string, unknown> {
		return this.obj;
	}
}

/**
 * Create a NodeAccessor for a node.
 *
 * **Note:** For standard OpenAPI fields on Operation, Schema, Parameter, Response,
 * and other enriched refs, prefer using the built-in typed accessor methods
 * (e.g., `op.summary()` instead of `accessor(op.node).getString("summary")`).
 *
 * Use NodeAccessor primarily for:
 * - Custom extension fields (x-*)
 * - Deeply nested untyped objects
 * - Generic rules that work across node types
 *
 * @param node - The raw node from a visitor
 * @returns A NodeAccessor instance
 *
 * @example Extension field access (good use case)
 * ```typescript
 * Operation(op) {
 *   const $ = accessor(op.node);
 *   const xInternal = $.getBoolean("x-internal");
 *   const xCategory = $.getString("x-category");
 * }
 * ```
 *
 * @example Standard fields (prefer enriched methods instead)
 * ```typescript
 * // Instead of this:
 * Operation(op) {
 *   const $ = accessor(op.node);
 *   const summary = $.getString("summary");
 * }
 *
 * // Use this:
 * Operation(op) {
 *   const summary = op.summary();  // Typed, cached, better DX
 * }
 * ```
 *
 * @see {@link ../indexes/ref-enrichment} - Enriched ref accessor methods
 */
export function accessor(node: unknown): NodeAccessor {
	return new NodeAccessor(node);
}

/**
 * Type for refs that have been extended with an accessor.
 */
export type WithAccessor<T extends { node: unknown }> = T & {
	$: NodeAccessor;
};

/**
 * Extend a ref with a typed accessor.
 * Creates a new object with a `$` property for typed access.
 *
 * @param ref - A visitor ref (e.g., OperationRef, SchemaRef)
 * @returns The ref extended with a `$` NodeAccessor
 *
 * @example
 * ```typescript
 * Operation(op) {
 *   const extended = withAccessor(op);
 *   const summary = extended.$.getString("summary");
 * }
 * ```
 */
export function withAccessor<T extends { node: unknown }>(
	ref: T,
): WithAccessor<T> {
	return { ...ref, $: new NodeAccessor(ref.node) };
}

