/**
 * Reference Graph Module
 *
 * This module builds and manages the $ref reference graph for OpenAPI documents.
 * The graph tracks relationships between documents and enables:
 *
 * - Resolution of $ref pointers across documents
 * - Detection of circular references
 * - Finding which root documents reference a given fragment
 * - Determining dependencies between documents
 *
 * The graph is built by traversing all loaded documents and recording
 * edges for each $ref encountered. The resulting graph can be queried
 * in both directions (forward: what does X reference, reverse: what references X).
 *
 * @module indexes/ref-graph
 *
 * @see {@link RefGraph} - The graph interface
 * @see {@link Resolver} - The $ref resolution interface
 * @see {@link RootResolver} - Finding root documents for fragments
 *
 * @example
 * ```typescript
 * import { buildRefGraph, findRefUris, makeNode } from "aperture-server";
 *
 * // Build the graph
 * const { graph, resolver, rootResolver } = buildRefGraph({ docs });
 *
 * // Find all references from a schema
 * const refs = graph.referencesFrom({ uri: "file:///api.yaml", pointer: "#/components/schemas/User" });
 *
 * // Resolve a $ref
 * const origin = { uri: "file:///api.yaml", pointer: "#/paths/~1users/get" };
 * const schema = resolver.deref<SchemaObject>(origin, "#/components/schemas/User");
 *
 * // Find which root docs include a fragment
 * const roots = rootResolver.findRootsForNode("file:///schemas/User.yaml", "#");
 * ```
 */

import { URI } from "vscode-uri";
import type { ParsedDocument } from "../types.js";
import { isRootDocument } from "../utils/document-type-utils.js";
import { getValueAtPointer, joinPointer } from "../utils/pointer-utils.js";
import { normalizeUri, resolveRef } from "../utils/ref-utils.js";
import type { GraphNode, RefGraph, Resolver } from "./graph-types";
import type { RootResolver } from "./types";

/**
 * Symbol used to store origin information on resolved objects.
 * This allows tracking where a dereferenced value came from.
 */
const ORIGIN_SYMBOL = Symbol.for("telescope.origin");

/**
 * Options for building a reference graph.
 *
 * @example
 * ```typescript
 * const options: BuildRefGraphOptions = {
 *   docs: new Map([
 *     ["file:///api.yaml", mainDoc],
 *     ["file:///schemas/User.yaml", schemaDoc]
 *   ])
 * };
 * ```
 */
export interface BuildRefGraphOptions {
	/** Map of document URIs to their parsed representations */
	docs: Map<string, ParsedDocument>;
}

/**
 * Result of building a reference graph.
 *
 * Contains all the tools needed for reference resolution and graph navigation.
 */
export interface RefGraphResult {
	/** The reference graph with edge traversal methods */
	graph: RefGraph;
	/** Resolver for dereferencing $ref pointers */
	resolver: Resolver;
	/** Resolver for finding root documents */
	rootResolver: RootResolver;
}

/**
 * Build a reference graph from a set of documents.
 *
 * This function traverses all provided documents, finds every $ref,
 * and builds a directed graph of references. It also creates resolvers
 * for dereferencing and root document discovery.
 *
 * The graph building process:
 * 1. Traverse each document's AST
 * 2. For each node, register it in the graph
 * 3. If the node contains a $ref, resolve the target and add an edge
 * 4. Build the graph implementation with cycle detection
 * 5. Create the resolver and root resolver
 *
 * @param options - Build options containing documents
 * @returns Graph, resolver, and root resolver
 *
 * @remarks
 * This function can accept partial document sets. The graph will be built
 * from the provided documents, and RootResolver will traverse backwards
 * through $ref relationships to find root documents even if not all
 * documents are loaded.
 *
 * Future: This architecture supports incremental updates - when documents
 * change, only affected parts of the graph need to be rebuilt.
 *
 * @example
 * ```typescript
 * const docs = new Map<string, ParsedDocument>();
 * docs.set("file:///api.yaml", await loadDocument({ fileSystem, uri: "file:///api.yaml" }));
 * docs.set("file:///schemas/User.yaml", await loadDocument({ fileSystem, uri: "file:///schemas/User.yaml" }));
 *
 * const { graph, resolver, rootResolver } = buildRefGraph({ docs });
 *
 * // Check for cycles
 * const schemaNode = { uri: "file:///schemas/User.yaml", pointer: "#" };
 * if (graph.hasCycle(schemaNode)) {
 *   console.warn("Circular reference detected in User schema");
 * }
 *
 * // Find what references this schema
 * const dependents = graph.dependentsOf(schemaNode);
 * console.log(`User schema is referenced by ${dependents.length} nodes`);
 * ```
 */
