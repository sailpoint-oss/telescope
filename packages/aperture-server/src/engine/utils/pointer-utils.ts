/**
 * JSON Pointer Utilities
 *
 * This module provides utilities for working with JSON Pointers (RFC 6901).
 * JSON Pointers are used throughout the codebase to reference specific
 * locations within OpenAPI documents.
 *
 * The module provides functions to:
 * - Encode/decode pointer segments (handling ~ and / escaping)
 * - Split pointers into segments and join segments into pointers
 * - Get values from objects using pointers
 *
 * @module utils/pointer-utils
 *
 * @see {@link https://datatracker.ietf.org/doc/html/rfc6901|RFC 6901 - JSON Pointer}
 *
 * @example
 * ```typescript
 * import { splitPointer, joinPointer, getValueAtPointer } from "aperture-server";
 *
 * // Split a pointer into segments
 * const segments = splitPointer("#/paths/~1users~1{id}/get");
 * // ["paths", "/users/{id}", "get"]
 *
 * // Join segments into a pointer
 * const pointer = joinPointer(["components", "schemas", "User"]);
 * // "#/components/schemas/User"
 *
 * // Get a value using a pointer
 * const operation = getValueAtPointer(doc, "#/paths/~1users/get");
 * ```
 */

/**
 * Encode a single segment for use in a JSON Pointer.
 *
 * Per RFC 6901, the characters ~ and / have special meaning and must be escaped:
 * - ~ becomes ~0
 * - / becomes ~1
 *
 * @param segment - The raw segment string
 * @returns The encoded segment safe for use in a pointer
 *
 * @example
 * ```typescript
 * encodePointerSegment("users/{id}"); // "users~1{id}" (/ escaped)
 * encodePointerSegment("a~b");        // "a~0b" (~ escaped)
 * ```
 */
