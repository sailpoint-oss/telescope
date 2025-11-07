import type { VfsHost } from "host";
import type { RefGraph, GraphNode } from "indexer";
import type { ParsedDocument } from "loader";
import { buildRefGraph } from "indexer";
import { DocumentTypeCache } from "./document-cache";
import { pathToFileURL } from "node:url";

/**
 * Find root documents that reference a partial document by traversing reverse $ref edges.
 */
export async function findRootDocumentsForPartial(
	partialUri: string,
	host: VfsHost,
	cache: DocumentTypeCache,
	existingDocs?: Map<string, ParsedDocument>,
	existingGraph?: RefGraph,
): Promise<string[]> {
	const rootUris = new Set<string>();
	const visited = new Set<string>();

	// Load the partial document if not already loaded (using cache)
	let docs = existingDocs || new Map<string, ParsedDocument>();
	if (!docs.has(partialUri)) {
		const doc = await cache.getDocument(partialUri, host);
		if (!doc) {
			// If we can't load it, return empty
			return [];
		}
		docs.set(partialUri, doc);
	}

	// Build graph if not provided
	let graph = existingGraph;
	if (!graph) {
		const { graph: builtGraph } = buildRefGraph({ docs, host });
		graph = builtGraph;
	}

	// Find the document-level node for the partial URI
	const partialDoc = docs.get(partialUri);
	if (!partialDoc) return [];

	// Create a node at the document root
	const partialNode: GraphNode = { uri: partialUri, pointer: "#" };

	// Traverse backwards through dependents to find root documents
	const queue: GraphNode[] = [partialNode];
	visited.add(`${partialUri}#`);

	while (queue.length > 0) {
		const current = queue.shift()!;
		if (!current) continue;

		// Check if current node is in a root document (using cache)
		const isRoot = await cache.isRootDocument(current.uri, host);
		if (isRoot) {
			rootUris.add(current.uri);
			continue; // Don't traverse further from root documents
		}

		// Ensure we have the document loaded for traversal
		if (!docs.has(current.uri)) {
			const doc = await cache.getDocument(current.uri, host);
			if (doc) {
				docs.set(current.uri, doc);
			}
		}

		// Get all dependents (documents that reference this node)
		const dependents = graph.dependentsOf(current);

		for (const dependent of dependents) {
			// If the dependent is from a different document, we need to load it (using cache)
			if (!docs.has(dependent.uri)) {
				const doc = await cache.getDocument(dependent.uri, host);
				if (doc) {
					docs.set(dependent.uri, doc);
				} else {
					// Skip if we can't load
					continue;
				}
			}

			const key = `${dependent.uri}#${dependent.pointer}`;
			if (!visited.has(key)) {
				visited.add(key);
				queue.push(dependent);

				// Also check document root level
				const docRootKey = `${dependent.uri}#`;
				if (!visited.has(docRootKey)) {
					visited.add(docRootKey);
					queue.push({ uri: dependent.uri, pointer: "#" });
				}
			}
		}
	}

	return Array.from(rootUris);
}


/**
 * Discover root OpenAPI documents in a workspace by using host.glob() to find
 * all YAML/JSON files and checking their content to determine if they're root documents.
 * Works for both CLI (NodeHost) and LSP (VolarFileSystemHost) environments.
 */
export async function discoverWorkspaceRoots(
	workspaceFolders: string[],
	host: VfsHost,
	cache: DocumentTypeCache,
): Promise<string[]> {
	const rootUris: string[] = [];

	// Use host.glob() to find all YAML/JSON files
	// This works for both CLI (NodeHost uses fast-glob) and LSP (VolarFileSystemHost)
	const globResults = await host.glob(["**/*.yaml", "**/*.yml", "**/*.json"]);

	// Process glob results
	for (const match of globResults) {
		const uri = match.startsWith("file://")
			? match
			: pathToFileURL(match).toString();

		try {
			const isRoot = await cache.isRootDocument(uri, host);
			if (isRoot) {
				rootUris.push(uri);
			}
		} catch (error) {
			// Skip files we can't load or parse (log for debugging)
			console.debug(
				`Skipping ${uri}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			continue;
		}
	}

	return rootUris;
}

