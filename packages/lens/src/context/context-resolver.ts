import type { FileSystem } from "@volar/language-service";
import type { ProjectContext } from "../rules/types.js";
import {
	identifyDocumentType,
	isPartialDocument,
	isRootDocument,
} from "shared/document-type-utils";
import { buildIndex } from "../indexes/project-index.js";
import { buildRefGraph, findRefUris } from "../indexes/ref-graph.js";
import { loadDocument } from "../load-document.js";
import type { ParsedDocument } from "../types.js";
import { DocumentTypeCache } from "./document-cache.js";
import {
	type MultiRootContext,
	resolveMultipleRoots,
} from "./multi-root-handler.js";
import type { ProjectContextCache } from "./project-cache.js";
import {
	discoverWorkspaceRoots,
	findRootDocumentsForPartial,
} from "./root-discovery.js";

export type LintingMode = "project-aware" | "fragment" | "multi-root";

export interface LintingContext {
	uris: string[];
	mode: LintingMode;
	rootUris?: string[];
	context?: ProjectContext;
	multiRootContexts?: MultiRootContext[];
}

/**
 * Resolve the appropriate linting context for a document URI.
 *
 * Strategy:
 * 1. If root document: load root + all referenced docs → project-aware mode
 * 2. If partial document: try to find root via reverse $ref traversal
 *    - If single root found: load root + all referenced docs → project-aware mode
 *    - If multiple roots found: build separate contexts for each → multi-root mode
 *    - If no root found: use fragment mode (single document, no wrapping)
 */
export async function resolveLintingContext(
	uri: string,
	fileSystem: FileSystem,
	workspaceFolders: string[] = [],
	cache?: DocumentTypeCache,
	projectCache?: ProjectContextCache,
): Promise<LintingContext> {
	// Use provided cache or create a new one
	const docCache = cache || new DocumentTypeCache();

	// Load the document to determine its type (using cache)
	const doc = await docCache.getDocument(uri, fileSystem);
	if (!doc) {
		// If we can't load, return fragment mode with just the URI
		return {
			uris: [uri],
			mode: "fragment",
		};
	}

	const docType = identifyDocumentType(doc.ast);

	// Guard: Only lint known OpenAPI document types
	if (docType === "unknown") {
		return {
			uris: [uri],
			mode: "fragment",
		};
	}

	// Case 1: Root document
	if (isRootDocument(doc.ast)) {
		const context = projectCache
			? await projectCache.getOrBuild(uri, fileSystem, buildProjectContextForRoot)
			: await buildProjectContextForRoot(uri, fileSystem);
		return {
			uris: Array.from(context.docs.keys()),
			mode: "project-aware",
			rootUris: [uri],
			context,
		};
	}

	// Case 2: Partial document - try to find root(s)
	if (isPartialDocument(doc.ast)) {
		// Discover workspace roots by crawling and checking content
		const workspaceRoots = await discoverWorkspaceRoots(
			workspaceFolders,
			fileSystem,
			docCache,
		);

		const allRoots = new Set<string>(workspaceRoots);

		// Build a graph from all known documents to find reverse references
		// Start with the partial and any discovered roots
		const initialDocs = new Map<string, ParsedDocument>([[uri, doc]]);

		// Load discovered roots (using cache)
		for (const rootUri of allRoots) {
			const rootDoc = await docCache.getDocument(rootUri, fileSystem);
			if (rootDoc) {
				initialDocs.set(rootUri, rootDoc);
				// Also load all documents referenced by this root to build complete graph
				// This ensures reverse traversal can find the partial
				const refUris = findRefUris(rootDoc, rootUri);
				for (const refUri of refUris) {
					if (!initialDocs.has(refUri)) {
						const refDoc = await docCache.getDocument(refUri, fileSystem);
						if (refDoc) {
							initialDocs.set(refUri, refDoc);
						}
					}
				}
			}
		}

		// Build graph from initial docs
		const { graph } = buildRefGraph({ docs: initialDocs });

		// Try to find roots that reference this partial (using cache)
		const foundRoots = await findRootDocumentsForPartial(
			uri,
			fileSystem,
			docCache,
			initialDocs,
			graph,
		);

		if (foundRoots.length === 0) {
			// No root found - fragment mode
			return {
				uris: [uri],
				mode: "fragment",
			};
		} else if (foundRoots.length === 1) {
			// Single root found - project-aware mode
			const rootUri = foundRoots[0];
			if (!rootUri) {
				return {
					uris: [uri],
					mode: "fragment",
				};
			}
			const context = projectCache
				? await projectCache.getOrBuild(
						rootUri,
						fileSystem,
						buildProjectContextForRoot,
					)
				: await buildProjectContextForRoot(rootUri, fileSystem);
			// Ensure the partial is included
			if (!context.docs.has(uri)) {
				context.docs.set(uri, doc);
				// If using cache, invalidate since we modified the context
				if (projectCache) {
					projectCache.invalidate(rootUri);
				}
			}
			return {
				uris: Array.from(context.docs.keys()),
				mode: "project-aware",
				rootUris: [rootUri],
				context,
			};
		} else {
			// Multiple roots found - multi-root mode
			const multiRootContexts = await resolveMultipleRoots(
				foundRoots,
				fileSystem,
				projectCache,
			);
			// Ensure the partial is included in all contexts
			for (const ctx of multiRootContexts) {
				if (!ctx.context.docs.has(uri)) {
					ctx.context.docs.set(uri, doc);
					// If using cache, invalidate since we modified the context
					if (projectCache) {
						projectCache.invalidate(ctx.rootUri);
					}
				}
			}
			const allUris = new Set<string>([uri]);
			for (const ctx of multiRootContexts) {
				ctx.uris.forEach((u) => allUris.add(u));
			}
			return {
				uris: Array.from(allUris),
				mode: "multi-root",
				rootUris: foundRoots,
				multiRootContexts,
			};
		}
	}

	// Case 3: Unknown document type - fragment mode
	return {
		uris: [uri],
		mode: "fragment",
	};
}

/**
 * Build a project context for a single root document.
 * Loads the root and all documents it references via forward $ref traversal.
 */
async function buildProjectContextForRoot(
	rootUri: string,
	fileSystem: FileSystem,
): Promise<ProjectContext> {
	const docs = new Map<string, ParsedDocument>();
	const toLoad = new Set<string>([rootUri]);
	const loaded = new Set<string>();

	// Load root and all referenced documents
	while (toLoad.size > 0) {
		const uri = toLoad.values().next().value;
		if (!uri) break;
		toLoad.delete(uri);
		loaded.add(uri);

		if (docs.has(uri)) continue;

		try {
			const doc = await loadDocument({ fileSystem, uri });
			docs.set(uri, doc);

			// Find all $refs in this document and resolve them
			// We'll use buildRefGraph to do the actual traversal, but we need
			// to collect all referenced URIs first
			const refs = findRefUris(doc, uri);
			for (const refUri of refs) {
				if (!loaded.has(refUri) && !toLoad.has(refUri)) {
					toLoad.add(refUri);
				}
			}
		} catch (error) {
			// Continue - the file will be marked as unresolved when the resolver
			// tries to access it, which will trigger an unresolved-ref diagnostic
			// with a clear error message
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
