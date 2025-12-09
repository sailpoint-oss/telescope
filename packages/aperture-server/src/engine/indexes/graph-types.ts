/**
 * Reference Graph Type Definitions
 *
 * This module defines types for the $ref reference graph that tracks
 * relationships between documents and nodes. The graph enables efficient
 * resolution of references and detection of cycles.
 *
 * @module indexes/graph-types
 *
 * @see {@link buildRefGraph} - Function that builds RefGraph instances
 * @see {@link ref-graph.ts} - Implementation of these interfaces
 */

/**
 * A node in the reference graph, identified by document URI and JSON pointer.
 *
 * GraphNodes represent specific locations in documents that either contain
 * a $ref or are targets of a $ref. They form the vertices of the reference graph.
 *
 * @see {@link makeNode} - Helper function to create GraphNode instances
 *
 * @example
 * ```typescript
 * const node: GraphNode = {
 *   uri: "file:///api.yaml",
 *   pointer: "#/paths/~1users/get/responses/200/content/application~1json/schema"
 * };
 * ```
 */
export interface GraphNode {
	/** Document URI containing this node */
	uri: string;
	/** JSON pointer to the node within the document */
	pointer: string;
}

/**
 * An edge in the reference graph, representing a $ref relationship.
 *
 * The edge goes from the node containing the $ref to the target node
 * that the $ref points to.
 *
 * @example
 * ```typescript
 * const edge: GraphEdge = {
 *   from: { uri: "file:///api.yaml", pointer: "#/paths/~1users/get/responses/200/schema" },
 *   to: { uri: "file:///schemas/User.yaml", pointer: "#" }
 * };
 * ```
 */
export interface GraphEdge {
	/** The node containing the $ref */
	from: GraphNode;
	/** The target node that the $ref points to */
	to: GraphNode;
}

/**
 * The reference graph tracking $ref relationships between documents.
 *
 * RefGraph provides methods for navigating the graph in both directions
 * (from reference to target and vice versa) and detecting cycles.
 *
 * @see {@link buildRefGraph} - Function that creates RefGraph instances
 * @see {@link GraphImpl} - Implementation class in ref-graph.ts
 *
 * @example
 * ```typescript
 * const { graph } = buildRefGraph({ docs });
 *
 * // Find all nodes that reference a schema
 * const dependents = graph.dependentsOf({
 *   uri: "file:///schemas/User.yaml",
 *   pointer: "#"
 * });
 *
 * // Check for circular references
 * if (graph.hasCycle(node)) {
 *   console.warn("Circular reference detected!");
 * }
 * ```
 */
export interface RefGraph {
	/** All edges in the graph */
	edges: GraphEdge[];

	/**
	 * Find all nodes that reference (depend on) the given node.
	 * These are nodes with $refs that point to this node.
	 *
	 * @param node - The target node
	 * @returns Array of nodes that reference this node
	 */
	dependentsOf(node: GraphNode): GraphNode[];

	/**
	 * Find all nodes that this node references.
	 * These are the targets of $refs in this node.
	 *
	 * @param node - The source node
	 * @returns Array of nodes that this node references
	 */
	referencesFrom(node: GraphNode): GraphNode[];

	/**
	 * Check if a node is part of a reference cycle.
	 *
	 * @param node - The node to check
	 * @returns True if the node is part of a cycle
	 */
	hasCycle(node: GraphNode): boolean;
}

/**
 * Resolver for dereferencing $ref pointers across documents.
 *
 * The Resolver provides methods to follow $ref pointers and retrieve
 * the target values, as well as to find the origin of resolved values.
 *
 * @see {@link buildRefGraph} - Function that creates Resolver instances
 * @see {@link GraphResolver} - Implementation class in ref-graph.ts
 *
 * @example
 * ```typescript
 * const { resolver } = buildRefGraph({ docs });
 *
 * // Resolve a $ref
 * const origin = { uri: "file:///api.yaml", pointer: "#/paths/~1users/get" };
 * const schema = resolver.deref<SchemaObject>(origin, "#/components/schemas/User");
 *
 * // Find where a resolved value came from
 * const source = resolver.originOf(schema);
 * if (source) {
 *   console.log(`Schema defined in ${source.uri} at ${source.pointer}`);
 * }
 * ```
 */
export interface Resolver {
	/**
	 * Dereference a $ref pointer and return the target value.
	 *
	 * @typeParam T - Expected type of the resolved value
	 * @param origin - The node containing the $ref (used for relative resolution)
	 * @param ref - The $ref string to resolve
	 * @returns The resolved value
	 * @throws Error if the reference cannot be resolved
	 */
	deref<T>(origin: GraphNode, ref: string): T;

	/**
	 * Find the origin (source location) of a resolved value.
	 *
	 * This is useful for finding where a dereferenced value was originally
	 * defined, especially when the value has been resolved through $ref.
	 *
	 * @param node - A value that may have been resolved through deref
	 * @returns The origin GraphNode, or null if not found
	 */
	originOf(node: unknown): GraphNode | null;
}