export function encodePointerSegment(segment: string): string {
	return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

/**
 * Decode a JSON Pointer segment back to its original form.
 *
 * This reverses the RFC 6901 escaping:
 * - ~1 becomes /
 * - ~0 becomes ~
 *
 * Note: Order matters - ~1 must be decoded before ~0 to handle "~01" correctly.
 *
 * @param segment - The encoded segment from a pointer
 * @returns The decoded original segment
 *
 * @example
 * ```typescript
 * decodePointerSegment("users~1{id}"); // "users/{id}"
 * decodePointerSegment("a~0b");        // "a~b"
 * decodePointerSegment("~01");         // "~1" (not "/")
 * ```
 */
export function decodePointerSegment(segment: string): string {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Split a JSON Pointer into its component segments.
 *
 * Handles various pointer formats:
 * - "#" or empty string → empty array (root)
 * - "#/a/b/c" → ["a", "b", "c"]
 * - "a/b/c" → ["a", "b", "c"]
 *
 * Each segment is automatically decoded (unescaped).
 *
 * @param pointer - The JSON Pointer string
 * @returns Array of decoded path segments
 *
 * @example
 * ```typescript
 * splitPointer("#/paths/~1users/get");
 * // ["paths", "/users", "get"]
 *
 * splitPointer("#");
 * // []
 *
 * splitPointer("#/components/schemas/User");
 * // ["components", "schemas", "User"]
 * ```
 */
export function splitPointer(pointer: string): string[] {
	if (!pointer || pointer === "#") return [];
	const trimmed = pointer.startsWith("#/")
		? pointer.slice(2)
		: pointer.startsWith("#")
			? pointer.slice(1)
			: pointer;
	if (!trimmed) return [];
	return trimmed.split("/").map(decodePointerSegment);
}

/**
 * Join path segments into a JSON Pointer string.
 *
 * Each segment is automatically encoded (escaped).
 * An empty array returns "#" (root pointer).
 *
 * @param segments - Array of path segments to join
 * @returns JSON Pointer string starting with "#/"
 *
 * @example
 * ```typescript
 * joinPointer(["paths", "/users", "get"]);
 * // "#/paths/~1users/get"
 *
 * joinPointer([]);
 * // "#"
 *
 * joinPointer(["components", "schemas", "User"]);
 * // "#/components/schemas/User"
 * ```
 */
export function joinPointer(segments: string[]): string {
	if (!segments.length) return "#";
	return `#/${segments.map(encodePointerSegment).join("/")}`;
}

/**
 * Get the value at a JSON pointer in a plain JavaScript object.
 *
 * Traverses the object following the pointer segments and returns
 * the value at the target location. Returns undefined if the path
 * doesn't exist or encounters a non-traversable value.
 *
 * For IR documents, use getValueAtPointer from ir/context.ts instead,
 * which provides additional IR-specific functionality.
 *
 * @param root - The root object to traverse
 * @param pointer - JSON Pointer to the target value
 * @returns The value at the pointer location, or undefined if not found
 *
 * @example
 * ```typescript
 * const doc = {
 *   openapi: "3.1.0",
 *   paths: {
 *     "/users": {
 *       get: { operationId: "getUsers" }
 *     }
 *   }
 * };
 *
 * getValueAtPointer(doc, "#/openapi");
 * // "3.1.0"
 *
 * getValueAtPointer(doc, "#/paths/~1users/get/operationId");
 * // "getUsers"
 *
 * getValueAtPointer(doc, "#/nonexistent");
 * // undefined
 * ```
 */
export function getValueAtPointer(root: unknown, pointer: string): unknown {
	const segments = splitPointer(pointer);
	let current: any = root;
	for (const segment of segments) {
		if (current == null) return undefined;
		if (Array.isArray(current)) {
			const index = Number(segment);
			if (!Number.isInteger(index) || index < 0 || index >= current.length) {
				return undefined;
			}
			current = current[index];
		} else if (typeof current === "object") {
			current = (current as Record<string, unknown>)[segment];
		} else {
			return undefined;
		}
	}
	return current;
}

/**
 * Parse a JSON Pointer string into an array of path segments.
 *
 * Unlike splitPointer, this function returns numeric indices as numbers,
 * making it suitable for direct object/array traversal. String segments
 * that look like numbers (e.g., "123") are converted to numbers.
 *
 * Handles various pointer formats:
 * - "#" or empty string → empty array (root)
 * - "#/a/b/c" → ["a", "b", "c"]
 * - "#/items/0/name" → ["items", 0, "name"]
 *
 * Each segment is automatically decoded (unescaped).
 *
 * @param pointer - The JSON Pointer string to parse
 * @returns Array of path segments with numeric indices as numbers
 *
 * @example
 * ```typescript
 * parseJsonPointer("#/paths/~1users/get");
 * // ["paths", "/users", "get"]
 *
 * parseJsonPointer("#/items/0/name");
 * // ["items", 0, "name"]
 *
 * parseJsonPointer("#/components/schemas/User");
 * // ["components", "schemas", "User"]
 *
 * parseJsonPointer("");
 * // []
 * ```
 */
export function parseJsonPointer(pointer: string): (string | number)[] {
	// Handle empty or root pointers
	if (!pointer || pointer === "#" || pointer === "#/") {
		return [];
	}

	// Strip leading # and/or /
	let normalized = pointer;
	if (normalized.startsWith("#")) {
		normalized = normalized.slice(1);
	}
	if (normalized.startsWith("/")) {
		normalized = normalized.slice(1);
	}

	// Handle empty path after stripping
	if (!normalized) {
		return [];
	}

	// Split and decode segments
	return normalized.split("/").map((segment) => {
		// Decode JSON Pointer escapes: ~1 -> /, ~0 -> ~
		const decoded = decodePointerSegment(segment);
		// Convert numeric strings to numbers for array indexing
		const num = Number(decoded);
		if (!Number.isNaN(num) && Number.isFinite(num) && /^\d+$/.test(decoded)) {
			return num;
		}
		return decoded;
	});
}

/**
 * Get the parent pointer of a JSON pointer.
 *
 * Returns the pointer to the parent element by removing the last segment.
 * Returns "#" for root-level pointers.
 *
 * @param pointer - The JSON Pointer string
 * @returns The parent pointer, or "#" if already at root
 *
 * @example
 * ```typescript
 * getParentPointer("#/paths/~1users/get");
 * // "#/paths/~1users"
 *
 * getParentPointer("#/paths");
 * // "#"
 *
 * getParentPointer("#");
 * // "#"
 * ```
 */
export function getParentPointer(pointer: string): string {
	const segments = splitPointer(pointer);
	if (segments.length === 0) {
		return "#";
	}
	return joinPointer(segments.slice(0, -1));
}

/**
 * Get the last segment (key) of a JSON pointer.
 *
 * Returns the final path segment, which typically represents the
 * property name or array index at that location.
 *
 * @param pointer - The JSON Pointer string
 * @returns The last segment, or undefined for root pointers
 *
 * @example
 * ```typescript
 * getLastSegment("#/paths/~1users/get");
 * // "get"
 *
 * getLastSegment("#/items/0");
 * // "0"
 *
 * getLastSegment("#");
 * // undefined
 * ```
 */
export function getLastSegment(pointer: string): string | undefined {
	const segments = splitPointer(pointer);
	return segments.length > 0 ? segments[segments.length - 1] : undefined;
}