export function buildRefGraph(options: BuildRefGraphOptions): RefGraphResult {
	const nodes = new Map<string, GraphNode>();
	const forward = new Map<string, Set<string>>();
	const reverse = new Map<string, Set<string>>();
	const edges: { from: GraphNode; to: GraphNode }[] = [];

	for (const [uri, doc] of options.docs) {
		traverse(doc.ast, [], (value, pointer) => {
			const origin = makeNode(uri, pointer);
			registerNode(nodes, origin);
			if (value && typeof value === "object") {
				const ref = (value as Record<string, unknown>).$ref;
				if (typeof ref === "string") {
					const target = resolveRefForGraph(uri, ref);
					registerNode(nodes, target);
					addEdge(forward, reverse, edges, origin, target);
				}
			}
		});
	}

	const graph = new GraphImpl(nodes, forward, reverse, edges);
	const resolver = new GraphResolver(options.docs);
	const rootResolver = new RootResolverImpl(
		options.docs,
		graph,
		nodes,
		forward,
		reverse,
	);

	return { graph, resolver, rootResolver };
}

/**
 * Find all external $ref target URIs in a document.
 *
 * This function scans a document for $ref properties and collects
 * the resolved URIs of external references (references to other files).
 * Same-document references (e.g., "#/components/schemas/User") are skipped.
 *
 * @param doc - The parsed document to search
 * @param originUri - The URI of the document containing the $ref
 * @returns Array of resolved URIs referenced by $ref in the document
 *
 * @example
 * ```typescript
 * const doc = await loadDocument({ fileSystem, uri: "file:///api.yaml" });
 * const externalRefs = findRefUris(doc, "file:///api.yaml");
 * console.log(`Document references ${externalRefs.length} external files`);
 *
 * // Load all referenced documents
 * for (const refUri of externalRefs) {
 *   const refDoc = await loadDocument({ fileSystem, uri: refUri });
 *   docs.set(refUri, refDoc);
 * }
 * ```
 */
export function findRefUris(doc: ParsedDocument, originUri: string): string[] {
	const refUris = new Set<string>();
	const fromUriObj = URI.parse(originUri);

	function traverseForRefs(value: unknown): void {
		if (value && typeof value === "object") {
			if (Array.isArray(value)) {
				value.forEach(traverseForRefs);
			} else {
				const obj = value as Record<string, unknown>;
				if (typeof obj.$ref === "string") {
					const ref = obj.$ref;
					const [refPath] = ref.split("#");
					// If refPath is empty, it's a same-document reference - skip
					// We only want external references
					if (refPath?.trim()) {
						// Resolve relative to origin URI using shared utility
						// Normalize for consistent storage and lookup in document maps
						const resolvedUri = resolveRef(fromUriObj, refPath);
						refUris.add(normalizeUri(resolvedUri));
					}
				}
				for (const val of Object.values(obj)) {
					traverseForRefs(val);
				}
			}
		}
	}

	traverseForRefs(doc.ast);
	return Array.from(refUris);
}

/**
 * Recursively traverse a value and call the visitor for each node.
 *
 * @param value - Current value to traverse
 * @param segments - Path segments to the current value
 * @param visit - Visitor function called for each node
 *
 * @internal
 */
function traverse(
	value: unknown,
	segments: string[],
	visit: (value: unknown, pointer: string) => void,
) {
	const pointer = joinPointer(segments);
	visit(value, pointer);

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			traverse(item, [...segments, String(index)], visit);
		});
	} else if (value && typeof value === "object") {
		for (const [key, child] of Object.entries(value)) {
			traverse(child, [...segments, key], visit);
		}
	}
}

