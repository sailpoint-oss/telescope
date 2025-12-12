import type { FileSystem } from "../fs-types.js";
import type { ProjectContext } from "../rules/types.js";
import { buildProjectContextForRoot } from "./project-builder.js";
import type { ProjectContextCache } from "./project-cache.js";

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
