import { createHash } from "node:crypto";

/**
 * Compute a SHA1 hash for document text.
 * Used for cache invalidation and change detection.
 *
 * @param text - The document text to hash
 * @returns The hexadecimal hash string
 */
export function computeDocumentHash(text: string): string {
	return createHash("sha1").update(text).digest("hex");
}


