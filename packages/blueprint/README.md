# Blueprint — OpenAPI 3.x Schemas (Zod) + Rules

Blueprint publishes the Zod schemas that underpin Telescope's type safety. The schemas mirror OpenAPI 3.0/3.1/3.2 and are consumed by rule authors, the loader/indexer pipeline, and any tooling that needs structural validation. Blueprint also contains the rule implementations and presets (e.g., `recommended31`) that Telescope uses to lint OpenAPI specifications.

## Responsibilities

- Model the OpenAPI object graph with runtime validation via Zod
- Expose typed helpers (e.g. `OpenApiObject`, `OperationObject`, `SchemaObject`) for rules and utilities
- Provide shared enums and discriminators so visitors can branch on version-specific features

## Exports

The package's entrypoint re-exports every schema module and the rule catalog. Commonly used exports include:

**Schemas:**
- `OpenApiObject`, `DocumentInfo`, `ServerObject`
- `PathsObject`, `PathItemObject`, `OperationObject`
- `ParameterObject`, `RequestBodyObject`, `ResponseObject`
- `SchemaObject`, `ExampleObject`, `MediaTypeObject`
- `SecuritySchemeObject`, `SecurityRequirementObject`, `OAuthFlowsObject`
- `TagObject`, `ExternalDocumentationObject`, `LinkObject`, `CallbackObject`
- Utility types such as `ReferenceObject`, `DiscriminatorObject`, and extension helpers

**Rules:**
- `rules` – map of all rule implementations
- `recommended31` – preset containing recommended rules for OpenAPI 3.1
- `pathParamsMatch`, `operationIdUnique` – individual rule exports

Refer to `schemas/*` for the complete list of schema modules and `rules/*` for rule implementations.

## Usage

```ts
import { OpenApiObject } from "blueprint";

export function assertOpenApi(doc: unknown): asserts doc is OpenApiObject {
  const result = OpenApiObject.safeParse(doc);
  if (!result.success) {
    throw new Error("Invalid OpenAPI document");
  }
}
```

Because each schema is recursive, validation works for inline components as well as dereferenced fragments. Rules typically pair Blueprint types with the engine’s visitor payloads for strong typing.

## Development tips

- When adding new OpenAPI keywords, update the relevant module under `schemas/` and export it from `index.ts`.
- Maintain backwards compatibility across OpenAPI versions by guarding version-specific fields with unions or discriminators.
- Rules are organized by category (operations, parameters, schemas, etc.) under `rules/` and exported via `rules/presets.ts`.


