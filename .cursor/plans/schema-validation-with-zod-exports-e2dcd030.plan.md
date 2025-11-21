<!-- e2dcd030-d1df-4888-b221-1c24aa9972c0 39815565-b40d-40ba-a081-28e754bf4fbc -->
# Universal Parsing & Validation Architecture

I will re-architect the system to use **Language Plugins** for parsing and **Service Plugins** for validation, connected by a shared interface. This ensures "Parse Once" efficiency and consistency across standard JSON/YAML and future OpenAPI workflows.

## Implementation Steps

### 1. Documentation

- **Task**: Create `plans/openapi-implementation.md`.
- **Content**: A concise, actionable plan for the full OpenAPI implementation (OpenAPI Language Plugin, Virtual Code, Schema Detection, Validation Flow) based on the user's vision.

### 2. Unified Interface & Parsing

- **Interface**: Define `ParsedContent` (or similar) in `shared` or `lens`.
  ```typescript
  interface ParsedContent {
      parsedObject: unknown;
      ast: unknown; // Generic AST wrapper
      type: 'json' | 'yaml';
  }
  ```

- **Universal Language Plugin**: Create `packages/aperture-lsp/src/languages/universal-plugin.ts`.
  - Logic: Matches `**/*.{json,yaml}` (excluding Config/OpenAPI patterns).
  - Action: Parses content once.
  - Output: Returns a `VirtualCode` implementing `ParsedContent`.

### 3. Context & Rule Compilation

- **Refactor**: Update `ApertureVolarContext` to pre-compile `validationRules` (flattened list of patterns/schemas).
- **Access**: Expose these rules for the validation service.

### 4. Distinct Service Wrappers

- **Refactor**: Update `createPatternBasedYamlService` and `createPatternBasedJsonService` (keeping them separate).
- **Change**: Both will accept a `schemaResolver` function.
- **Goal**: Standardize the *configuration* interface while keeping the *implementation* specific to the underlying LS.

### 5. Validation Service (`validation.ts`)

- **Logic**:
  - Retrieve `VirtualCode` from the document (accessing the pre-parsed `ParsedContent`).
  - **Resolver**: Match patterns (from Context) to find applicable schemas.
  - **Native Validation**: Pass JSON Schemas to the Native LS (via the wrapper).
  - **Custom Validation**: Use `ParsedContent.parsedObject` to run `zodSchema.safeParse`.
  - **Diagnostics**: Map Zod errors using the existing (improved) logic, utilizing `ParsedContent.ast` for ranges.

## Benefits

- **Parse Once**: Parsing happens only in the Language Plugin. Validation Service just reads.
- **Exclusion**: The Universal Plugin naturally handles exclusions, preventing double-parsing when OpenAPI plugin arrives.
- **Consistency**: Standard interface for all file types.

## Verification

- Verify `plans/openapi-implementation.md` is created.
- Verify standard validation works with the new Language Plugin flow.
- Verify performance and ranges.

### To-dos

- [ ] Update Context to expose getValidationRules()
- [ ] Refactor validation.ts to use flattened rules and simplified flow
- [ ] Verify range mapping in zod-to-diag.ts
- [ ] Verify with tests