/**
 * Register a node in the node store.
 *
 * @param store - Node store map
 * @param node - Node to register
 *
 * @internal
 */
function registerNode(store: Map<string, GraphNode>, node: GraphNode) {
	store.set(nodeKey(node), node);
}

/**
 * Add an edge between two nodes in the graph.
 *
 * @param forward - Forward edge map (from → to)
 * @param reverse - Reverse edge map (to → from)
 * @param edges - Edge list
 * @param from - Source node
 * @param to - Target node
 *
 * @internal
 */
function addEdge(
	forward: Map<string, Set<string>>,
	reverse: Map<string, Set<string>>,
	edges: { from: GraphNode; to: GraphNode }[],
	from: GraphNode,
	to: GraphNode,
) {
	const fromKey = nodeKey(from);
	const toKey = nodeKey(to);
	const forwardSet = forward.get(fromKey) ?? new Set();
	forwardSet.add(toKey);
	forward.set(fromKey, forwardSet);
	const reverseSet = reverse.get(toKey) ?? new Set();
	reverseSet.add(fromKey);
	reverse.set(toKey, reverseSet);
	edges.push({ from, to });
}

/**
 * Resolve a $ref string to a GraphNode.
 *
 * Handles both URI resolution (relative paths) and fragment/pointer extraction.
 *
 * @param fromUri - URI of the document containing the $ref
 * @param ref - The $ref string to resolve
 * @returns GraphNode pointing to the target
 *
 * @internal
 */
function resolveRefForGraph(fromUri: string, ref: string): GraphNode {
	const [refPath, fragment] = ref.split("#");
	const fromUriObj = URI.parse(fromUri);

	// Use resolveRef directly from shared/uri-utils for URI resolution
	const resolvedUri = refPath ? resolveRef(fromUriObj, refPath) : fromUriObj;

	// Handle fragment/pointer - ensure it starts with #
	let pointer = "#";
	if (fragment) {
		pointer = fragment.startsWith("/") ? `#${fragment}` : `#/${fragment}`;
	}

	// Normalize URI for consistent storage and lookup in document maps
	return { uri: normalizeUri(resolvedUri), pointer };
}

/**
 * Implementation of the RefGraph interface.
 *
 * Uses Tarjan's strongly connected components algorithm for cycle detection.
 *
 * @see {@link RefGraph} - The interface this implements
 *
 * @internal
 */
class GraphImpl implements RefGraph {
	private readonly cycleNodes: Set<string>;

	constructor(
		private readonly nodes: Map<string, GraphNode>,
		private readonly forward: Map<string, Set<string>>,
		private readonly reverse: Map<string, Set<string>>,
		readonly edges: { from: GraphNode; to: GraphNode }[],
	) {
		this.cycleNodes = this.computeCycles();
	}

	/**
	 * Find all nodes that reference (depend on) the given node.
	 */
	dependentsOf(node: GraphNode): GraphNode[] {
		const set = this.reverse.get(nodeKey(node));
		if (!set) return [];
		return [...set]
			.map((key) => this.nodes.get(key))
			.filter((node): node is GraphNode => node !== undefined);
	}

	/**
	 * Find all nodes that this node references.
	 */
	referencesFrom(node: GraphNode): GraphNode[] {
		const set = this.forward.get(nodeKey(node));
		if (!set) return [];
		return [...set]
			.map((key) => this.nodes.get(key))
			.filter((node): node is GraphNode => node !== undefined);
	}

	/**
	 * Check if a node is part of a reference cycle.
	 */
	hasCycle(node: GraphNode): boolean {
		return this.cycleNodes.has(nodeKey(node));
	}

