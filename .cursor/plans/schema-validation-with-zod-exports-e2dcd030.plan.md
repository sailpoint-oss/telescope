<!-- e2dcd030-d1df-4888-b221-1c24aa9972c0 39815565-b40d-40ba-a081-28e754bf4fbc -->
# Unified Custom Schema Service Architecture

I will build a robust foundation for schema validation that supports both current pattern-based custom schemas and future content-aware OpenAPI validation, ensuring zero redundant parsing.

## Implementation Strategy

### 1. Centralized Rule Compilation (`ApertureVolarContext`)

I will implement a "Compile Once" strategy for configuration.

- **Modification**: Update `packages/aperture-lsp/src/workspace/context.ts`.
- **Logic**:
  - `loadRules()` will read config and `schema-loader` results.
  - It will flatten them into a `ValidationRule[]`:
    ```typescript
    interface ValidationRule {
      id: string;
      label: string;
      patterns: string[];      // Glob patterns
      jsonSchema?: Schema;     // For Native LS
      zodSchema?: ZodSchema;   // For Custom Checks
    }
    ```

  - **Updates**: Expose an event or callback mechanism (`onRulesChange`) so plugins can update their internal state immediately upon config reload.

### 2. Generic `createCustomSchemaService`

I will refactor both `yaml-language-service.ts` and `json-language-service.ts` to use a unified factory pattern.

- **New Factory**: `createCustomSchemaService(options)`
- **Options**:
  ```typescript
  interface CustomSchemaServiceOptions {
    // ... standard options ...
    schemaResolver: (
      doc: TextDocument, 
      context?: LanguageServiceContext
    ) => Promise<SchemaResult[]>; 
  }
  ```

- **Behavior**: The service delegates schema selection entirely to the resolver, allowing the "brain" to be in the plugin layer (supporting both pattern matching and future VirtualCode inspection).

### 3. "Parse Once" Document Cache

To satisfy the performance requirement, I will implement a caching layer in `validation.ts`.

- **Component**: `DocumentParseCache`
- **Storage**: `Map<string /* uri */, { version: number, ast: AST, json: unknown }>`
- **Logic**:
  - On validation request, check cache for `(uri, version)`.
  - If miss, parse (using `yaml` or `JSON.parse`) and cache.
  - Reuse this result for:

    1. Zod Validation (`safeParse` on the cached json object).
    2. Generic Rules (if they need the AST).
    3. Future OpenAPI detection (checking root keys).

### 4. Implementation in `validation.ts`

I will rewire the plugin to use these components:

- **Init**: Load rules from Context. Subscribe to rule updates.
- **Schema Resolution**: Implement `schemaResolver` that:

  1. Checks `validationRules` against file path (Pattern Match).
  2. (Future stub) Checks `DocumentParseCache` for content signatures (Content Match).
  3. Returns applicable JSON schemas to the Native LS.

- **Diagnostics**:
  - Retrieve valid rules for the document.
  - **Standard**: Native LS runs (using the resolved JSON schemas).
  - **Custom**: Get cached parse result. Run `zodSchema.safeParse`. Map errors using `zodErrorsToDiagnostics`.
  - **Generic**: Run generic rules.

## Verification & Testing

- **Unit Tests**: Verify `DocumentParseCache` invalidation logic.
- **Integration Tests**: 
  - Ensure Zod validation works with the new flow.
  - Ensure `0:0` ranges are fixed (using the previously improved logic).
  - Verify Native LS validation works (mirrored for JSON and YAML).

### To-dos

- [ ] Update Context to expose getValidationRules()
- [ ] Refactor validation.ts to use flattened rules and simplified flow
- [ ] Verify range mapping in zod-to-diag.ts
- [ ] Verify with tests