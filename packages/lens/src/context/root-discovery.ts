import { pathToFileURL } from "node:url";
import type { FileSystem } from "@volar/language-service";
import type { GraphNode, RefGraph } from "../indexes/graph-types.js";
import { buildRefGraph } from "../indexes/ref-graph.js";
import { globFiles } from "shared/file-system-utils";
import { URI } from "vscode-uri";
import type { ParsedDocument } from "../types.js";
import type { DocumentTypeCache } from "./document-cache.js";

/**
 * Find root documents that reference a partial document by traversing reverse $ref edges.
 */
export async function findRootDocumentsForPartial(
  partialUri: string,
  fileSystem: FileSystem,
  cache: DocumentTypeCache,
  existingDocs?: Map<string, ParsedDocument>,
  existingGraph?: RefGraph
): Promise<string[]> {
  const rootUris = new Set<string>();
  const visited = new Set<string>();

  // Load the partial document if not already loaded (using cache)
  const docs = existingDocs || new Map<string, ParsedDocument>();
  if (!docs.has(partialUri)) {
    const doc = await cache.getDocument(partialUri, fileSystem);
    if (!doc) {
      // If we can't load it, return empty
      return [];
    }
    docs.set(partialUri, doc);
  }

  // Build graph if not provided
  let graph = existingGraph;
  if (!graph) {
    const { graph: builtGraph } = buildRefGraph({ docs });
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
    const current = queue.shift();
    if (!current) continue;

    // Check if current node is in a root document (using cache)
    const isRoot = await cache.isRootDocument(current.uri, fileSystem);
    if (isRoot) {
      rootUris.add(current.uri);
      continue; // Don't traverse further from root documents
    }

    // Ensure we have the document loaded for traversal
    if (!docs.has(current.uri)) {
      const doc = await cache.getDocument(current.uri, fileSystem);
      if (doc) {
        docs.set(current.uri, doc);
      }
    }

    // Get all dependents (documents that reference this node)
    const dependents = graph.dependentsOf(current);

    for (const dependent of dependents) {
      // If the dependent is from a different document, we need to load it (using cache)
      if (!docs.has(dependent.uri)) {
        const doc = await cache.getDocument(dependent.uri, fileSystem);
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
 * Discover root OpenAPI documents in a workspace by using FileSystem to find
 * all YAML/JSON files and checking their content to determine if they're root documents.
 * Works for both CLI and LSP environments using Volar's FileSystem.
 */
export async function discoverWorkspaceRoots(
  workspaceFolders: string[],
  fileSystem: FileSystem,
  cache: DocumentTypeCache
): Promise<string[]> {
  const rootUris: string[] = [];

  // Convert workspace folder strings to URI objects
  const workspaceFolderUris = workspaceFolders.map((folder) =>
    folder.startsWith("file://") ? URI.parse(folder) : URI.file(folder)
  );

  // Use shared globFiles utility to find all YAML/JSON files
  const globResults = await globFiles(
    fileSystem,
    ["**/*.yaml", "**/*.yml", "**/*.json"],
    workspaceFolderUris
  );

  // Process glob results
  for (const match of globResults) {
    const uri = match.startsWith("file://")
      ? match
      : pathToFileURL(match).toString();

    try {
      // Check document type first - skip unknown types
      const docType = await cache.getDocumentType(uri, fileSystem);
      if (docType === "unknown") {
        // Skip unknown file schemas - don't treat them as root documents
        continue;
      }

      const isRoot = await cache.isRootDocument(uri, fileSystem);
      if (isRoot) {
        rootUris.push(uri);
      }
    } catch (error) {
      // Skip files we can't load or parse (log for debugging)
      console.debug(
        `Skipping ${uri}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return rootUris;
}
