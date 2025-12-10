/**
 * WorkspaceIndex - manages workspace-wide indexes for cross-document features.
 *
 * This class replaces the old Core class. Document data now lives on VirtualCode.
 * WorkspaceIndex manages:
 * - GraphIndex (tracks $ref relationships between documents)
 * - OperationIdIndex (tracks operationId occurrences across documents)
 * - Affected URI tracking for incremental diagnostics
 * - Result ID caching for diagnostic deduplication
 * - Project model (dependency trees from root documents)
 *
 * The "project model" concept:
 * - Each root document (file with `openapi: x.x.x`) forms a project tree
 * - The tree includes all fragments referenced via $ref
 * - When a fragment changes, all root documents using it are affected
 * - This mirrors how TypeScript tracks module dependencies
 *
 * @module lsp/core/workspace-index
 */

import type { Range } from "vscode-languageserver-protocol";
import type { AtomIndex, IRDocument, Loc } from "../../engine/index.js";
import {
	GraphIndex,
	getValueAtPointerIR,
	isRootDocument,
	OperationIdIndex,
} from "../../engine/index.js";
import { getLineCol } from "../../engine/utils/line-offset-utils.js";
import type { OpenAPIVirtualCode } from "../languages/virtualCodes/openapi-virtual-code.js";
import type { telescopeVolarContext } from "../workspace/context.js";

/**
 * WorkspaceIndex manages workspace-wide indexes without per-document caching.
 *
 * Document data (AST, IR, atoms) is stored on VirtualCode instances and managed
 * by Volar's native cache. This class only maintains cross-document indexes
 * that need to track relationships across the entire workspace.
 *
 * @example
 * ```typescript
 * const index = new WorkspaceIndex(context);
 *
 * // Register a VirtualCode when created
 * index.registerVirtualCode(uri, virtualCode);
 *
 * // Get linked documents for cross-file features
 * const linked = index.getLinkedUris(uri);
 *
 * // Access workspace-wide indexes
 * const graph = index.getGraphIndex();
 * const opIds = index.getOpIdIndex();
 * ```
 */
export class WorkspaceIndex {
	private readonly graphIndex = new GraphIndex();
	private readonly opIdIndex = new OperationIdIndex();
	private readonly affectedUris = new Set<string>();
	private readonly resultIdCache = new Map<string, string>();

	constructor(private readonly context: telescopeVolarContext) {}

