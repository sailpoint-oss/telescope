import type { FileSystem } from "@volar/language-service";
import type { ProjectContext } from "../rules/types.js";
import type { ParsedDocument } from "../types.js";

interface CacheEntry {
	context: ProjectContext;
	documentHashes: Map<string, string>;
	timestamp: number;
}

/**
 * Cache for ProjectContext instances to avoid rebuilding graphs and indexes
 * when documents haven't changed. Works for both CLI and LSP.
 * Uses LRU eviction to limit memory usage.
 */
export class ProjectContextCache {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly fileChangeListeners = new Map<string, Set<() => void>>();
	private readonly maxSize: number;
	private readonly accessOrder: string[] = []; // Track access order for LRU

	constructor(maxSize: number = 50) {
		this.maxSize = maxSize;
	}

	/**
	 * Get a cached ProjectContext for a root URI, or build it if not cached or invalid.
	 */
	async getOrBuild(
		rootUri: string,
		fileSystem: FileSystem,
		buildContext: (
			rootUri: string,
			fileSystem: FileSystem,
		) => Promise<ProjectContext>,
	): Promise<ProjectContext> {
		const cached = this.cache.get(rootUri);
		if (cached) {
			// Check if any documents have changed by comparing hashes
			const hasChanges = this.hasDocumentChanges(
				cached.context.docs,
				cached.documentHashes,
			);

			if (!hasChanges) {
				// Update access order for LRU
				this.updateAccessOrder(rootUri);
				return cached.context;
			}

			// Documents changed, invalidate cache
			this.invalidate(rootUri);
		}

		// Build new context
		const context = await buildContext(rootUri, fileSystem);

		// Compute document hashes for cache key
		const documentHashes = new Map<string, string>();
		for (const [uri, doc] of context.docs) {
			documentHashes.set(uri, doc.hash);
		}

		// Evict least recently used if cache is full
		this.evictIfNeeded();

		// Store in cache
		this.cache.set(rootUri, {
			context,
			documentHashes,
			timestamp: Date.now(),
		});
		this.updateAccessOrder(rootUri);

		return context;
	}

	/**
	 * Invalidate cache entry for a root URI.
	 */
	invalidate(rootUri: string): void {
		this.cache.delete(rootUri);
		// Remove from access order
		const index = this.accessOrder.indexOf(rootUri);
		if (index !== -1) {
			this.accessOrder.splice(index, 1);
		}
		// Unsubscribe from file change events
		const listeners = this.fileChangeListeners.get(rootUri);
		if (listeners) {
			for (const listener of listeners) {
				listener();
			}
			this.fileChangeListeners.delete(rootUri);
		}
	}

	/**
	 * Invalidate cache entries that include a specific document URI.
	 */
	invalidateForDocument(uri: string): void {
		for (const [rootUri, entry] of this.cache) {
			if (entry.context.docs.has(uri)) {
				this.invalidate(rootUri);
			}
		}
	}

	/**
	 * Clear all cache entries.
	 */
	clear(): void {
		// Unsubscribe from all file change events
		for (const listeners of this.fileChangeListeners.values()) {
			for (const listener of listeners) {
				listener();
			}
		}
		this.fileChangeListeners.clear();
		this.cache.clear();
		this.accessOrder.length = 0;
	}

	/**
	 * Get cache statistics for debugging.
	 */
	getStats(): {
		cacheSize: number;
		cachedRoots: string[];
	} {
		return {
			cacheSize: this.cache.size,
			cachedRoots: Array.from(this.cache.keys()),
		};
	}

	private hasDocumentChanges(
		docs: Map<string, ParsedDocument>,
		cachedHashes: Map<string, string>,
	): boolean {
		// Check if any document hash has changed
		for (const [uri, cachedHash] of cachedHashes) {
			const doc = docs.get(uri);
			if (!doc) {
				// Document removed
				return true;
			}

			if (doc.hash !== cachedHash) {
				// Document changed
				return true;
			}
		}

		// Check if any new documents were added
		for (const uri of docs.keys()) {
			if (!cachedHashes.has(uri)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Update access order for LRU eviction.
	 */
	private updateAccessOrder(rootUri: string): void {
		const index = this.accessOrder.indexOf(rootUri);
		if (index !== -1) {
			// Move to end (most recently used)
			this.accessOrder.splice(index, 1);
		}
		this.accessOrder.push(rootUri);
	}

	/**
	 * Evict least recently used entry if cache is full.
	 */
	private evictIfNeeded(): void {
		if (this.cache.size >= this.maxSize && this.accessOrder.length > 0) {
			const lruUri = this.accessOrder[0];
			if (lruUri) {
				this.invalidate(lruUri);
			}
		}
	}
}
