/**
 * GraphIndex - tracks $ref dependencies and reverse dependencies.
 */

import { URI } from "vscode-uri";
import type { IRNode } from "../ir/types.js";
import { resolveRef } from "../utils/ref-utils.js";
import type { GraphEdge, GraphNode, RefGraph } from "./graph-types.js";

export interface RefEdge {
	/** Source URI */
	fromUri: string;
	/** Source JSON pointer */
	fromPtr: string;
	/** Target URI */
	toUri: string;
	/** Target JSON pointer */
	toPtr: string;
	/** The $ref string value */
	ref: string;
	/** Whether this is an external URL reference (http/https) that cannot be resolved locally */
	isExternal?: boolean;
}

/**
 * GraphIndex maintains dependency graphs for $ref relationships.
 * Implements RefGraph interface for compatibility with rules.
 */
export class GraphIndex implements RefGraph {
	/** Outgoing dependencies: fromUri -> Set<toUri> */
	private readonly deps = new Map<string, Set<string>>();
	/** Reverse dependencies: toUri -> Set<fromUri> */
	private readonly rdeps = new Map<string, Set<string>>();
	/** All ref edges */
	private readonly _edges = new Set<RefEdge>();
	/** Edges indexed by source URI for O(1) removal: fromUri -> Set<RefEdge> */
	private readonly edgesByFromUri = new Map<string, Set<RefEdge>>();
	/** Edges indexed by target URI for O(1) removal: toUri -> Set<RefEdge> */
	private readonly edgesByToUri = new Map<string, Set<RefEdge>>();
	/** Reverse edges at pointer level: toNodeKey -> Set<fromNodeKey> */
	private readonly reverseEdges = new Map<string, Set<string>>();
	/** Cycle detection cache */
	private readonly cycleCache = new Map<string, boolean>();
	/** Cached GraphEdge array */
	private _cachedEdges: GraphEdge[] | null = null;

	/**
	 * Clear all data from the index.
	 */
	clear(): void {
		this.deps.clear();
		this.rdeps.clear();
		this._edges.clear();
		this.edgesByFromUri.clear();
		this.edgesByToUri.clear();
		this.reverseEdges.clear();
		this.cycleCache.clear();
		this._cachedEdges = null;
	}

	/**
	 * Update graph for a document's IR.
	 */
	updateFromIR(uri: string, root: IRNode): void {
		// Remove old edges for this URI
		this.removeEdgesForUri(uri);

		// Scan for $ref nodes and add edges
		this.scanForRefs(uri, root);
	}

	/**
	 * Get all URIs that depend on the given URI.
	 */
	dependentsOfUri(uri: string): string[] {
		return Array.from(this.rdeps.get(uri) ?? []);
	}

	/**
	 * Get all URIs that the given URI depends on.
	 */
	dependenciesOf(uri: string): string[] {
		return Array.from(this.deps.get(uri) ?? []);
	}

	/**
	 * Get all ref edges from a URI.
	 * Uses indexed lookup for O(1) URI-level queries.
	 */
	getRefEdgesFrom(uri: string, ptr?: string): RefEdge[] {
		const uriEdges = this.edgesByFromUri.get(uri);
		if (!uriEdges) return [];

		if (!ptr) {
			return Array.from(uriEdges);
		}

		// Filter by pointer if specified
		return Array.from(uriEdges).filter((edge) => edge.fromPtr === ptr);
	}

	/**
	 * Get only local (non-external) ref edges from a URI.
	 * Excludes http/https references that cannot be resolved locally.
	 */
	getLocalRefEdgesFrom(uri: string, ptr?: string): RefEdge[] {
		return this.getRefEdgesFrom(uri, ptr).filter((edge) => !edge.isExternal);
	}

	/**
	 * Get only external ref edges from a URI.
	 * Returns only http/https references.
	 */
	getExternalRefEdgesFrom(uri: string, ptr?: string): RefEdge[] {
		return this.getRefEdgesFrom(uri, ptr).filter((edge) => edge.isExternal);
	}

	/**
	 * Check if a ref edge is external (http/https URL).
	 */
	isExternalRef(edge: RefEdge): boolean {
		return edge.isExternal === true;
	}

	/**
	 * Check if there's a cycle involving the given URI and pointer.
	 */
	hasCycleAt(uri: string, ptr: string): boolean {
		const key = `${uri}#${ptr}`;
		if (this.cycleCache.has(key)) {
			return this.cycleCache.get(key) ?? false;
		}

		const visited = new Set<string>();
		const hasCycle = this.detectCycle(uri, ptr, visited, new Set<string>());
		this.cycleCache.set(key, hasCycle);
		return hasCycle;
	}

