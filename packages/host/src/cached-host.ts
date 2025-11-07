import type { ReadResult, VfsHost } from "./index";

interface CacheEntry<T> {
	value: T;
	timestamp: number;
}

interface CacheOptions {
	/**
	 * Time-to-live for cache entries in milliseconds.
	 * Default: 5 minutes for exists(), no expiry for read()
	 */
	ttl?: number;
	/**
	 * Maximum number of cache entries before eviction.
	 * Default: 1000
	 */
	maxSize?: number;
}

/**
 * Caching wrapper for VfsHost that caches read() and exists() results.
 * Automatically invalidates cache when files change (if host supports file change events).
 * Works for both CLI and LSP environments.
 */
export class CachedVfsHost implements VfsHost {
	private readonly readCache = new Map<string, CacheEntry<ReadResult>>();
	private readonly existsCache = new Map<string, CacheEntry<boolean>>();
	private readonly fileChangeListeners = new Map<string, Set<() => void>>();
	private readonly unsubscribeCallbacks = new Map<string, () => void>();

	constructor(
		private readonly delegate: VfsHost,
		private readonly options: CacheOptions = {},
	) {
		// Subscribe to file change events if the host supports them
		if (this.delegate.onFileChange) {
			this.setupFileChangeListening();
		}
	}

	async read(uri: string): Promise<ReadResult> {
		const cached = this.readCache.get(uri);
		if (cached) {
			return cached.value;
		}

		const result = await this.delegate.read(uri);
		this.readCache.set(uri, {
			value: result,
			timestamp: Date.now(),
		});

		// Subscribe to file change events if supported
		this.subscribeToFileChanges(uri);

		// Evict oldest entries if cache is too large
		this.evictIfNeeded(this.readCache);

		return result;
	}

	async exists(uri: string): Promise<boolean> {
		const cached = this.existsCache.get(uri);
		const ttl = this.options.ttl ?? 5 * 60 * 1000; // 5 minutes default

		if (cached) {
			const age = Date.now() - cached.timestamp;
			if (age < ttl) {
				return cached.value;
			}
			// Expired, remove from cache
			this.existsCache.delete(uri);
		}

		const result = await this.delegate.exists(uri);
		this.existsCache.set(uri, {
			value: result,
			timestamp: Date.now(),
		});

		// Subscribe to file change events if supported
		this.subscribeToFileChanges(uri);

		// Evict oldest entries if cache is too large
		this.evictIfNeeded(this.existsCache);

		return result;
	}

	async glob(patterns: string[]): Promise<string[]> {
		// Don't cache glob results as they can be expensive and patterns vary
		return this.delegate.glob(patterns);
	}

	watch(uris: string[], onChange: (uri: string) => void): () => void {
		// Wrap onChange to invalidate cache
		const wrappedOnChange = (uri: string) => {
			this.invalidate(uri);
			onChange(uri);
		};
		return this.delegate.watch(uris, wrappedOnChange);
	}

	resolve(fromUri: string, ref: string): string {
		return this.delegate.resolve(fromUri, ref);
	}

	onFileChange(uri: string, callback: () => void): () => void {
		// If delegate supports file change events, use it
		if (this.delegate.onFileChange) {
			return this.delegate.onFileChange(uri, callback);
		}
		// Otherwise, no-op unsubscribe
		return () => undefined;
	}

	/**
	 * Invalidate cache entries for a specific URI.
	 */
	invalidate(uri: string): void {
		this.readCache.delete(uri);
		this.existsCache.delete(uri);
		// Note: We keep the file change subscription active
		// so we can invalidate again if the file changes
	}

	/**
	 * Clear all cache entries.
	 */
	clear(): void {
		this.readCache.clear();
		this.existsCache.clear();
	}

	/**
	 * Get cache statistics for debugging.
	 */
	getStats(): {
		readCacheSize: number;
		existsCacheSize: number;
	} {
		return {
			readCacheSize: this.readCache.size,
			existsCacheSize: this.existsCache.size,
		};
	}

	private setupFileChangeListening(): void {
		// When files are cached, we'll subscribe to change events
		// This is done lazily when files are first read/exists
	}

	/**
	 * Subscribe to file change events for a URI if not already subscribed.
	 */
	private subscribeToFileChanges(uri: string): void {
		if (!this.delegate.onFileChange || this.unsubscribeCallbacks.has(uri)) {
			return;
		}

		const unsubscribe = this.delegate.onFileChange(uri, () => {
			this.invalidate(uri);
			// Notify any registered listeners
			const listeners = this.fileChangeListeners.get(uri);
			if (listeners) {
				for (const listener of listeners) {
					listener();
				}
			}
		});

		this.unsubscribeCallbacks.set(uri, unsubscribe);
	}

	private evictIfNeeded<T>(cache: Map<string, CacheEntry<T>>): void {
		const maxSize = this.options.maxSize ?? 1000;
		if (cache.size <= maxSize) {
			return;
		}

		// Evict oldest entries (simple FIFO for now)
		const entries = Array.from(cache.entries());
		entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

		const toEvict = cache.size - maxSize;
		for (let i = 0; i < toEvict; i++) {
			const entry = entries[i];
			if (!entry) continue;
			const [key] = entry;
			if (key) {
				cache.delete(key);
			}
		}
	}
}

