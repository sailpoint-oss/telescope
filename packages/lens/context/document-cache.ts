import type { VfsHost } from "host";
import type { ParsedDocument } from "loader";
import {
	type DocumentType,
	identifyDocumentType,
	isRootDocument,
	loadDocument,
} from "loader";

/**
 * Cache that tracks document types as we discover them.
 * This avoids re-checking files and allows us to build up knowledge
 * about the workspace structure.
 */
export class DocumentTypeCache {
	private typeCache = new Map<string, DocumentType>();
	private rootCache = new Set<string>();
	private loadedDocs = new Map<string, ParsedDocument>();

	/**
	 * Get or load the document type for a URI.
	 * If not cached, loads and analyzes the document.
	 */
	async getDocumentType(uri: string, host: VfsHost): Promise<DocumentType> {
		const cachedType = this.typeCache.get(uri);
		if (cachedType !== undefined) {
			return cachedType;
		}

		try {
			const doc = await loadDocument({ host, uri });
			this.loadedDocs.set(uri, doc);
			const type = identifyDocumentType(doc.ast);
			this.typeCache.set(uri, type);

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
				console.log(`[Document Cache] Skipping ${uri}: ${errorMessage}`);
			}
			this.typeCache.set(uri, "unknown");
			return "unknown";
		}
	}

	/**
	 * Check if a URI is a root document (cached or by loading).
	 */
	async isRootDocument(uri: string, host: VfsHost): Promise<boolean> {
		if (this.rootCache.has(uri)) {
			return true;
		}

		const type = await this.getDocumentType(uri, host);
		return type === "openapi-root";
	}

	/**
	 * Get the loaded document if available, or load it.
	 */
	async getDocument(
		uri: string,
		host: VfsHost,
	): Promise<ParsedDocument | null> {
		const cachedDoc = this.loadedDocs.get(uri);
		if (cachedDoc) {
			return cachedDoc;
		}

		// Early check: if we already know this is unknown type, skip loading
		if (this.typeCache.get(uri) === "unknown") {
			return null;
		}

		try {
			const doc = await loadDocument({ host, uri });
			this.loadedDocs.set(uri, doc);
			// Also cache the type
			const type = identifyDocumentType(doc.ast);
			this.typeCache.set(uri, type);
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
				console.log(`[Document Cache] Skipping ${uri}: ${errorMessage}`);
			}
			this.typeCache.set(uri, "unknown");
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
	}

	/**
\t * Clear all caches.
	 */
	clear(): void {
		this.typeCache.clear();
		this.rootCache.clear();
		this.loadedDocs.clear();
	}
}