	/**
	 * RefGraph interface: Get all edges as GraphEdge array.
	 */
	get edges(): GraphEdge[] {
		if (this._cachedEdges === null) {
			this._cachedEdges = Array.from(this._edges).map((edge) => ({
				from: { uri: edge.fromUri, pointer: edge.fromPtr },
				to: { uri: edge.toUri, pointer: edge.toPtr },
			}));
		}
		return this._cachedEdges;
	}

	/**
	 * RefGraph interface: Get all nodes that depend on the given node.
	 */
	dependentsOf(node: GraphNode): GraphNode[] {
		const nodeKey = `${node.uri}#${node.pointer}`;
		const dependentKeys = this.reverseEdges.get(nodeKey);
		if (!dependentKeys) return [];

		const dependents: GraphNode[] = [];
		for (const key of dependentKeys) {
			const [uri, pointer] = key.split("#", 2);
			if (uri && pointer) {
				dependents.push({ uri, pointer: `#${pointer}` });
			}
		}
		return dependents;
	}

	/**
	 * RefGraph interface: Get all nodes that the given node references.
	 */
	referencesFrom(node: GraphNode): GraphNode[] {
		const refEdges = this.getRefEdgesFrom(node.uri, node.pointer);
		return refEdges.map((edge) => ({
			uri: edge.toUri,
			pointer: edge.toPtr,
		}));
	}

	/**
	 * RefGraph interface: Check if the given node is part of a cycle.
	 */
	hasCycle(node: GraphNode): boolean {
		return this.hasCycleAt(node.uri, node.pointer);
	}

	/**
	 * Get all nodes that reference the given node (reverse of referencesFrom).
	 */
	referencesTo(node: GraphNode): GraphNode[] {
		return this.dependentsOf(node);
	}

	/**
	 * Remove all edges for a URI (when document is updated/deleted).
	 * Uses indexed lookups for O(1) URI-level removal instead of O(n) iteration.
	 */
	removeEdgesForUri(uri: string): void {
		// Remove outgoing edges
		const outgoing = this.deps.get(uri);
		if (outgoing) {
			for (const toUri of outgoing) {
				const incoming = this.rdeps.get(toUri);
				incoming?.delete(uri);
				if (incoming?.size === 0) {
					this.rdeps.delete(toUri);
				}
			}
			this.deps.delete(uri);
		}

		// Remove incoming edges
		const incoming = this.rdeps.get(uri);
		if (incoming) {
			for (const fromUri of incoming) {
				const outgoingFromUri = this.deps.get(fromUri);
				outgoingFromUri?.delete(uri);
				if (outgoingFromUri?.size === 0) {
					this.deps.delete(fromUri);
				}
			}
			this.rdeps.delete(uri);
		}

		// Remove edges where this URI is the source - O(1) lookup
		const edgesFromUri = this.edgesByFromUri.get(uri);
		if (edgesFromUri) {
			for (const edge of edgesFromUri) {
				this._edges.delete(edge);
				// Remove from reverse edges
				const toKey = `${edge.toUri}#${edge.toPtr}`;
				const fromKey = `${edge.fromUri}#${edge.fromPtr}`;
				const reverseSet = this.reverseEdges.get(toKey);
				if (reverseSet) {
					reverseSet.delete(fromKey);
					if (reverseSet.size === 0) {
						this.reverseEdges.delete(toKey);
					}
				}
				// Remove from target URI index
				const toUriEdges = this.edgesByToUri.get(edge.toUri);
				toUriEdges?.delete(edge);
				if (toUriEdges?.size === 0) {
					this.edgesByToUri.delete(edge.toUri);
				}
			}
			this.edgesByFromUri.delete(uri);
		}

		// Remove edges where this URI is the target - O(1) lookup
		const edgesToUri = this.edgesByToUri.get(uri);
		if (edgesToUri) {
			for (const edge of edgesToUri) {
				this._edges.delete(edge);
				// Remove from reverse edges
				const toKey = `${edge.toUri}#${edge.toPtr}`;
				const fromKey = `${edge.fromUri}#${edge.fromPtr}`;
				const reverseSet = this.reverseEdges.get(toKey);
				if (reverseSet) {
					reverseSet.delete(fromKey);
					if (reverseSet.size === 0) {
						this.reverseEdges.delete(toKey);
					}
				}
				// Remove from source URI index
				const fromUriEdges = this.edgesByFromUri.get(edge.fromUri);
				fromUriEdges?.delete(edge);
				if (fromUriEdges?.size === 0) {
					this.edgesByFromUri.delete(edge.fromUri);
				}
			}
			this.edgesByToUri.delete(uri);
		}

		// Invalidate cached edges
		this._cachedEdges = null;

		// Clear cycle cache
		this.cycleCache.clear();
	}

