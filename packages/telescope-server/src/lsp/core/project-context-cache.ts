/**
 * ProjectContextCache - Caches ProjectContext instances for incremental updates.
 *
 * This module provides a caching layer for ProjectContext instances used in
 * workspace diagnostics. It implements:
 *
 * 1. Cache per root document - keyed by URI with content hashes
 * 2. Hash-based staleness detection - each document in the context has a hash
 * 3. Incremental updates - only rebuild when files actually change
 * 4. Shared document loading - if two roots reference same fragment, load once
 *
 * This reduces workspace diagnostics complexity from O(roots × documents)
 * to O(changed documents) for incremental updates.
 *
 * @module lsp/core/project-context-cache
 */

import type { LanguageServiceContext } from "@volar/language-service";
import { URI } from "vscode-uri";
import { buildIndex } from "../../engine/indexes/project-index.js";
import { buildRefGraph, findRefUris } from "../../engine/indexes/ref-graph.js";
import { loadDocument } from "../../engine/load-document.js";
import type { ProjectContext } from "../../engine/rules/types.js";
import type { ParsedDocument } from "../../engine/types.js";
import { normalizeUri } from "../../engine/utils/ref-utils.js";
import type { OpenAPIVirtualCode } from "../languages/virtualCodes/openapi-virtual-code.js";
import { getOpenAPIVirtualCode } from "../services/shared/virtual-code-utils.js";
import type {
	DiagnosticsLogger,
	telescopeVolarContext,
} from "../workspace/context.js";

/**
 * Cached entry for a ProjectContext.
 */
interface CachedProjectContext {
	/** The cached ProjectContext */
	context: ProjectContext;
	/** Hash of the primary document content */
	primaryHash: string;
	/** Hashes of all documents in the context, keyed by URI */
	documentHashes: Map<string, string>;
	/** Timestamp when this entry was last validated */
	lastValidated: number;
}

/**
 * Configuration options for the cache.
 */
interface ProjectContextCacheOptions {
	/** Maximum number of contexts to cache. Default: 50 */
	maxSize?: number;
	/** TTL for cached entries in milliseconds. Default: 5 minutes */
	ttlMs?: number;
}

const DEFAULT_MAX_SIZE = 50;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * ProjectContextCache - caches ProjectContext for incremental workspace diagnostics.
 *
 * @example
 * ```typescript
 * const cache = new ProjectContextCache(shared);
 *
 * // Get or build context for a root document
 * const context = await cache.getOrBuild(
 *   rootUri,
 *   virtualCode,
 *   languageServiceContext,
 *   affectedUris,
 * );
 *
 * // Invalidate when a document changes
 * cache.invalidateUri(changedUri);
 * ```
 */
export class ProjectContextCache {
	private readonly cache = new Map<string, CachedProjectContext>();
	private readonly sharedDocuments = new Map<string, ParsedDocument>();
	private readonly maxSize: number;
	private readonly ttlMs: number;
	private readonly logger: DiagnosticsLogger;

	constructor(
		private readonly shared: telescopeVolarContext,
		options: ProjectContextCacheOptions = {},
	) {
		this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
		this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
		this.logger = shared.getLogger("ProjectContextCache");
	}

	/**
	 * Get an existing cached ProjectContext or build a new one.
	 *
	 * @param rootUri - URI of the root document
	 * @param virtualCode - OpenAPIVirtualCode for the root document
	 * @param languageServiceContext - Volar language service context
	 * @param affectedUris - Set of URIs that have changed since last run
	 * @returns ProjectContext for rule execution
	 */
	async getOrBuild(
		rootUri: string,
		virtualCode: OpenAPIVirtualCode,
		languageServiceContext: LanguageServiceContext,
		affectedUris: Set<string>,
	): Promise<ProjectContext | null> {
		const normalizedRootUri = normalizeUri(rootUri);
		const cached = this.cache.get(normalizedRootUri);
		const now = Date.now();

		// Get current document hash
		const primaryDoc = virtualCode.toParsedDocument(rootUri);
		const primaryHash = primaryDoc.hash;

		// Fast path: check if cached entry is still valid
		if (cached) {
			// Check TTL
			if (now - cached.lastValidated > this.ttlMs) {
				this.logger.log(`[Cache Miss] TTL expired for ${rootUri}`);
				this.cache.delete(normalizedRootUri);
			}
			// Check if primary document changed
			else if (cached.primaryHash !== primaryHash) {
				this.logger.log(`[Cache Miss] Primary document changed for ${rootUri}`);
				this.cache.delete(normalizedRootUri);
			}
			// Check if any affected URIs are in this context's document set
			else if (!this.isAffected(cached, affectedUris)) {
				// Cache hit - no affected URIs in this context
				this.logger.log(`[Cache Hit] Using cached context for ${rootUri}`);
				cached.lastValidated = now;
				return cached.context;
			} else {
				// Some documents in the context have changed - try incremental rebuild
				this.logger.log(
					`[Incremental] Rebuilding affected documents for ${rootUri}`,
				);
				const updated = await this.incrementalRebuild(
					normalizedRootUri,
					cached,
					affectedUris,
					languageServiceContext,
				);
				if (updated) {
					return updated;
				}
				// Incremental rebuild failed, fall through to full rebuild
			}
		}

		// Full rebuild
		this.logger.log(`[Full Build] Building context for ${rootUri}`);
		return this.fullBuild(
			normalizedRootUri,
			virtualCode,
			languageServiceContext,
			primaryHash,
		);
	}

