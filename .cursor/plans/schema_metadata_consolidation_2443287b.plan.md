---
name: Schema Metadata Consolidation
overview: Refactor all Zod schemas across the 4 OpenAPI module files to move `.describe()` content into `.meta()` and ensure all schemas have examples in their metadata.
todos:
  - id: update-base
    content: Move descriptions to meta and add examples in openapi-base.ts
    status: completed
  - id: update-3.0
    content: Move descriptions to meta and add examples in openapi-3.0-module.ts
    status: completed
    dependencies:
      - update-base
  - id: update-3.1
    content: Move descriptions to meta and add examples in openapi-3.1-module.ts
    status: completed
    dependencies:
      - update-base
  - id: update-3.2
    content: Move descriptions to meta and add examples in openapi-3.2-module.ts
    status: completed
    dependencies:
      - update-base
  - id: build-verify
    content: Rebuild and run tests to verify changes
    status: completed
    dependencies:
      - update-3.0
      - update-3.1
      - update-3.2
---

# Schema Metadata Consolidation Plan

## Current Pattern

Schemas currently use separate `.meta()` and `.describe()` calls:

```typescript
export const Contact30Schema = z
  .object({ ... })
  .meta({ title: "Contact" })
  .describe("Contact information for the exposed API.");
```

## Target Pattern

Consolidate into a single `.meta()` call with description and examples:

```typescript
export const Contact30Schema = z
  .object({ ... })
  .meta({
    title: "Contact",
    description: "Contact information for the exposed API.",
    examples: [{ name: "API Support", email: "support@example.com" }],
  });
```

## Files to Update

1. **[openapi-base.ts](packages/telescope-server/src/engine/schemas/openapi-base.ts)** - ~10 exported schemas
2. **[openapi-3.0-module.ts](packages/telescope-server/src/engine/schemas/openapi-3.0-module.ts)** - ~40 schemas  
3. **[openapi-3.1-module.ts](packages/telescope-server/src/engine/schemas/openapi-3.1-module.ts)** - ~45 schemas
4. **[openapi-3.2-module.ts](packages/telescope-server/src/engine/schemas/openapi-3.2-module.ts)** - ~50 schemas

## Changes Per Schema

For each schema definition:

1. Remove the `.describe("...")` call
2. Add `description` property to existing `.meta({ ... })` 
3. Add `examples` array with 1-2 realistic examples (if not already present)

## Example Transformations

### Simple Schema (Contact)

Before:

```typescript
export const Contact30Schema = z
  .object({ ... })
  .meta({ title: "Contact" })
  .describe("Contact information for the exposed API.");
```

After:

```typescript
export const Contact30Schema = z
  .object({ ... })
  .meta({
    title: "Contact",
    description: "Contact information for the exposed API.",
    examples: [
      { name: "API Support", url: "https://example.com/support", email: "support@example.com" }
    ],
  });
```

### Union Schema (Reference)

Before:

```typescript
export const Reference30Schema = z
  .union([InternalRef30Schema, UrlRef30Schema, FileRef30Schema])
  .meta({ title: "Reference" })
  .describe("A simple object to allow referencing other components.");
```

After:

```typescript
export const Reference30Schema = z
  .union([InternalRef30Schema, UrlRef30Schema, FileRef30Schema])
  .meta({
    title: "Reference",
    description: "A simple object to allow referencing other components.",
    examples: [
      { $ref: "#/components/schemas/Pet" },
      { $ref: "./common/schemas.yaml#/Address" }
    ],
  });
```

## Execution Order

1. Start with `openapi-base.ts` (foundational schemas)
2. Update `openapi-3.0-module.ts` 
3. Update `openapi-3.1-module.ts`
4. Update `openapi-3.2-module.ts`
5. Rebuild and run tests to verify

## Notes

- Field-level schemas (inside objects) already have examples in their `.meta()` - those remain unchanged
- Only top-level exported schemas need the description moved and examples added
- Approximately 145 schema definitions across all files will be updated