	private scanForRefs(uri: string, node: IRNode): void {
		// Check if this node is a $ref
		if (
			node.kind === "object" &&
			node.children &&
			node.children.some((child) => child.key === "$ref")
		) {
			const refChild = node.children.find((child) => child.key === "$ref");
			if (
				refChild &&
				refChild.kind === "string" &&
				typeof refChild.value === "string"
			) {
				const ref = refChild.value as string;
				const resolved = this.resolveRef(uri, ref);
				if (resolved) {
					this.addEdge(
						uri,
						node.ptr,
						resolved.uri,
						resolved.ptr,
						ref,
						resolved.isExternal,
					);
				}
			}
		}

		// Recurse into children
		if (node.children) {
			for (const child of node.children) {
				this.scanForRefs(uri, child);
			}
		}
	}

	private resolveRef(
		fromUri: string,
		ref: string,
	): { uri: string; ptr: string; isExternal?: boolean } | null {
		try {
			// Handle external refs (http/https)
			// Mark as external so consumers know these cannot be resolved locally
			if (/^https?:/i.test(ref)) {
				const [uri, fragment] = ref.split("#", 2);
				return {
					uri: uri ?? ref,
					ptr: fragment ? `#${fragment}` : "#",
					isExternal: true,
				};
			}

			// Handle relative refs
			if (ref.startsWith("#")) {
				// Same-document reference
				return { uri: fromUri, ptr: ref };
			}

			// Relative file reference - use shared URI resolution utility
			// Split ref to separate URI part from fragment
			const [refUri, fragment] = ref.split("#", 2);
			const fromUriObj = URI.parse(fromUri);
			if (!refUri) return null;
			const resolvedUri = resolveRef(fromUriObj, refUri);
			const resolvedUriStr = resolvedUri.toString();
			// Preserve fragment from original ref if present
			return {
				uri: resolvedUriStr,
				ptr: fragment ? `#${fragment}` : "#",
			};
		} catch {
			return null;
		}
	}

	private addEdge(
		fromUri: string,
		fromPtr: string,
		toUri: string,
		toPtr: string,
		ref: string,
		isExternal?: boolean,
	): void {
		const edge: RefEdge = { fromUri, fromPtr, toUri, toPtr, ref, isExternal };
		this._edges.add(edge);

		// Invalidate cached edges
		this._cachedEdges = null;

		// Update deps (URI-level)
		let depsSet = this.deps.get(fromUri);
		if (!depsSet) {
			depsSet = new Set();
			this.deps.set(fromUri, depsSet);
		}
		depsSet.add(toUri);

		// Update rdeps (URI-level)
		let rdepsSet = this.rdeps.get(toUri);
		if (!rdepsSet) {
			rdepsSet = new Set();
			this.rdeps.set(toUri, rdepsSet);
		}
		rdepsSet.add(fromUri);

		// Update edges by source URI index (for O(1) removal)
		let fromUriEdges = this.edgesByFromUri.get(fromUri);
		if (!fromUriEdges) {
			fromUriEdges = new Set();
			this.edgesByFromUri.set(fromUri, fromUriEdges);
		}
		fromUriEdges.add(edge);

		// Update edges by target URI index (for O(1) removal)
		let toUriEdges = this.edgesByToUri.get(toUri);
		if (!toUriEdges) {
			toUriEdges = new Set();
			this.edgesByToUri.set(toUri, toUriEdges);
		}
		toUriEdges.add(edge);

		// Update reverse edges (pointer-level)
		const fromKey = `${fromUri}#${fromPtr}`;
		const toKey = `${toUri}#${toPtr}`;
		let reverseSet = this.reverseEdges.get(toKey);
		if (!reverseSet) {
			reverseSet = new Set();
			this.reverseEdges.set(toKey, reverseSet);
		}
		reverseSet.add(fromKey);
	}

	private detectCycle(
		uri: string,
		ptr: string,
		visited: Set<string>,
		path: Set<string>,
	): boolean {
		const key = `${uri}#${ptr}`;
		if (path.has(key)) {
			return true; // Cycle detected
		}
		if (visited.has(key)) {
			return false; // Already checked, no cycle
		}

		visited.add(key);
		path.add(key);

		// Get all edges from this specific node (URI + pointer)
		const edges = this.getRefEdgesFrom(uri, ptr);
		for (const edge of edges) {
			if (this.detectCycle(edge.toUri, edge.toPtr, visited, path)) {
				return true;
			}
		}

		path.delete(key);
		return false;
	}
}
