import type { FileSystem } from "../fs-types.js";
import { loadDocument } from "../load-document.js";
import type { ParsedDocument } from "../types.js";
import {
	type DocumentType,
	identifyDocumentType,
	isRootDocument,
} from "../utils/document-type-utils.js";

/**
 * Cache that tracks document types as we discover them.
 * This avoids re-checking files and allows us to build up knowledge
 * about the workspace structure.
 * Uses LRU eviction to limit memory usage with O(1) operations.
 */
export class DocumentTypeCache {
	private typeCache = new Map<string, DocumentType>();
	private rootCache = new Set<string>();
	private loadedDocs = new Map<string, ParsedDocument>();
	private readonly maxSize: number;
	/**
	 * LRU tracking using Map's built-in insertion order.
	 * Values are timestamps for debugging; key order determines LRU.
	 * Delete + re-set moves a key to the end (most recently used).
	 */
	private readonly accessOrder = new Map<string, number>();

	constructor(maxSize: number = 500) {
		this.maxSize = maxSize;
	}

	/**
	 * Get or load the document type for a URI.
	 * If not cached, loads and analyzes the document.
	 */
	async getDocumentType(
		uri: string,
		fileSystem: FileSystem,
	): Promise<DocumentType> {
		const cachedType = this.typeCache.get(uri);
		if (cachedType !== undefined) {
			this.updateAccessOrder(uri);
			return cachedType;
		}

		// Evict least recently used if cache is full
		this.evictIfNeeded();

		try {
			const doc = await loadDocument({ fileSystem, uri });
			this.loadedDocs.set(uri, doc);
			const type = identifyDocumentType(doc.ast);
			this.typeCache.set(uri, type);
			this.updateAccessOrder(uri);

			// Track root documents separately
			if (isRootDocument(doc.ast)) {
				this.rootCache.add(uri);
			}

			return type;
		} catch (error) {
			// If we can't load or it's not an OpenAPI file, mark as unknown
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			if (
				errorMessage.includes("not an OpenAPI document") ||
				errorMessage.includes("known non-OpenAPI file")
			) {
				// Skip known non-OpenAPI files silently
			}
			this.typeCache.set(uri, "unknown");
			this.updateAccessOrder(uri);
			return "unknown";
		}
	}

	/**
	 * Check if a URI is a root document (cached or by loading).
	 */
	async isRootDocument(uri: string, fileSystem: FileSystem): Promise<boolean> {
		if (this.rootCache.has(uri)) {
			return true;
		}

		const type = await this.getDocumentType(uri, fileSystem);
		return type === "root";
	}

	/**
	 * Get the loaded document if available, or load it.
	 */
	async getDocument(
		uri: string,
		fileSystem: FileSystem,
	): Promise<ParsedDocument | null> {
		const cachedDoc = this.loadedDocs.get(uri);
		if (cachedDoc) {
			this.updateAccessOrder(uri);
			return cachedDoc;
		}

		// Early check: if we already know this is unknown type, skip loading
		if (this.typeCache.get(uri) === "unknown") {
			return null;
		}

		// Evict least recently used if cache is full
		this.evictIfNeeded();

		try {
			const doc = await loadDocument({ fileSystem, uri });
			this.loadedDocs.set(uri, doc);
			// Also cache the type
			const type = identifyDocumentType(doc.ast);
			this.typeCache.set(uri, type);
			this.updateAccessOrder(uri);
			if (isRootDocument(doc.ast)) {
				this.rootCache.add(uri);
			}
			return doc;
		} catch (error) {
			// Mark as unknown if load failed
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			if (
				errorMessage.includes("not an OpenAPI document") ||
				errorMessage.includes("known non-OpenAPI file")
			) {
				// Skip known non-OpenAPI files silently
			}
			this.typeCache.set(uri, "unknown");
			this.updateAccessOrder(uri);
			return null;
		}
	}

	/**
	 * Get all known root document URIs.
	 */
	getKnownRoots(): string[] {
		return Array.from(this.rootCache);
	}

	/**
	 * Check if we have a cached type for a URI.
	 */
	hasCachedType(uri: string): boolean {
		return this.typeCache.has(uri);
	}

	/**
	 * Get cached type without loading.
	 */
	getCachedType(uri: string): DocumentType | null {
		return this.typeCache.get(uri) ?? null;
	}

	/**
	 * Clear the cache for a specific URI (useful when files change).
	 */
	invalidate(uri: string): void {
		this.typeCache.delete(uri);
		this.rootCache.delete(uri);
		this.loadedDocs.delete(uri);
		this.accessOrder.delete(uri);
	}

	/**
	 * Clear all caches.
	 */
	clear(): void {
		this.typeCache.clear();
		this.rootCache.clear();
		this.loadedDocs.clear();
		this.accessOrder.clear();
	}

	/**
	 * Update access order for LRU eviction.
	 * Uses Map's insertion order: delete + re-set moves key to end.
	 * O(1) operation.
	 */
	private updateAccessOrder(uri: string): void {
		// Delete and re-add to move to end of Map (most recently used)
		this.accessOrder.delete(uri);
		this.accessOrder.set(uri, Date.now());
	}

	/**
	 * Evict least recently used entry if cache is full.
	 * O(1) operation using Map's iteration order.
	 */
	private evictIfNeeded(): void {
		if (this.typeCache.size >= this.maxSize && this.accessOrder.size > 0) {
			// Map iterates in insertion order; first key is LRU
			const lruUri = this.accessOrder.keys().next().value;
			if (lruUri) {
				this.invalidate(lruUri);
			}
		}
	}
}
