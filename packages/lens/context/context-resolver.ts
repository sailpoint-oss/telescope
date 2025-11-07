import type { VfsHost } from "host";
import type { ParsedDocument } from "loader";
import type { ProjectContext } from "engine";
import {
	identifyDocumentType,
	isRootDocument,
	isPartialDocument,
} from "loader";
import {
	findRootDocumentsForPartial,
	discoverWorkspaceRoots,
} from "./root-discovery";
import {
	resolveMultipleRoots,
	type MultiRootContext,
} from "./multi-root-handler";
import { DocumentTypeCache } from "./document-cache";
import { ProjectContextCache } from "./project-cache";
import { loadDocument } from "loader";
import { buildRefGraph, findRefUris } from "indexer";
import { buildIndex } from "indexer";

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
	host: VfsHost,
	workspaceFolders: string[] = [],
	configEntrypoints: string[] = [],
	cache?: DocumentTypeCache,
	projectCache?: ProjectContextCache,
): Promise<LintingContext> {
	console.log(`[Context Resolution] Starting context resolution for: ${uri}`);
	// Use provided cache or create a new one
	const docCache = cache || new DocumentTypeCache();

	// Load the document to determine its type (using cache)
	const doc = await docCache.getDocument(uri, host);
	if (!doc) {
		console.log(
			`[Context Resolution] Cannot load document, using fragment mode: ${uri}`,
		);
		// If we can't load, return fragment mode with just the URI
		return {
			uris: [uri],
			mode: "fragment",
		};
	}

	const docType = identifyDocumentType(doc.ast);
	console.log(
		`[Context Resolution] Document type identified: ${docType} for ${uri}`,
	);

	// Guard: Only lint known OpenAPI document types
	if (docType === "unknown") {
		console.log(
			`[Context Resolution] Skipping linting for unknown document type: ${uri}`,
		);
		return {
			uris: [uri],
			mode: "fragment",
		};
	}

	// Case 1: Root document
	if (isRootDocument(doc.ast)) {
		console.log(
			`[Context Resolution] Document is root, building project context: ${uri}`,
		);
		const context = projectCache
			? await projectCache.getOrBuild(uri, host, buildProjectContextForRoot)
			: await buildProjectContextForRoot(uri, host);
		console.log(
			`[Context Resolution] Project context built - ${context.docs.size} document(s) loaded`,
		);
		return {
			uris: Array.from(context.docs.keys()),
			mode: "project-aware",
			rootUris: [uri],
			context,
		};
	}

	// Case 2: Partial document - try to find root(s)
	if (isPartialDocument(doc.ast)) {
		console.log(
			`[Context Resolution] Document is partial, searching for root(s): ${uri}`,
		);
		// First, try to discover workspace roots by crawling and checking content
		const workspaceRoots = await discoverWorkspaceRoots(
			workspaceFolders,
			host,
			docCache,
		);
		console.log(
			`[Context Resolution] Discovered ${workspaceRoots.length} workspace root(s)`,
		);

		// Also check config entrypoints (validate they're roots by checking content)
		const validatedEntrypoints: string[] = [];
		for (const entrypoint of configEntrypoints) {
			if (await docCache.isRootDocument(entrypoint, host)) {
				validatedEntrypoints.push(entrypoint);
			}
		}
		console.log(
			`[Context Resolution] Validated ${validatedEntrypoints.length} config entrypoint(s)`,
		);

		const allRoots = new Set<string>([
			...workspaceRoots,
			...validatedEntrypoints,
		]);
		console.log(`[Context Resolution] Total ${allRoots.size} root(s) found`);

		// Build a graph from all known documents to find reverse references
		// Start with the partial and any discovered roots
		const initialDocs = new Map<string, ParsedDocument>([[uri, doc]]);

		// Load discovered roots (using cache)
		for (const rootUri of allRoots) {
			const rootDoc = await docCache.getDocument(rootUri, host);
			if (rootDoc) {
				initialDocs.set(rootUri, rootDoc);
				// Also load all documents referenced by this root to build complete graph
				// This ensures reverse traversal can find the partial
				const refUris = findRefUris(rootDoc, host, rootUri);
				for (const refUri of refUris) {
					if (!initialDocs.has(refUri)) {
						const refDoc = await docCache.getDocument(refUri, host);
						if (refDoc) {
							initialDocs.set(refUri, refDoc);
						}
					}
				}
			}
		}

		// Build graph from initial docs
		const { graph } = buildRefGraph({ docs: initialDocs, host });

		// Try to find roots that reference this partial (using cache)
		console.log(
			`[Context Resolution] Searching for roots that reference partial: ${uri}`,
		);
		const foundRoots = await findRootDocumentsForPartial(
			uri,
			host,
			docCache,
			initialDocs,
			graph,
		);
		console.log(
			`[Context Resolution] Found ${
				foundRoots.length
			} root(s) referencing partial: ${foundRoots.join(", ")}`,
		);

		if (foundRoots.length === 0) {
			// No root found - fragment mode
			console.log(
				`[Context Resolution] No root found, using fragment mode: ${uri}`,
			);
			return {
				uris: [uri],
				mode: "fragment",
			};
		} else if (foundRoots.length === 1) {
			// Single root found - project-aware mode
			const rootUri = foundRoots[0];
			if (!rootUri) {
				console.log(
					`[Context Resolution] Root URI is null, using fragment mode: ${uri}`,
				);
				return {
					uris: [uri],
					mode: "fragment",
				};
			}
			console.log(
				`[Context Resolution] Single root found, building project context: ${rootUri}`,
			);
			const context = projectCache
				? await projectCache.getOrBuild(rootUri, host, buildProjectContextForRoot)
				: await buildProjectContextForRoot(rootUri, host);
			// Ensure the partial is included
			if (!context.docs.has(uri)) {
				context.docs.set(uri, doc);
				// If using cache, invalidate since we modified the context
				if (projectCache) {
					projectCache.invalidate(rootUri);
				}
			}
			console.log(
				`[Context Resolution] Project context built with ${context.docs.size} document(s)`,
			);
			return {
				uris: Array.from(context.docs.keys()),
				mode: "project-aware",
				rootUris: [rootUri],
				context,
			};
		} else {
			// Multiple roots found - multi-root mode
			console.log(
				`[Context Resolution] Multiple roots found, using multi-root mode: ${foundRoots.join(", ")}`,
			);
			const multiRootContexts = await resolveMultipleRoots(
				foundRoots,
				host,
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
			console.log(
				`[Context Resolution] Multi-root context built with ${multiRootContexts.length} context(s), ${allUris.size} total document(s)`,
			);
			return {
				uris: Array.from(allUris),
				mode: "multi-root",
				rootUris: foundRoots,
				multiRootContexts,
			};
		}
	}

	// Case 3: Unknown document type - fragment mode
	console.log(
		`[Context Resolution] Unknown document type, using fragment mode: ${uri}`,
	);
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
	host: VfsHost,
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
			const doc = await loadDocument({ host, uri });
			docs.set(uri, doc);

			// Find all $refs in this document and resolve them
			// We'll use buildRefGraph to do the actual traversal, but we need
			// to collect all referenced URIs first
			const refs = findRefUris(doc, host, uri);
			for (const refUri of refs) {
				if (!loaded.has(refUri) && !toLoad.has(refUri)) {
					toLoad.add(refUri);
				}
			}
		} catch (error) {
			// Log the error but continue - the file will be marked as unresolved
			// when the resolver tries to access it, which will trigger an
			// unresolved-ref diagnostic with a clear error message
			console.log(
				`[Context Resolution] Failed to load referenced file ${uri}: ` +
					`${error instanceof Error ? error.message : String(error)}. ` +
					`This will be reported as an unresolved $ref if referenced.`
			);
			continue;
		}
	}

	// Build graph and index
	const { graph, resolver, rootResolver } = buildRefGraph({ docs, host });
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