	/**
	 * Compute all nodes that are part of cycles using Tarjan's algorithm.
	 */
	private computeCycles(): Set<string> {
		const indexMap = new Map<string, number>();
		const lowLink = new Map<string, number>();
		const onStack = new Set<string>();
		const stack: string[] = [];
		const cycleNodes = new Set<string>();
		let index = 0;

		const strongConnect = (key: string) => {
			indexMap.set(key, index);
			lowLink.set(key, index);
			index++;
			stack.push(key);
			onStack.add(key);

			const neighbors = this.forward.get(key);
			if (neighbors) {
				for (const neighbor of neighbors) {
					if (!indexMap.has(neighbor)) {
						strongConnect(neighbor);
						const currentLowLink = lowLink.get(key);
						const neighborLowLink = lowLink.get(neighbor);
						if (currentLowLink !== undefined && neighborLowLink !== undefined) {
							lowLink.set(key, Math.min(currentLowLink, neighborLowLink));
						}
					} else if (onStack.has(neighbor)) {
						const currentLowLink = lowLink.get(key);
						const neighborIndex = indexMap.get(neighbor);
						if (currentLowLink !== undefined && neighborIndex !== undefined) {
							lowLink.set(key, Math.min(currentLowLink, neighborIndex));
						}
					}
				}
			}

			if (lowLink.get(key) === indexMap.get(key)) {
				const component: string[] = [];
				let w: string | undefined;
				do {
					w = stack.pop();
					if (w == null) break;
					onStack.delete(w);
					component.push(w);
				} while (w !== key);
				if (component.length > 1) {
					component.forEach((nodeKey) => {
						cycleNodes.add(nodeKey);
					});
				} else {
					const node = component[0];
					if (node) {
						// node is already a string key, not a GraphNode
						const nodeKeyStr = node;
						const edges = this.forward.get(nodeKeyStr);
						if (edges?.has(nodeKeyStr)) {
							cycleNodes.add(nodeKeyStr);
						}
					}
				}
			}
		};

		for (const key of this.nodes.keys()) {
			if (!indexMap.has(key)) {
				strongConnect(key);
			}
		}

		return cycleNodes;
	}
}

/**
 * Implementation of the Resolver interface.
 *
 * Provides $ref dereferencing with origin tracking. Resolved objects
 * are tagged with their source location so originOf() can find them later.
 *
 * @see {@link Resolver} - The interface this implements
 *
 * @internal
 */
class GraphResolver implements Resolver {
	private readonly originMap = new WeakMap<object, GraphNode>();

	constructor(private readonly docs: Map<string, ParsedDocument>) {}

	/**
	 * Dereference a $ref and return the target value.
	 *
	 * @throws Error if the target document is not loaded
	 * @throws Error if the pointer doesn't resolve to a value
	 */
	deref<T>(origin: GraphNode, ref: string): T {
		const target = resolveRefForGraph(origin.uri, ref);
		const doc = this.docs.get(target.uri);
		if (!doc) {
			// Document wasn't loaded during project context initialization
			// This can happen if:
			// 1. The file doesn't exist
			// 2. The file is outside the workspace and couldn't be accessed
			// 3. The file failed to load (permissions, parse errors, etc.)
			// 4. The file wasn't discovered during the forward $ref traversal
			throw new Error(
				`Unable to resolve $ref target ${target.uri}. ` +
					`The file was not loaded during project context initialization. ` +
					`This can happen if the file is outside the workspace, doesn't exist, ` +
					`or failed to load during the initial document traversal.`,
			);
		}
		const value = getValueAtPointer(doc.ast, target.pointer) as T;
		if (value === undefined || value === null) {
			// The document exists but the pointer doesn't resolve to a value
			throw new Error(
				`Unable to resolve $ref pointer ${target.pointer} in ${target.uri}. ` +
					`The JSON pointer does not point to an existing node in the document.`,
			);
		}
		if (value && typeof value === "object") {
			this.originMap.set(value as object, target);
			if (!(ORIGIN_SYMBOL in (value as object))) {
				Object.defineProperty(value, ORIGIN_SYMBOL, {
					value: target,
					enumerable: false,
				});
			}
		}

		return value;
	}

	/**
	 * Find the origin (source location) of a resolved value.
	 */
	originOf(node: unknown): GraphNode | null {
		if (!node || typeof node !== "object") return null;
		return (
			this.originMap.get(node as object) ?? (node as any)[ORIGIN_SYMBOL] ?? null
		);
	}
}

/**
 * Create a unique key for a graph node.
 *
 * @param node - Graph node
 * @returns Unique string key
 *
 * @internal
 */
