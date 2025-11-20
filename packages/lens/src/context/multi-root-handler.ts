import type { FileSystem } from "@volar/language-service";
import type { ProjectContext } from "../rules/types.js";
import { buildIndex } from "../indexes/project-index.js";
import { buildRefGraph, findRefUris } from "../indexes/ref-graph.js";
import { resolveRef } from "shared/ref-utils";
import { loadDocument } from "../load-document.js";
import type { ParsedDocument } from "../types.js";
import type { ProjectContextCache } from "./project-cache.js";
import { URI } from "vscode-uri";

/**
 * Context for a single root document and all its referenced documents.
 */
export interface MultiRootContext {
	rootUri: string;
	context: ProjectContext;
	uris: string[]; // All URIs in this context
}

/**
 * Resolve multiple root documents into separate project contexts.
 * Each context includes the root and all documents it references.
 */
export async function resolveMultipleRoots(
	rootUris: string[],
	fileSystem: FileSystem,
	projectCache?: ProjectContextCache,
): Promise<MultiRootContext[]> {
	const contexts: MultiRootContext[] = [];

	for (const rootUri of rootUris) {
		try {
			const context = projectCache
				? await projectCache.getOrBuild(
						rootUri,
						fileSystem,
						buildProjectContextForRoot,
					)
				: await buildProjectContextForRoot(rootUri, fileSystem);
			contexts.push({
				rootUri,
				context,
				uris: Array.from(context.docs.keys()),
			});
		} catch {}
	}

	return contexts;
}

/**
 * Find shared schemas/components across multiple root contexts.
 */
export function findSharedSchemas(
	contexts: MultiRootContext[],
): Map<string, string[]> {
	const sharedMap = new Map<string, string[]>();

	// Track which roots reference each document
	const docToRoots = new Map<string, Set<string>>();

	for (const ctx of contexts) {
		for (const uri of ctx.uris) {
			if (!docToRoots.has(uri)) {
				docToRoots.set(uri, new Set());
			}
			if (!docToRoots.get(uri)) continue;
			docToRoots.get(uri)?.add(ctx.rootUri);
		}
	}

	// Find documents referenced by multiple roots
	for (const [uri, roots] of docToRoots.entries()) {
		if (roots.size > 1) {
			sharedMap.set(uri, Array.from(roots));
		}
	}

	return sharedMap;
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

			// Find all $refs in this document and add targets to load queue
			const refs = findRefUris(doc, uri);
			for (const refUri of refs) {
				if (!loaded.has(refUri) && !toLoad.has(refUri)) {
					toLoad.add(refUri);
				}
			}
		} catch (error) {
			// Log the error but continue - the file will be marked as unresolved
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
