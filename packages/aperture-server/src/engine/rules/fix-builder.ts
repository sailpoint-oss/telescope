/**
 * Fix Builder Module
 *
 * Provides fluent API utilities for constructing auto-fix patches.
 * Simplifies the creation of JSON Patch operations for rule fixes.
 *
 * @module rules/fix-builder
 *
 * @example
 * ```typescript
 * import { fix, addFieldFix } from "aperture-server";
 *
 * // Quick fix for adding a missing field
 * ctx.fix(addFieldFix(op, "summary", "TODO: Add summary"));
 *
 * // Fluent API for multiple operations
 * ctx.fix(
 *   fix(op.uri, op.pointer)
 *     .addField("summary", "TODO")
 *     .addField("description", "TODO")
 *     .build()
 * );
 * ```
 */

import type { FilePatch } from "./types.js";

/**
 * Encode a pointer segment according to JSON Pointer spec (RFC 6901).
 * Escapes ~ as ~0 and / as ~1.
 */
function encodePointerSegment(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Build fixes with a fluent API.
 *
 * @example
 * ```typescript
 * const patch = new FixBuilder("file:///api.yaml", "#/paths/~1users/get")
 *   .addField("summary", "List users")
 *   .addField("description", "Returns a list of all users")
 *   .build();
 * ```
 */
export class FixBuilder {
	private ops: FilePatch["ops"] = [];

	/**
	 * Create a new FixBuilder.
	 *
	 * @param uri - Document URI
	 * @param basePointer - Base JSON pointer (defaults to root)
	 */
	constructor(
		private uri: string,
		private basePointer: string = "",
	) {}

	/**
	 * Add a field to the object at basePointer.
	 *
	 * @param field - Field name to add
	 * @param value - Value to set
	 * @returns this for chaining
	 */
	addField(field: string, value: unknown): this {
		this.ops.push({
			op: "add",
			path: `${this.basePointer}/${encodePointerSegment(field)}`,
			value,
		});
		return this;
	}

	/**
	 * Add a field at a nested path.
	 *
	 * @param path - Array of field names forming the path
	 * @param value - Value to set
	 * @returns this for chaining
	 *
	 * @example
	 * ```typescript
	 * builder.addAtPath(["responses", "200", "description"], "Success")
	 * ```
	 */
	addAtPath(path: string[], value: unknown): this {
		const encodedPath = path.map(encodePointerSegment).join("/");
		this.ops.push({
			op: "add",
			path: `${this.basePointer}/${encodedPath}`,
			value,
		});
		return this;
	}

	/**
	 * Replace a field value.
	 *
	 * @param field - Field name to replace
	 * @param value - New value
	 * @returns this for chaining
	 */
	setField(field: string, value: unknown): this {
		this.ops.push({
			op: "replace",
			path: `${this.basePointer}/${encodePointerSegment(field)}`,
			value,
		});
		return this;
	}

	/**
	 * Replace a value at a nested path.
	 *
	 * @param path - Array of field names forming the path
	 * @param value - New value
	 * @returns this for chaining
	 */
	setAtPath(path: string[], value: unknown): this {
		const encodedPath = path.map(encodePointerSegment).join("/");
		this.ops.push({
			op: "replace",
			path: `${this.basePointer}/${encodedPath}`,
			value,
		});
		return this;
	}

	/**
	 * Remove a field.
	 *
	 * @param field - Field name to remove
	 * @returns this for chaining
	 */
	removeField(field: string): this {
		this.ops.push({
			op: "remove",
			path: `${this.basePointer}/${encodePointerSegment(field)}`,
		});
		return this;
	}

	/**
	 * Remove a value at a nested path.
	 *
	 * @param path - Array of field names forming the path
	 * @returns this for chaining
	 */
	removeAtPath(path: string[]): this {
		const encodedPath = path.map(encodePointerSegment).join("/");
		this.ops.push({
			op: "remove",
			path: `${this.basePointer}/${encodedPath}`,
		});
		return this;
	}

	/**
	 * Add a raw operation.
	 *
	 * @param op - The operation to add
	 * @returns this for chaining
	 */
	addOp(op: FilePatch["ops"][number]): this {
		this.ops.push(op);
		return this;
	}

	/**
	 * Build the final FilePatch.
	 *
	 * @returns The constructed patch
	 */
	build(): FilePatch {
		return { uri: this.uri, ops: this.ops };
	}

	/**
	 * Check if any operations have been added.
	 */
	hasOps(): boolean {
		return this.ops.length > 0;
	}
}

/**
 * Create a new FixBuilder.
 *
 * @param uri - Document URI
 * @param pointer - Optional base pointer
 * @returns A new FixBuilder instance
 *
 * @example
 * ```typescript
 * const patch = fix(op.uri, op.pointer)
 *   .addField("summary", "List users")
 *   .build();
 * ```
 */
export function fix(uri: string, pointer?: string): FixBuilder {
	return new FixBuilder(uri, pointer);
}

/**
 * Quick fix for adding a single field.
 *
 * @param ref - Visitor ref with uri and pointer
 * @param field - Field name to add
 * @param value - Value to set
 * @returns The constructed patch
 *
 * @example
 * ```typescript
 * ctx.fix(addFieldFix(op, "summary", "TODO: Add summary"));
 * ```
 */
export function addFieldFix(
	ref: { uri: string; pointer: string },
	field: string,
	value: unknown,
): FilePatch {
	return fix(ref.uri, ref.pointer).addField(field, value).build();
}

/**
 * Quick fix for replacing a single field value.
 *
 * @param ref - Visitor ref with uri and pointer
 * @param field - Field name to replace
 * @param value - New value
 * @returns The constructed patch
 *
 * @example
 * ```typescript
 * ctx.fix(setFieldFix(op, "summary", "Updated summary"));
 * ```
 */
export function setFieldFix(
	ref: { uri: string; pointer: string },
	field: string,
	value: unknown,
): FilePatch {
	return fix(ref.uri, ref.pointer).setField(field, value).build();
}

/**
 * Quick fix for removing a single field.
 *
 * @param ref - Visitor ref with uri and pointer
 * @param field - Field name to remove
 * @returns The constructed patch
 *
 * @example
 * ```typescript
 * ctx.fix(removeFieldFix(op, "deprecated"));
 * ```
 */
export function removeFieldFix(
	ref: { uri: string; pointer: string },
	field: string,
): FilePatch {
	return fix(ref.uri, ref.pointer).removeField(field).build();
}