	/**
	 * Register a VirtualCode with the workspace index.
	 *
	 * This is called from the language plugin when an OpenAPIVirtualCode is
	 * created or updated. It extracts IR and atoms to update workspace indexes.
	 *
	 * @param uri - Document URI
	 * @param vc - The OpenAPIVirtualCode instance
	 */
	registerVirtualCode(uri: string, vc: OpenAPIVirtualCode): void {
		try {
			const ir = vc.getIR(uri);
			const atoms = vc.getAtoms(uri);

			// Update graph index with $ref relationships
			this.graphIndex.updateFromIR(uri, ir.root);

			// Update operationId index
			const changedOpIds = this.opIdIndex.updateForUri(uri, atoms.operations);

			// Track root documents
			if (isRootDocument(getValueAtPointerIR(ir, "#"))) {
				this.context.addRootDocument(uri);
			}

			// Compute affected URIs for incremental updates
			this.computeAffectedUris(uri, changedOpIds);

			// Clear result cache for this URI
			this.resultIdCache.delete(uri);
		} catch (error) {
			// Log but don't throw - graceful degradation
			this.context
				.getLogger()
				.error(
					`[WorkspaceIndex] Failed to register VirtualCode for ${uri}: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
		}
	}

	/**
	 * Unregister a document from the workspace index.
	 *
	 * Called when a file is deleted or closed.
	 *
	 * @param uri - Document URI to unregister
	 */
	unregisterDocument(uri: string): void {
		this.graphIndex.removeEdgesForUri(uri);
		this.opIdIndex.updateForUri(uri, []);
		this.resultIdCache.delete(uri);
		this.context.removeRootDocument(uri);
	}

	/**
	 * Get all URIs linked to the given URI (dependencies and dependents).
	 *
	 * @param uri - Document URI
	 * @returns Array of linked URIs
	 */
	getLinkedUris(uri: string): string[] {
		if (!uri) return [];
		try {
			const deps = this.graphIndex.dependenciesOf(uri) ?? [];
			const rdeps = this.graphIndex.dependentsOfUri(uri) ?? [];
			return Array.from(new Set([...deps, ...rdeps])).filter(Boolean);
		} catch {
			return [];
		}
	}

	/**
	 * Get the graph index for $ref relationships.
	 */
	getGraphIndex(): GraphIndex {
		return this.graphIndex;
	}

	/**
	 * Get the operation ID index.
	 */
	getOpIdIndex(): OperationIdIndex {
		return this.opIdIndex;
	}

	/**
	 * Get affected URIs and clear the set.
	 *
	 * Used for incremental diagnostics to determine which files need re-validation.
	 */
	getAffectedUris(): string[] {
		const uris = Array.from(this.affectedUris);
		this.affectedUris.clear();
		return uris;
	}

	/**
	 * Mark URIs as affected.
	 *
	 * @param uris - URIs to mark as affected
	 */
	markAffected(...uris: string[]): void {
		for (const uri of uris) {
			this.affectedUris.add(uri);
		}
	}

	/**
	 * Get or compute resultId for diagnostics.
	 *
	 * ResultId is stable for unchanged diagnostics, used by LSP to skip
	 * sending unchanged diagnostic reports.
	 *
	 * @param uri - Document URI
	 * @param diagnosticsHash - Hash of the diagnostics
	 * @returns Stable result ID
	 */
	getResultId(uri: string, diagnosticsHash: string): string {
		const resultIdKey = diagnosticsHash;

		const cached = this.resultIdCache.get(uri);
		if (cached === resultIdKey) {
			return cached;
		}

		this.resultIdCache.set(uri, resultIdKey);
		return resultIdKey;
	}

	/**
	 * Clear all indexes and caches.
	 */
	clear(): void {
		this.graphIndex.clear();
		this.opIdIndex.clear();
		this.affectedUris.clear();
		this.resultIdCache.clear();
	}

	/**
	 * Compute which URIs are affected by a document change.
	 */
	private computeAffectedUris(uri: string, changedOpIds: Set<string>): void {
		// This document is affected
		this.affectedUris.add(uri);

		// Dependents are affected (files that reference this one)
		for (const dep of this.graphIndex.dependentsOfUri(uri)) {
			this.affectedUris.add(dep);
		}

		// URIs with changed operationIds are affected
		for (const opId of changedOpIds) {
			for (const occ of this.opIdIndex.getOccurrences(opId)) {
				this.affectedUris.add(occ.uri);
			}
		}
	}

	// =========================================================================
	// Project Model Methods
	// =========================================================================

	/**
	 * Get the complete dependency tree for a root document.
	 * This returns all files that the root document depends on (directly or transitively).
	 *
	 * This is like TypeScript's "project files" - all files that are part of a compilation unit.
	 *
	 * @param rootUri - URI of the root document
	 * @returns Set of all URIs in the dependency tree (including the root)
	 */
	getRootDependencyTree(rootUri: string): Set<string> {
		const tree = new Set<string>();
		tree.add(rootUri);

		// BFS to collect all dependencies
		const queue = [rootUri];
		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;

			const deps = this.graphIndex.dependenciesOf(current) ?? [];
			for (const dep of deps) {
				if (!tree.has(dep)) {
					tree.add(dep);
					queue.push(dep);
				}
			}
		}

		return tree;
	}

	/**
	 * Get all root documents that are affected by a change to the given file.
	 * A root is affected if it depends on the changed file (directly or transitively).
	 *
	 * @param uri - URI of the changed file
	 * @returns Array of root document URIs that are affected
	 */
	getRootsAffectedByFile(uri: string): string[] {
		const allRoots = this.context.getRootDocumentUris();
		const affectedRoots: string[] = [];

		for (const rootUri of allRoots) {
			const tree = this.getRootDependencyTree(rootUri);
			if (tree.has(uri)) {
				affectedRoots.push(rootUri);
			}
		}

		return affectedRoots;
	}

	/**
	 * Get all files that are part of any project (root document dependency tree).
	 * Files not in any tree are "orphans" that aren't referenced by any root.
	 *
	 * @returns Set of all URIs that are part of at least one project
	 */
	getAllProjectFiles(): Set<string> {
		const allFiles = new Set<string>();
		const allRoots = this.context.getRootDocumentUris();

		for (const rootUri of allRoots) {
			const tree = this.getRootDependencyTree(rootUri);
			for (const uri of tree) {
				allFiles.add(uri);
			}
		}

		return allFiles;
	}

	/**
	 * Get orphan files - files that are known OpenAPI but not referenced by any root.
	 * These might be standalone fragments or files that need to be explicitly included.
	 *
	 * @param knownFiles - All known OpenAPI files (from client scan)
	 * @returns Array of URIs that are not part of any project tree
	 */
	getOrphanFiles(knownFiles: string[]): string[] {
		const projectFiles = this.getAllProjectFiles();
		return knownFiles.filter((uri) => !projectFiles.has(uri));
	}

	/**
	 * Get a summary of the project model for debugging/status reporting.
	 */
	getProjectSummary(): {
		rootCount: number;
		totalFilesInTrees: number;
		rootTrees: Array<{ root: string; fileCount: number }>;
	} {
		const allRoots = this.context.getRootDocumentUris();
		const rootTrees: Array<{ root: string; fileCount: number }> = [];
		const allFilesInTrees = new Set<string>();

		for (const rootUri of allRoots) {
			const tree = this.getRootDependencyTree(rootUri);
			rootTrees.push({
				root: rootUri,
				fileCount: tree.size,
			});
			for (const uri of tree) {
				allFilesInTrees.add(uri);
			}
		}

		return {
			rootCount: allRoots.length,
			totalFilesInTrees: allFilesInTrees.size,
			rootTrees,
		};
	}
}
