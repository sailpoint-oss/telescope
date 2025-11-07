export interface GraphNode {
	uri: string;
	pointer: string;
}

export interface GraphEdge {
	from: GraphNode;
	to: GraphNode;
}

export interface RefGraph {
	edges: GraphEdge[];
	dependentsOf(node: GraphNode): GraphNode[];
	referencesFrom(node: GraphNode): GraphNode[];
	hasCycle(node: GraphNode): boolean;
}

export interface Resolver {
	deref<T>(origin: GraphNode, ref: string): T;
	originOf(node: unknown): GraphNode | null;
}

