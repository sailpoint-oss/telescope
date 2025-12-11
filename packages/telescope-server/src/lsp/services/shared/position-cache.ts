/**
 * PositionCache - Caches parsed AST and line offsets for position lookups.
 *
 * This cache is used by `findPositionAtPointer` to avoid re-parsing files
 * from disk on each $ref resolution. Entries are evicted based on LRU and
 * invalidated when files change.
 *
 * @module lsp/services/shared/position-cache
 */

import type { Node as JsonNode } from "jsonc-parser";
import * as jsonc from "jsonc-parser";
import type { Position } from "vscode-languageserver-protocol";
import type * as YAML from "yaml";
import * as yaml from "yaml";
import {
	buildLineOffsets,
	getLineCol,
} from "../../../engine/utils/line-offset-utils.js";

/**
 * Cached entry for a parsed file.
 */
interface CachedParsedFile {
	/** File content hash for invalidation */
	contentHash: string;
	/** Line offsets for position calculation */
	lineOffsets: number[];
	/** Parsed YAML document (if YAML file) */
	yamlDoc?: YAML.Document.Parsed;
	/** Parsed JSON tree (if JSON file) */
	jsonTree?: JsonNode;
	/** Timestamp of last access (for LRU) */
	lastAccess: number;
}

/**
 * Simple hash function for content change detection.
 */
function simpleHash(content: string): string {
	let hash = 0;
	for (let i = 0; i < content.length; i++) {
		const char = content.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0; // Convert to 32bit integer
	}
	return hash.toString(16);
}

/**
 * PositionCache - caches parsed files for efficient position lookups.
 *
 * @example
 * ```typescript
 * const cache = new PositionCache();
 *
 * // Get position for a path in a file
 * const position = await cache.findPosition(
 *   "file:///api.yaml",
 *   ["components", "schemas", "User"],
 *   async () => content, // content provider
 *   true, // isYaml
 * );
 * ```
 */
export class PositionCache {
	private readonly cache = new Map<string, CachedParsedFile>();
	private readonly maxSize: number;

	constructor(maxSize = 100) {
		this.maxSize = maxSize;
	}

	/**
	 * Find position at a path in a file, using cache when possible.
	 *
	 * @param uri - File URI
	 * @param path - JSON pointer path segments
	 * @param getContent - Async function to get file content
	 * @param isYaml - Whether the file is YAML format
	 * @returns Position at the path, or null if not found
	 */
	async findPosition(
		uri: string,
		path: (string | number)[],
		getContent: () => Promise<string | null>,
		isYaml: boolean,
	): Promise<Position | null> {
		const content = await getContent();
		if (!content) {
			return null;
		}

		const contentHash = simpleHash(content);
		const cached = this.cache.get(uri);

		// Check if cache is valid
		if (cached && cached.contentHash === contentHash) {
			cached.lastAccess = Date.now();
			return this.findPositionInCached(cached, path, isYaml);
		}

		// Parse and cache
		const lineOffsets = buildLineOffsets(content);
		const entry: CachedParsedFile = {
			contentHash,
			lineOffsets,
			lastAccess: Date.now(),
		};

		try {
			if (isYaml) {
				entry.yamlDoc = yaml.parseDocument(content, {
					keepSourceTokens: true,
				}) as YAML.Document.Parsed;
			} else {
				entry.jsonTree = jsonc.parseTree(content) ?? undefined;
			}
		} catch {
			// Parse failed - still cache line offsets for partial functionality
		}

		// Store in cache
		this.cache.set(uri, entry);
		this.enforceMaxSize();

		return this.findPositionInCached(entry, path, isYaml);
	}

	/**
	 * Find position in a cached entry.
	 */
	private findPositionInCached(
		entry: CachedParsedFile,
		path: (string | number)[],
		isYaml: boolean,
	): Position | null {
		if (isYaml && entry.yamlDoc) {
			const node = entry.yamlDoc.getIn(path, true);
			if (
				node &&
				typeof node === "object" &&
				"range" in node &&
				Array.isArray(node.range)
			) {
				const offset = node.range[0];
				const pos = getLineCol(offset, entry.lineOffsets);
				return { line: pos.line - 1, character: pos.col - 1 };
			}
		} else if (!isYaml && entry.jsonTree) {
			const node = jsonc.findNodeAtLocation(entry.jsonTree, path);
			if (node) {
				const pos = getLineCol(node.offset, entry.lineOffsets);
				return { line: pos.line - 1, character: pos.col - 1 };
			}
		}
		return null;
	}

	/**
	 * Invalidate cache entry for a URI.
	 *
	 * @param uri - File URI to invalidate
	 */
	invalidate(uri: string): void {
		this.cache.delete(uri);
	}

	/**
	 * Clear the entire cache.
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Dispose the cache (alias for clear).
	 * Provides a consistent API with other disposable resources.
	 */
	dispose(): void {
		this.clear();
	}

	/**
	 * Enforce maximum cache size using LRU eviction.
	 */
	private enforceMaxSize(): void {
		if (this.cache.size <= this.maxSize) {
			return;
		}

		// Find and remove the oldest entries
		const entries = Array.from(this.cache.entries()).sort(
			(a, b) => a[1].lastAccess - b[1].lastAccess,
		);

		const toRemove = entries.slice(0, this.cache.size - this.maxSize);
		for (const [uri] of toRemove) {
			this.cache.delete(uri);
		}
	}

	/**
	 * Get cache statistics.
	 */
	getStats(): { size: number; maxSize: number } {
		return {
			size: this.cache.size,
			maxSize: this.maxSize,
		};
	}
}

/**
 * Global position cache instance for document link resolution.
 */
export const positionCache = new PositionCache();
