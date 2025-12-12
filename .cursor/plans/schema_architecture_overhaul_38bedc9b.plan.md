---
name: Schema Architecture Overhaul
overview: Complete overhaul of OpenAPI schema validation architecture to properly handle JSON Schema semantics in OpenAPI 3.1+, fix $ref validation, and improve union error handling.
todos:
  - id: add-ref-to-base
    content: Add $ref as optional field to baseSchemaFields in all versions
    status: completed
  - id: update-composition-schema
    content: Update CompositionOnlySchema to be a flexible fallback schema
    status: completed
  - id: update-reference-schemas
    content: Change Reference schemas from strict() to z.object()
    status: completed
  - id: simplify-schema-union
    content: Simplify SchemaObject union structure
    status: completed
  - id: update-error-extraction
    content: Update union error extraction in zod-to-diag.ts
    status: completed
  - id: test-ref-scenarios
    content: Test various $ref scenarios to verify fix
    status: completed
---

# OpenAPI Schema Architecture Overhaul

## Current Architecture Issues

### Issue 1: `$ref` Not Recognized in Schemas

The `CompositionOnlySchema31` uses `z.object()` which only allows `x-*` extensions. Since `$ref` doesn't match `x-*`, it's rejected as an unrecognized key.

**Root cause**: OpenAPI 3.1+ uses JSON Schema 2020-12 where `$ref` can coexist with other schema keywords. The current architecture treats `$ref` as exclusive (in Reference objects).

### Issue 2: Reference Schemas Too Strict

```typescript
export const InternalRef31Schema = z.object({...}).strict()
```

Using `.strict()` means if a Reference has ANY extra properties, validation fails. This prevents valid uses like:

```yaml
$ref: "#/components/schemas/Pet"
description: "Override description"
x-custom: true # Extension not allowed!
```

### Issue 3: Schema Union Falls Through Incorrectly

```
SchemaObject31Schema = union([
    Reference31Schema,        # Strict, fails if extra fields
    TypedSchema31,           # Needs type literal
    NullableTypeSchema31,    # Needs type array
    CompositionOnlySchema31, # Fallback, rejects $ref
])
```

When a schema has `$ref` but Reference31Schema fails (due to strict mode or regex mismatch), validation falls through to CompositionOnlySchema31 which incorrectly rejects `$ref`.

### Issue 4: `baseSchemaFields` Missing `$ref`

In JSON Schema / OpenAPI 3.1+, `$ref` is a valid keyword in any schema object, but it's not in `baseSchemaFields`.

## Proposed Solution

### Strategy: Unified Schema with Optional `$ref`

Rather than treating References as completely separate objects, make `$ref` a valid optional field in all schema types. This matches JSON Schema 2020-12 semantics.

### Step 1: Add `$ref` to Base Schema Fields

```typescript
const baseSchemaFields = {
  $ref: z
    .string()
    .meta({ title: "$ref" })
    .describe("Reference to another schema")
    .optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  // ... rest of base fields
};
```

### Step 2: Update CompositionOnlySchema to Include `$ref`

```typescript
const CompositionOnlySchema31 = z.object({
    $ref: z.string().optional(),  // Add this
    ...baseSchemaFields,
    allOf: ..., oneOf: ..., anyOf: ..., not: ...
});
```

### Step 3: Make Reference Schemas Use `z.object`

Reference objects in OpenAPI CAN have extensions:

```typescript
export const InternalRef31Schema = z.object({
  $ref: z.string().regex(/^#.*/),
  summary: z.string().optional(),
  description: z.string().optional(),
});
```

### Step 4: Simplify Union Structure

Instead of:

```typescript
union([Reference, TypedSchema, NullableType, CompositionOnly]);
```

Use:

```typescript
union([
  TypedSchema31, // type: string literal
  NullableTypeSchema31, // type: array
  FlexibleSchema31, // Catch-all with optional $ref, allOf, etc.
]);
```

Where `FlexibleSchema31` handles:

- Pure `$ref` schemas
- Composition schemas (allOf/oneOf/anyOf)
- Schemas with `$ref` + other keywords

### Step 5: Remove Separate Reference Schema from SchemaObject Union

Since `$ref` is now handled in base fields, we don't need Reference31Schema as a separate union member for schemas. Keep Reference31Schema for use in places where ONLY references are allowed (like Parameter.$ref).

## Implementation Details

### Files to Modify

1. **[`openapi-3.1-module.ts`](packages/telescope-server/src/engine/schemas/openapi-3.1-module.ts)**

   - Add `$ref` to `baseSchemaFields`
   - Update `CompositionOnlySchema31`
   - Update Reference schemas to use `z.object`
   - Simplify `SchemaObject31Schema` union

2. **[`openapi-3.0-module.ts`](packages/telescope-server/src/engine/schemas/openapi-3.0-module.ts)**

   - Same changes (Note: 3.0 has exclusive `$ref`, but allowing it in schemas is still valid)

3. **[`openapi-3.2-module.ts`](packages/telescope-server/src/engine/schemas/openapi-3.2-module.ts)**

   - Same changes

4. **[`zod-to-diag.ts`](packages/telescope-server/src/lsp/services/shared/zod-to-diag.ts)**

   - Update union error extraction to be smarter about known keywords

## Schema Structure After Changes

```
SchemaObject31Schema = union([
    TypedSchema31,         // Has type: "string" | "number" | etc.
    NullableTypeSchema31,  // Has type: ["string", "null"]
    FlexibleSchema31,      // Composition, $ref, or minimal schemas
])

FlexibleSchema31 = z.object({
    $ref: z.string().optional(),
    type: z.string().optional(),  // For edge cases
    ...baseSchemaFields,
    ...compositionFields,
    ...allTypeSpecificFields,  // Allow any type-specific fields
})
```

## Benefits

1. **`$ref` works everywhere**: Can be used alone or with other keywords
2. **Extensions work on References**: `x-*` extensions allowed on $ref objects
3. **Better error messages**: Union errors point to actual problems, not "$ref unrecognized"
4. **JSON Schema compliant**: Matches OpenAPI 3.1+ / JSON Schema 2020-12 semantics
5. **Simpler union structure**: Fewer edge cases to handle

## Validation Logic

After changes, a schema like:

```yaml
$ref: "#/components/schemas/Base"
description: "Extended pet"
x-custom: value
```

Will be validated by `FlexibleSchema31`:

- `$ref`: valid string
- `description`: valid (in baseSchemaFields)
- `x-custom`: valid (z.object allows x-\*)
