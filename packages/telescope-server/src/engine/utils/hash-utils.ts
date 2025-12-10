/**
 * Hash Utilities
 *
 * This module provides utilities for computing content hashes.
 * Hashes are used for:
 *
 * - Cache invalidation (detecting when documents change)
 * - Change detection in the LSP
 * - Deduplication of identical content
 *
 * @module utils/hash-utils
 *
 * @example
 * ```typescript
 * import { computeDocumentHash } from "telescope-server";
 *
 * const hash = computeDocumentHash(documentText);
 * if (hash !== previousHash) {
 *   // Document changed, re-validate
 * }
 * ```
 */

import { createHash } from "node:crypto";

/**
 * Compute a SHA1 hash for document text.
 *
 * Uses SHA1 for speed - this is used for change detection, not security.
 * The hash is returned as a hexadecimal string.
 *
 * @param text - The document text to hash
 * @returns The hexadecimal SHA1 hash string (40 characters)
 *
 * @example
 * ```typescript
 * computeDocumentHash("openapi: 3.1.0");
 * // "7a8b9c..." (40 hex characters)
 *
 * // Same content = same hash
 * const hash1 = computeDocumentHash("hello");
 * const hash2 = computeDocumentHash("hello");
 * hash1 === hash2; // true
 *
 * // Different content = different hash
 * const hash3 = computeDocumentHash("world");
 * hash1 !== hash3; // true
 * ```
 */
export function computeDocumentHash(text: string): string {
	return createHash("sha1").update(text).digest("hex");
}
