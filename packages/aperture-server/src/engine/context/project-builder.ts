/**
 * Project Context Builder Module
 *
 * Provides shared functionality for building ProjectContext instances
 * from root documents. Used by both context-resolver and multi-root-handler.
 *
 * @module context/project-builder
 */

import type { FileSystem } from "@volar/language-service";
import { buildIndex } from "../indexes/project-index.js";
import { buildRefGraph, findRefUris } from "../indexes/ref-graph.js";
import { loadDocument } from "../load-document.js";
import type { ProjectContext } from "../rules/types.js";
import type { ParsedDocument } from "../types.js";
import { normalizeUri } from "../utils/ref-utils.js";

/**
 * Build a project context for a single root document.
 * Loads the root and all documents it references via forward $ref traversal.
 * Uses parallel loading for better performance.
 *
 * @param rootUri - URI of the root document
 * @param fileSystem - Volar file system for reading files
 * @returns Complete ProjectContext with all referenced documents
 */
export async function buildProjectContextForRoot(
	rootUri: string,
	fileSystem: FileSystem,
): Promise<ProjectContext> {
	const docs = new Map<string, ParsedDocument>();
	// Normalize root URI for consistent storage and lookup
	const normalizedRootUri = normalizeUri(rootUri);
	const toLoad = new Set<string>([normalizedRootUri]);
	const loaded = new Set<string>();

	// Load root and all referenced documents in waves (parallel within each wave)
	while (toLoad.size > 0) {
		// Mark all current URIs as being loaded
		const currentBatch = Array.from(toLoad);
		for (const uri of currentBatch) {
			toLoad.delete(uri);
			loaded.add(uri);
		}

		// Filter out already loaded docs
		const urisToLoad = currentBatch.filter((uri) => !docs.has(uri));

		// Load all documents in current batch in parallel
		const loadResults = await Promise.all(
			urisToLoad.map(async (uri) => {
				try {
					const doc = await loadDocument({ fileSystem, uri });
					return { uri, doc, error: null };
				} catch (error) {
					// Log the error for debugging, then continue
					// The file will be marked as unresolved when the resolver
					// tries to access it, which will trigger an unresolved-ref diagnostic
					console.warn(
						`[ref-graph] Failed to load document ${uri}:`,
						error instanceof Error ? error.message : error,
					);
					return { uri, doc: null, error };
				}
			}),
		);

		// Process results and collect new refs for next wave
		for (const { doc } of loadResults) {
			if (doc) {
				// Use the document's normalized URI as the key (loadDocument normalizes it)
				docs.set(doc.uri, doc);

				// Find all $refs in this document and add targets to load queue
				// findRefUris returns normalized URIs
				const refs = findRefUris(doc, doc.uri);
				for (const refUri of refs) {
					if (!loaded.has(refUri) && !toLoad.has(refUri)) {
						toLoad.add(refUri);
					}
				}
			}
		}
	}

	// Build graph and index
	const { graph, resolver, rootResolver } = buildRefGraph({ docs });
	const index = buildIndex({ docs, graph, resolver });

	return {
		docs,
		graph,
		resolver,
		rootResolver,
		index,
		version: index.version,
	};
}
