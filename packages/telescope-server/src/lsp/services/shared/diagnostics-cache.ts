/**
 * Shared Diagnostics Cache
 *
 * Provides a generic caching mechanism for LSP diagnostics that can be used
 * by both the validation service and workspace index. This consolidates
 * diagnostic caching logic to reduce duplication.
 *
 * @module lsp/services/shared/diagnostics-cache
 */

import { createHash } from "node:crypto";
import type { Diagnostic } from "vscode-languageserver-protocol";

/**
 * Entry in the diagnostics cache.
 */
export interface DiagnosticsCacheEntry {
	/** Cached diagnostics for the file */
	diagnostics: Diagnostic[];
	/** Result ID for LSP caching protocol */
	resultId: string;
	/** Hash of file content when diagnostics were computed */
	contentHash: string;
	/** Timestamp of when entry was created */
	timestamp: number;
}

/**
 * Generic diagnostics cache with change tracking.
 *
 * Features:
 * - Caches diagnostics by URI
 * - Tracks which files have changed and need revalidation
 * - Provides stable result IDs for LSP caching protocol
 * - Supports invalidation and clearing
 *
 * @example
 * ```typescript
 * const cache = new DiagnosticsCache();
 *
 * // Store diagnostics
 * cache.set(uri, diagnostics, contentHash);
 *
 * // Check if needs revalidation
 * if (cache.needsRevalidation(uri, contentHash)) {
 *   const newDiagnostics = await runValidation(uri);
 *   cache.set(uri, newDiagnostics, newContentHash);
 * }
 *
 * // Get result ID for LSP protocol
 * const resultId = cache.getResultId(uri);
 * ```
 */
export class DiagnosticsCache {
	private cache = new Map<string, DiagnosticsCacheEntry>();
	private changedFiles = new Set<string>();

	/**
	 * Get cached entry for a URI.
	 */
	get(uri: string): DiagnosticsCacheEntry | undefined {
		return this.cache.get(uri);
	}

	/**
	 * Get cached diagnostics for a URI.
	 */
	getDiagnostics(uri: string): Diagnostic[] | undefined {
		return this.cache.get(uri)?.diagnostics;
	}

	/**
	 * Get the result ID for a cached file.
	 */
	getResultId(uri: string): string | undefined {
		return this.cache.get(uri)?.resultId;
	}

	/**
	 * Store diagnostics in the cache.
	 *
	 * @param uri - Document URI
	 * @param diagnostics - Array of diagnostics
	 * @param contentHash - Hash of the file content
	 */
	set(uri: string, diagnostics: Diagnostic[], contentHash: string): void {
		const resultId = computeDiagnosticsResultId(uri, diagnostics, contentHash);
		this.cache.set(uri, {
			diagnostics,
			resultId,
			contentHash,
			timestamp: Date.now(),
		});
		this.changedFiles.delete(uri);
	}

	/**
	 * Mark a file as changed (requires revalidation).
	 */
	markChanged(uri: string): void {
		this.changedFiles.add(uri);
	}

	/**
	 * Check if a file is marked as changed.
	 */
	isMarkedChanged(uri: string): boolean {
		return this.changedFiles.has(uri);
	}

	/**
	 * Check if a file needs revalidation.
	 *
	 * A file needs revalidation if:
	 * - It's marked as changed
	 * - It's not in the cache
	 * - The content hash has changed
	 *
	 * @param uri - Document URI
	 * @param currentContentHash - Current hash of the file content
	 * @returns true if the file needs revalidation
	 */
	needsRevalidation(uri: string, currentContentHash?: string): boolean {
		if (this.changedFiles.has(uri)) {
			return true;
		}

		const entry = this.cache.get(uri);
		if (!entry) {
			return true;
		}

		if (currentContentHash && entry.contentHash !== currentContentHash) {
			return true;
		}

		return false;
	}

	/**
	 * Check if a URI has cached diagnostics.
	 */
	has(uri: string): boolean {
		return this.cache.has(uri);
	}

	/**
	 * Invalidate a specific URI from the cache.
	 */
	invalidate(uri: string): void {
		this.cache.delete(uri);
		this.changedFiles.add(uri);
	}

	/**
	 * Invalidate multiple URIs from the cache.
	 */
	invalidateMany(uris: Iterable<string>): void {
		for (const uri of uris) {
			this.invalidate(uri);
		}
	}

	/**
	 * Clear all cached data.
	 */
	clear(): void {
		this.cache.clear();
		this.changedFiles.clear();
	}

	/**
	 * Get all cached URIs.
	 */
	keys(): IterableIterator<string> {
		return this.cache.keys();
	}

	/**
	 * Get the number of cached entries.
	 */
	get size(): number {
		return this.cache.size;
	}
}

/**
 * Compute a deterministic result ID for diagnostics.
 * The ID changes when diagnostics change, stays the same when they don't.
 *
 * This is used by the LSP protocol to determine if the client needs to
 * update its displayed diagnostics.
 *
 * @param uri - Document URI
 * @param diagnostics - Array of diagnostics
 * @param contentHash - Hash of the file content
 * @returns Unique result ID string
 */
export function computeDiagnosticsResultId(
	uri: string,
	diagnostics: Diagnostic[],
	contentHash: string,
): string {
	const hash = createHash("sha1");
	hash.update(uri);
	hash.update(contentHash);

	// Include diagnostic count and summary for quick differentiation
	hash.update(String(diagnostics.length));
	for (const diag of diagnostics) {
		hash.update(String(diag.severity));
		hash.update(diag.code?.toString() ?? "");
		hash.update(diag.message);
		hash.update(String(diag.range.start.line));
		hash.update(String(diag.range.start.character));
	}

	return hash.digest("hex").substring(0, 16);
}

/**
 * Compute a content hash for change detection.
 *
 * @param content - The file content
 * @returns Hash string
 */
export function computeContentHash(content: string): string {
	return createHash("sha1").update(content).digest("hex").substring(0, 16);
}