	/**
	 * Check if any affected URIs are in the cached context's document set.
	 */
	private isAffected(
		cached: CachedProjectContext,
		affectedUris: Set<string>,
	): boolean {
		for (const uri of affectedUris) {
			const normalizedUri = normalizeUri(uri);
			if (cached.documentHashes.has(normalizedUri)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Incrementally rebuild a cached context by only updating changed documents.
	 */
	private async incrementalRebuild(
		rootUri: string,
		cached: CachedProjectContext,
		affectedUris: Set<string>,
		languageServiceContext: LanguageServiceContext,
	): Promise<ProjectContext | null> {
		try {
			// Clone the existing docs map
			const docs = new Map(cached.context.docs);
			const documentHashes = new Map(cached.documentHashes);
			let hasChanges = false;

			// Update only the affected documents
			for (const uri of affectedUris) {
				const normalizedUri = normalizeUri(uri);
				if (!docs.has(normalizedUri)) {
					continue;
				}

				// Try to get updated document from VirtualCode
				const vc = getOpenAPIVirtualCode(
					languageServiceContext,
					URI.parse(uri),
				);

				if (vc) {
					// Use normalizedUri for consistency - ensures doc.uri matches map key
					const newDoc = vc.toParsedDocument(normalizedUri);
					docs.set(normalizedUri, newDoc);
					documentHashes.set(normalizedUri, newDoc.hash);
					this.sharedDocuments.set(normalizedUri, newDoc);
					hasChanges = true;
				} else {
					// Document no longer available, need full rebuild
					return null;
				}
			}

			if (!hasChanges) {
				// No actual changes found, return cached
				return cached.context;
			}

			// Rebuild graph and index from updated docs
			const { graph, resolver, rootResolver } = buildRefGraph({ docs });
			const index = buildIndex({ docs, graph, resolver });

			const newContext: ProjectContext = {
				docs,
				index,
				resolver,
				graph,
				rootResolver,
				version: index.version,
			};

			// Update cache entry
			this.cache.set(rootUri, {
				context: newContext,
				primaryHash: cached.primaryHash,
				documentHashes,
				lastValidated: Date.now(),
			});

			return newContext;
		} catch (error) {
			this.logger.warn(
				`Incremental rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return null;
		}
	}

	/**
	 * Build a complete ProjectContext from scratch.
	 */
	private async fullBuild(
		rootUri: string,
		virtualCode: OpenAPIVirtualCode,
		languageServiceContext: LanguageServiceContext,
		primaryHash: string,
	): Promise<ProjectContext | null> {
		const workspaceIndex = this.shared.workspaceIndex;

		// Get the primary document from VirtualCode
		const primaryDoc = virtualCode.toParsedDocument(rootUri);

		// Build docs map with primary and all linked documents
		const docs = new Map<string, ParsedDocument>();
		const documentHashes = new Map<string, string>();
		docs.set(rootUri, primaryDoc);
		documentHashes.set(rootUri, primaryDoc.hash);

		// Add linked documents (dependencies and dependents) from workspace index
		for (const linkedUri of workspaceIndex.getLinkedUris(rootUri)) {
			const normalizedLinkedUri = normalizeUri(linkedUri);
			if (docs.has(normalizedLinkedUri)) continue;

			// Check shared documents cache first
			const sharedDoc = this.sharedDocuments.get(normalizedLinkedUri);
			if (sharedDoc) {
				docs.set(normalizedLinkedUri, sharedDoc);
				documentHashes.set(normalizedLinkedUri, sharedDoc.hash);
				continue;
			}

			// Try to get VirtualCode for linked document
			const linkedVC = getOpenAPIVirtualCode(
				languageServiceContext,
				URI.parse(linkedUri),
			);
			if (linkedVC) {
				// Use normalizedLinkedUri for consistency - ensures doc.uri matches map key
				const linkedDoc = linkedVC.toParsedDocument(normalizedLinkedUri);
				docs.set(normalizedLinkedUri, linkedDoc);
				documentHashes.set(normalizedLinkedUri, linkedDoc.hash);
				this.sharedDocuments.set(normalizedLinkedUri, linkedDoc);
			}
		}

		// Load missing referenced documents via forward $ref traversal
		if (languageServiceContext?.env?.fs) {
			const fileSystem = languageServiceContext.env.fs;
			const toLoad = new Set<string>();
			const loaded = new Set<string>(docs.keys());

			// Find all $refs in loaded documents
			for (const doc of docs.values()) {
				const refs = findRefUris(doc, doc.uri);
				for (const refUri of refs) {
					const normalizedRefUri = normalizeUri(refUri);
					if (!loaded.has(normalizedRefUri) && !toLoad.has(normalizedRefUri)) {
						toLoad.add(normalizedRefUri);
					}
				}
			}

			// Load missing documents
			while (toLoad.size > 0) {
				const uri = toLoad.values().next().value;
				if (!uri) break;
				toLoad.delete(uri);
				loaded.add(uri);

				// URI is already normalized (from toLoad set)
				if (docs.has(uri)) continue;

				// Check shared documents cache first (URIs are normalized)
				const sharedDoc = this.sharedDocuments.get(uri);
				if (sharedDoc) {
					docs.set(uri, sharedDoc);
					documentHashes.set(uri, sharedDoc.hash);
					continue;
				}

				try {
					const doc = await loadDocument({ fileSystem, uri });
					// Use normalized URI for consistency - ensures doc.uri matches map key
					const normalizedDocUri = normalizeUri(doc.uri);
					docs.set(normalizedDocUri, doc);
					documentHashes.set(normalizedDocUri, doc.hash);
					this.sharedDocuments.set(normalizedDocUri, doc);

					// Find more refs in this document
					const refs = findRefUris(doc, doc.uri);
					for (const refUri of refs) {
						const normalizedRefUri = normalizeUri(refUri);
						if (!loaded.has(normalizedRefUri) && !toLoad.has(normalizedRefUri)) {
							toLoad.add(normalizedRefUri);
						}
					}
				} catch (error) {
					// Log but continue - missing refs will be reported by unresolved-ref rule
					this.logger.warn(
						`Failed to load referenced document ${uri}: ${
							error instanceof Error ? error.message : String(error)
						}`,
					);
				}
			}
		}

		// Build graph with proper resolver using buildRefGraph
		const { graph, resolver, rootResolver } = buildRefGraph({ docs });

		// Build index using the proper buildIndex function
		const index = buildIndex({ docs, graph, resolver });

		const context: ProjectContext = {
			docs,
			index,
			resolver,
			graph,
			rootResolver,
			version: index.version,
		};

		// Cache the result
		this.cache.set(rootUri, {
			context,
			primaryHash,
			documentHashes,
			lastValidated: Date.now(),
		});

		// Enforce max size with LRU eviction
		this.enforceMaxSize();

		return context;
	}

	/**
	 * Invalidate cache entries that contain the given URI.
	 *
	 * @param uri - URI of the changed document
	 */
	invalidateUri(uri: string): void {
		const normalizedUri = normalizeUri(uri);

		// Remove from shared documents cache
		this.sharedDocuments.delete(normalizedUri);

		// Invalidate any cached contexts that include this URI
		for (const [rootUri, cached] of this.cache) {
			if (
				rootUri === normalizedUri ||
				cached.documentHashes.has(normalizedUri)
			) {
				this.cache.delete(rootUri);
				this.logger.log(
					`[Invalidate] Removed cache for ${rootUri} due to change in ${uri}`,
				);
			}
		}
	}

	/**
	 * Clear the entire cache.
	 */
	clear(): void {
		this.cache.clear();
		this.sharedDocuments.clear();
		this.logger.log("[Clear] Cache cleared");
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
			(a, b) => a[1].lastValidated - b[1].lastValidated,
		);

		const toRemove = entries.slice(0, this.cache.size - this.maxSize);
		for (const [uri] of toRemove) {
			this.cache.delete(uri);
			this.logger.log(`[Evict] Removed oldest cache entry: ${uri}`);
		}
	}

	/**
	 * Get cache statistics for debugging.
	 */
	getStats(): {
		cachedContexts: number;
		sharedDocuments: number;
		maxSize: number;
	} {
		return {
			cachedContexts: this.cache.size,
			sharedDocuments: this.sharedDocuments.size,
			maxSize: this.maxSize,
		};
	}
}
