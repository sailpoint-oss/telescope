import type { ProjectContext } from "engine";
import type { VfsHost } from "host";
import { buildIndex, buildRefGraph } from "indexer";
import type { ParsedDocument } from "loader";
import { loadDocument } from "loader";
import type { ProjectContextCache } from "./project-cache";

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
	host: VfsHost,
	projectCache?: ProjectContextCache,
): Promise<MultiRootContext[]> {
	const contexts: MultiRootContext[] = [];

	for (const rootUri of rootUris) {
		try {
			const context = projectCache
				? await projectCache.getOrBuild(
						rootUri,
						host,
						buildProjectContextForRoot,
					)
				: await buildProjectContextForRoot(rootUri, host);
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

			// Find all $refs in this document and add targets to load queue
			const refs = findRefsInDocument(doc, host);
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
					`This will be reported as an unresolved $ref if referenced.`,
			);
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

/**
 * Find all $ref target URIs in a document.
 */
function findRefsInDocument(doc: ParsedDocument, host: VfsHost): string[] {
	const refUris = new Set<string>();

	function traverse(value: unknown): void {
		if (value && typeof value === "object") {
			if (Array.isArray(value)) {
				value.forEach(traverse);
			} else {
				const obj = value as Record<string, unknown>;
				if (typeof obj.$ref === "string") {
					const ref = obj.$ref;
					const [refPath] = ref.split("#");
					// If refPath is empty, it's a same-document reference - skip
					// We only want external references
					if (refPath?.trim()) {
						// Resolve relative to document URI
						const resolvedUri = host.resolve(doc.uri, refPath);
						refUris.add(resolvedUri);
					}
				}
				for (const val of Object.values(obj)) {
					traverse(val);
				}
			}
		}
	}

	traverse(doc.ast);
	return Array.from(refUris);
}
