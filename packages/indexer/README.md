# Indexer — Project index, references, and $ref graph

The indexer constructs reverse lookups and typed references for OpenAPI entities across the loaded documents. It also builds the `$ref` dependency graph and provides a resolver for dereferencing references. Rules rely on these references to traverse the specification efficiently.

## Responsibilities

- Walk parsed documents and collect pointers for every significant entity (paths, operations, schemas, parameters, etc.)
- Provide helper types (`OperationRef`, `SchemaRef`, `ParameterRef`, …) that carry URI, pointer, and contextual metadata
- Surface a project-wide view of the OpenAPI version and component relationships

## Exports

- `buildIndex({ docs, graph, resolver })` → `ProjectIndex`
- `buildRefGraph({ docs, host })` → `{ graph, resolver }`
- `makeNode(uri, pointer)` → `GraphNode`
- Types: `ProjectIndex`, `PathItemRef`, `OperationRef`, `SchemaRef`, `ParameterRef`, `ResponseRef`, `RequestBodyRef`, `HeaderRef`, `MediaTypeRef`, `SecurityRequirementRef`, `ExampleRef`, `LinkRef`, `CallbackRef`, `ReferenceRef`, `ScopeContext`, `RefGraph`, `Resolver`, `GraphNode`, `GraphEdge`

## Usage

```ts
import { buildIndex } from "indexer";

const index = buildIndex({ docs, graph, resolver });
console.log(index.version);

for (const operation of index.operations.values()) {
  console.log(operation.pointer, operation.method);
}
```

The index pairs with the graph to resolve `$ref`s lazily. Rules should use the typed refs rather than navigating raw AST nodes to ensure consistent pointer and URI handling.


