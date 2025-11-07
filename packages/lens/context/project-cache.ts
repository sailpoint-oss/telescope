import type { ProjectContext } from "engine";
import type { ParsedDocument } from "loader";
import type { VfsHost } from "host";
import { buildRefGraph } from "indexer";
import { buildIndex } from "indexer";

interface CacheEntry {
	context: ProjectContext;
	documentHashes: Map<string, string>;
	timestamp: number;
}

/**
 * Cache for ProjectContext instances to avoid rebuilding graphs and indexes
 * when documents haven't changed. Works for both CLI and LSP.
 */
export class ProjectContextCache {
	private readonly cache = new Map<string, CacheEntry>();
	private readonly fileChangeListeners = new Map<string, Set<() => void>>();

	/**
	 * Get a cached ProjectContext for a root URI, or build it if not cached or invalid.
	 */
	async getOrBuild(
		rootUri: string,
		host: VfsHost,
		buildContext: (
			rootUri: string,
			host: VfsHost,
		) => Promise<ProjectContext>,
	): Promise<ProjectContext> {
		const cached = this.cache.get(rootUri);
		if (cached) {
			// Check if any documents have changed by comparing hashes
			const hasChanges = await this.hasDocumentChanges(
				cached.context.docs,
				cached.documentHashes,
				host,
			);

			if (!hasChanges) {
				return cached.context;
			}

			// Documents changed, invalidate cache
			this.invalidate(rootUri);
		}

		// Build new context
		const context = await buildContext(rootUri, host);

		// Compute document hashes for cache key
		const documentHashes = new Map<string, string>();
		for (const [uri, doc] of context.docs) {
			documentHashes.set(uri, doc.hash);
		}

		// Store in cache
		this.cache.set(rootUri, {
			context,
			documentHashes,
			timestamp: Date.now(),
		});

		// Subscribe to file change events if host supports it
		this.subscribeToFileChanges(rootUri, host);

		return context;
	}

	/**
	 * Invalidate cache entry for a root URI.
	 */
	invalidate(rootUri: string): void {
		this.cache.delete(rootUri);
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

	private async hasDocumentChanges(
		docs: Map<string, ParsedDocument>,
		cachedHashes: Map<string, string>,
		host: VfsHost,
	): Promise<boolean> {
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

	private subscribeToFileChanges(rootUri: string, host: VfsHost): void {
		if (!host.onFileChange) {
			return;
		}

		const entry = this.cache.get(rootUri);
		if (!entry) {
			return;
		}

		// Subscribe to changes for all documents in the context
		const unsubscribes: (() => void)[] = [];
		for (const uri of entry.context.docs.keys()) {
			const unsubscribe = host.onFileChange(uri, () => {
				// Document changed, invalidate this root's cache
				this.invalidate(rootUri);
			});
			unsubscribes.push(unsubscribe);
		}

		// Store unsubscribe callbacks
		const listeners = new Set<() => void>(unsubscribes);
		this.fileChangeListeners.set(rootUri, listeners);
	}
}

