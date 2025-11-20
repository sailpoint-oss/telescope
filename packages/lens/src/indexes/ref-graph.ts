import { getValueAtPointer, joinPointer } from "shared/pointer-utils";
import { isRootDocument } from "shared/document-type-utils";
import { resolveRef } from "shared/ref-utils";
import type { ParsedDocument } from "../types.js";
import type { GraphNode, RefGraph, Resolver } from "./graph-types";
import type { RootResolver } from "./types";
import { URI } from "vscode-uri";

const ORIGIN_SYMBOL = Symbol.for("telescope.origin");

export interface BuildRefGraphOptions {
	docs: Map<string, ParsedDocument>;
}

export interface RefGraphResult {
	graph: RefGraph;
	resolver: Resolver;
	rootResolver: RootResolver;
}

/**
 * Build a reference graph from a set of documents.
 *
 * @param options - Build options containing documents and host
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
				const ref = (value as Record<string, unknown>)["$ref"];
				if (typeof ref === "string") {
					const target = resolveRefForGraph(uri, ref);
					registerNode(nodes, target);
					addEdge(forward, reverse, edges, origin, target);
				}
			}
		});
	}

	const graph = new GraphImpl(nodes, forward, reverse, edges);
	const resolver = new GraphResolver(options.docs, nodes);
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
 * Find all $ref target URIs in a document.
 * Only collects external references (those with a refPath), not same-document references.
 *
 * @param doc - The parsed document to search
 * @param originUri - The URI of the document containing the $ref
 * @returns Array of resolved URIs referenced by $ref in the document
 */
export function findRefUris(
	doc: ParsedDocument,
	originUri: string,
): string[] {
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
						const resolvedUri = resolveRef(fromUriObj, refPath);
						refUris.add(resolvedUri.toString());
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

function registerNode(store: Map<string, GraphNode>, node: GraphNode) {
	store.set(nodeKey(node), node);
}

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
 * Resolve a $ref to a GraphNode using resolveRef from shared/uri-utils.
 * Handles both URI resolution and fragment/pointer extraction.
 */
function resolveRefForGraph(fromUri: string, ref: string): GraphNode {
	const [refPath, fragment] = ref.split("#");
	const fromUriObj = URI.parse(fromUri);
	
	// Use resolveRef directly from shared/uri-utils for URI resolution
	const resolvedUri = refPath
		? resolveRef(fromUriObj, refPath)
		: fromUriObj;
	
	// Handle fragment/pointer - ensure it starts with #
	let pointer = "#";
	if (fragment) {
		pointer = fragment.startsWith("/") ? `#${fragment}` : `#/${fragment}`;
	}
	
	return { uri: resolvedUri.toString(), pointer };
}

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

	dependentsOf(node: GraphNode): GraphNode[] {
		const set = this.reverse.get(nodeKey(node));
		if (!set) return [];
		return [...set]
			.map((key) => this.nodes.get(key))
			.filter((node): node is GraphNode => node !== undefined);
	}

	referencesFrom(node: GraphNode): GraphNode[] {
		const set = this.forward.get(nodeKey(node));
		if (!set) return [];
		return [...set]
			.map((key) => this.nodes.get(key))
			.filter((node): node is GraphNode => node !== undefined);
	}

	hasCycle(node: GraphNode): boolean {
		return this.cycleNodes.has(nodeKey(node));
	}

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
					component.forEach((nodeKey) => cycleNodes.add(nodeKey));
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

class GraphResolver implements Resolver {
	private readonly originMap = new WeakMap<object, GraphNode>();

	constructor(
		private readonly docs: Map<string, ParsedDocument>,
		private readonly knownNodes: Map<string, GraphNode>,
	) {}

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

	originOf(node: unknown): GraphNode | null {
		if (!node || typeof node !== "object") return null;
		return (
			this.originMap.get(node as object) ?? (node as any)[ORIGIN_SYMBOL] ?? null
		);
	}
}

function nodeKey(node: GraphNode): string {
	return `${node.uri}#${node.pointer}`;
}

export function makeNode(uri: string, pointer: string): GraphNode {
	return { uri, pointer };
}

/**
 * Implementation of RootResolver that traverses the reverse graph
 * to find root documents for any given node.
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

	findRootsForNode(uri: string, pointer: string): string[] {
		const nodeKey = `${uri}#${pointer}`;

		// Check cache first
		const cached = this.rootCache.get(nodeKey);
		if (cached !== undefined) {
			return cached;
		}

		// If this document is itself a root, return it
		if (this.rootDocuments.has(uri)) {
			const result = [uri];
			this.rootCache.set(nodeKey, result);
			return result;
		}

		// Find the node in the graph
		const node = this.nodes.get(nodeKey);
		if (!node) {
			// Node not in graph, return empty array
			this.rootCache.set(nodeKey, []);
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
		this.rootCache.set(nodeKey, result);
		return result;
	}

	getPrimaryRoot(uri: string, pointer: string): string | null {
		const nodeKey = `${uri}#${pointer}`;

		// Check cache first
		const cached = this.primaryRootCache.get(nodeKey);
		if (cached !== undefined) {
			return cached;
		}

		// If this document is itself a root, return it
		if (this.rootDocuments.has(uri)) {
			this.primaryRootCache.set(nodeKey, uri);
			return uri;
		}

		const roots = this.findRootsForNode(uri, pointer);
		const primary = roots.length > 0 ? (roots[0] ?? null) : null;
		this.primaryRootCache.set(nodeKey, primary);
		return primary;
	}

	isRootDocument(uri: string): boolean {
		return this.rootDocuments.has(uri);
	}
}
