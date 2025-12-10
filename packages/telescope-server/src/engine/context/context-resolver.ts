import type { FileSystem } from "@volar/language-service";
import { buildRefGraph, findRefUris } from "../indexes/ref-graph.js";
import type { ProjectContext } from "../rules/types.js";
import type { ParsedDocument } from "../types.js";
import {
	identifyDocumentType,
	isPartialDocument,
	isRootDocument,
} from "../utils/document-type-utils.js";
import { normalizeUri } from "../utils/ref-utils.js";
import { DocumentTypeCache } from "./document-cache.js";
import {
	type MultiRootContext,
	resolveMultipleRoots,
} from "./multi-root-handler.js";
import { buildProjectContextForRoot } from "./project-builder.js";
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
	// Normalize input URI for consistent storage and lookup
	const normalizedUri = normalizeUri(uri);

	// Use provided cache or create a new one
	const docCache = cache || new DocumentTypeCache();

	// Load the document to determine its type (using cache)
	const doc = await docCache.getDocument(normalizedUri, fileSystem);
	if (!doc) {
		// If we can't load, return fragment mode with just the URI
		return {
			uris: [normalizedUri],
			mode: "fragment",
		};
	}

	const docType = identifyDocumentType(doc.ast);

	// Guard: Only lint known OpenAPI document types
	if (docType === "unknown") {
		return {
			uris: [normalizedUri],
			mode: "fragment",
		};
	}

	// Case 1: Root document
	if (isRootDocument(doc.ast)) {
		const context = projectCache
			? await projectCache.getOrBuild(
					normalizedUri,
					fileSystem,
					buildProjectContextForRoot,
				)
			: await buildProjectContextForRoot(normalizedUri, fileSystem);
		return {
			uris: Array.from(context.docs.keys()),
			mode: "project-aware",
			rootUris: [normalizedUri],
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
		const initialDocs = new Map<string, ParsedDocument>([[normalizedUri, doc]]);

		// Load discovered roots in parallel (using cache)
		const rootDocs = await Promise.all(
			Array.from(allRoots).map((rootUri) =>
				docCache.getDocument(rootUri, fileSystem).then((doc) => ({ rootUri, doc })),
			),
		);

		// Collect all referenced URIs from loaded roots
		const refsToLoad = new Set<string>();
		for (const { rootUri, doc: rootDoc } of rootDocs) {
			if (rootDoc) {
				initialDocs.set(rootUri, rootDoc);
				// Also collect all documents referenced by this root to build complete graph
				// This ensures reverse traversal can find the partial
				const refUris = findRefUris(rootDoc, rootUri);
				for (const refUri of refUris) {
					if (!initialDocs.has(refUri)) {
						refsToLoad.add(refUri);
					}
				}
			}
		}

		// Load all referenced documents in parallel
		const refDocs = await Promise.all(
			Array.from(refsToLoad).map((refUri) =>
				docCache.getDocument(refUri, fileSystem).then((doc) => ({ refUri, doc })),
			),
		);

		for (const { refUri, doc: refDoc } of refDocs) {
			if (refDoc) {
				initialDocs.set(refUri, refDoc);
			}
		}

		// Build graph from initial docs
		const { graph } = buildRefGraph({ docs: initialDocs });

		// Try to find roots that reference this partial (using cache)
		const foundRoots = await findRootDocumentsForPartial(
			normalizedUri,
			fileSystem,
			docCache,
			initialDocs,
			graph,
		);

		if (foundRoots.length === 0) {
			// No root found - fragment mode
			return {
				uris: [normalizedUri],
				mode: "fragment",
			};
		} else if (foundRoots.length === 1) {
			// Single root found - project-aware mode
			const rootUri = foundRoots[0];
			if (!rootUri) {
				return {
					uris: [normalizedUri],
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
			if (!context.docs.has(normalizedUri)) {
				context.docs.set(normalizedUri, doc);
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
				if (!ctx.context.docs.has(normalizedUri)) {
					ctx.context.docs.set(normalizedUri, doc);
					// If using cache, invalidate since we modified the context
					if (projectCache) {
						projectCache.invalidate(ctx.rootUri);
					}
				}
			}
			const allUris = new Set<string>([normalizedUri]);
			for (const ctx of multiRootContexts) {
				ctx.uris.forEach((u) => {
					allUris.add(u);
				});
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
		uris: [normalizedUri],
		mode: "fragment",
	};
}
