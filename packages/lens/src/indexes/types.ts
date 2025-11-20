
export type JsonPointer = string;

export interface PathItemRef {
  /** URI where this PathItem is referenced from (or defined if not referenced) */
  uri: string;
  /** Pointer where this PathItem is referenced from (or defined if not referenced) */
  pointer: JsonPointer;
  /** URI where this PathItem is actually defined */
  definitionUri: string;
  /** Pointer where this PathItem is actually defined */
  definitionPointer: JsonPointer;
  /** URI where this PathItem is referenced from (undefined if not referenced, same as definitionUri) */
  referenceUri?: string;
  /** Pointer where this PathItem is referenced from (undefined if not referenced) */
  referencePointer?: JsonPointer;
  node: unknown;
}

export interface OperationRef {
  /** URI where this operation is referenced from (or defined if not referenced) */
  uri: string;
  /** Pointer where this operation is referenced from (or defined if not referenced) */
  pointer: JsonPointer;
  /** URI where this operation is actually defined */
  definitionUri: string;
  /** Pointer where this operation is actually defined */
  definitionPointer: JsonPointer;
  /** URI where this operation is referenced from (undefined if not referenced, same as definitionUri) */
  referenceUri?: string;
  /** Pointer where this operation is referenced from (undefined if not referenced) */
  referencePointer?: JsonPointer;
  method: string;
  node: unknown;
}

export interface ComponentRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
}

export interface SchemaRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
}

export interface ParameterRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  name?: string;
  in?: string;
}

export interface ResponseRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  statusCode?: string;
}

export interface RequestBodyRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
}

export interface HeaderRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  name?: string;
}

export interface MediaTypeRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  mediaType?: string;
}

export interface SecurityRequirementRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  level: "root" | "operation";
}

export interface ExampleRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  name?: string;
}

export interface LinkRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  name?: string;
}

export interface CallbackRef {
  uri: string;
  pointer: JsonPointer;
  node: unknown;
  name?: string;
}

export interface ReferenceRef {
  uri: string;
  pointer: JsonPointer; // Pointer to the node containing $ref
  refPointer: JsonPointer; // Pointer to the $ref property itself
  ref: string; // The $ref value
  node: unknown; // The node containing $ref
}

export interface ProjectIndex {
  version: string;
  pathsByString: Map<string, PathItemRef[]>;
  pathItemsToPaths: Map<string, string[]>;
  operationsByOwner: Map<string, OperationRef[]>;
  components: Record<string, Map<string, ComponentRef>>;
  schemas: Map<string, SchemaRef>; // All schemas (components, fragments, inline)
  parameters: Map<string, ParameterRef>; // All parameters (components, path-level, operation-level, fragments)
  responses: Map<string, ResponseRef>; // All responses (components, operation-level, fragments)
  requestBodies: Map<string, RequestBodyRef>; // All request bodies (components, operation-level, fragments)
  headers: Map<string, HeaderRef>; // All headers (components, response-level, fragments)
  mediaTypes: Map<string, MediaTypeRef>; // All media types (requestBody.content, response.content)
  securityRequirements: Map<string, SecurityRequirementRef>; // All security requirements (root, operation-level)
  examples: Map<string, ExampleRef>; // All examples (components, inline under media types, parameters, headers)
  links: Map<string, LinkRef>; // All links (components, response-level)
  callbacks: Map<string, CallbackRef>; // All callbacks (components, operation-level)
  references: Map<string, ReferenceRef>; // All $ref nodes throughout the document
  documents: Map<string, Record<string, unknown>>;
  scopeProvider?: (uri: string, pointer: JsonPointer) => ScopeContext | null;
}

export interface ScopeContext {
  documentUri: string;
  pointer: JsonPointer;
  ancestors: Array<{ kind: string; pointer: JsonPointer }>;
  path?: { name: string; pointer: JsonPointer };
  operation?: { method: string; pointer: JsonPointer };
  parameter?: { name?: string; in?: string; pointer: JsonPointer };
  security?: {
    level: "root" | "operation";
    pointer: JsonPointer;
    scheme?: string;
  };
  component?: { type: string; name: string; pointer: JsonPointer };
}

/**
 * Resolves root documents for nodes in the reference graph.
 * Traverses backwards through $ref relationships to find root documents.
 */
export interface RootResolver {
  /**
   * Find all root documents that reference this node (via any chain of $refs).
   * Returns empty array if node is itself a root, or if no roots reference it.
   *
   * @param uri - The URI of the document containing the node
   * @param pointer - The JSON pointer to the node
   * @returns Array of root document URIs
   */
  findRootsForNode(uri: string, pointer: string): string[];

  /**
   * Get the primary root document for a node (first root found, or node itself if root).
   * Returns null if node is not connected to any root.
   *
   * @param uri - The URI of the document containing the node
   * @param pointer - The JSON pointer to the node
   * @returns Primary root document URI, or null if not found
   */
  getPrimaryRoot(uri: string, pointer: string): string | null;

  /**
   * Check if a document is a root document.
   *
   * @param uri - The URI of the document to check
   * @returns True if the document is a root document
   */
  isRootDocument(uri: string): boolean;
}