function nodeKey(node: GraphNode): string {
	return `${node.uri}#${node.pointer}`;
}

/**
 * Create a GraphNode from URI and pointer.
 *
 * @param uri - Document URI
 * @param pointer - JSON pointer within the document
 * @returns GraphNode instance
 *
 * @example
 * ```typescript
 * const node = makeNode("file:///api.yaml", "#/components/schemas/User");
 * const dependents = graph.dependentsOf(node);
 * ```
 */
export function makeNode(uri: string, pointer: string): GraphNode {
	return { uri, pointer };
}

/**
 * Implementation of RootResolver that traverses the reverse graph
 * to find root documents for any given node.
 *
 * Uses BFS traversal through dependents to find all root documents
 * that (transitively) reference a given node. Results are cached
 * for performance.
 *
 * @see {@link RootResolver} - The interface this implements
 *
 * @internal
 */
class RootResolverImpl implements RootResolver {
	private readonly rootDocuments = new Set<string>();
	private readonly rootCache = new Map<string, string[]>();
	private readonly primaryRootCache = new Map<string, string | null>();

	constructor(
		private readonly docs: Map<string, ParsedDocument>,
		private readonly graph: RefGraph,
		private readonly nodes: Map<string, GraphNode>,
		private readonly forward: Map<string, Set<string>>,
		private readonly reverse: Map<string, Set<string>>,
	) {
		// Identify all root documents
		for (const [uri, doc] of docs) {
			if (isRootDocument(doc.ast)) {
				this.rootDocuments.add(uri);
			}
		}
	}

	/**
	 * Find all root documents that reference this node.
	 */
	findRootsForNode(uri: string, pointer: string): string[] {
		const targetKey = `${uri}#${pointer}`;

		// Check cache first
		const cached = this.rootCache.get(targetKey);
		if (cached !== undefined) {
			return cached;
		}

		// If this document is itself a root, return it
		if (this.rootDocuments.has(uri)) {
			const result = [uri];
			this.rootCache.set(targetKey, result);
			return result;
		}

		// Find the node in the graph
		const node = this.nodes.get(targetKey);
		if (!node) {
			// Node not in graph, return empty array
			this.rootCache.set(targetKey, []);
			return [];
		}

		// Traverse backwards through dependents to find root documents
		const rootUris = new Set<string>();
		const visited = new Set<string>();
		const queue: GraphNode[] = [node];

		while (queue.length > 0) {
			const current = queue.shift();
			if (!current) continue;

			const currentKey = nodeKey(current);
			if (visited.has(currentKey)) continue;
			visited.add(currentKey);

			// Check if current node's document is a root
			if (this.rootDocuments.has(current.uri)) {
				rootUris.add(current.uri);
				continue; // Don't traverse further from root documents
			}

			// Get all dependents (documents/nodes that reference this node)
			const dependents = this.graph.dependentsOf(current);
			for (const dependent of dependents) {
				// If dependent is from a different document, check if it's a root
				if (dependent.uri !== current.uri) {
					if (this.rootDocuments.has(dependent.uri)) {
						rootUris.add(dependent.uri);
						continue; // Don't traverse further from root documents
					}
				}
				queue.push(dependent);
			}
		}

		const result = Array.from(rootUris);
		this.rootCache.set(targetKey, result);
		return result;
	}

	/**
	 * Get the primary root document for a node.
	 */
	getPrimaryRoot(uri: string, pointer: string): string | null {
		const targetKey = `${uri}#${pointer}`;

		// Check cache first
		const cached = this.primaryRootCache.get(targetKey);
		if (cached !== undefined) {
			return cached;
		}

		// If this document is itself a root, return it
		if (this.rootDocuments.has(uri)) {
			this.primaryRootCache.set(targetKey, uri);
			return uri;
		}

		const roots = this.findRootsForNode(uri, pointer);
		const primary = roots.length > 0 ? (roots[0] ?? null) : null;
		this.primaryRootCache.set(targetKey, primary);
		return primary;
	}

	/**
	 * Check if a document is a root document.
	 */
	isRootDocument(uri: string): boolean {
		return this.rootDocuments.has(uri);
	}
}
