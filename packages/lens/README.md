# Lens — Document lint orchestration

Lens glues together the host, loader, indexer, and engine in order to lint a document given a resolved linting context. It is the primary entrypoint used by Aperture's language server and also provides an in-memory linter for OpenAPI objects. Lens also handles configuration resolution, materializing presets and rule overrides into runnable rule objects.

## Exports

- `lintDocument(context, host, rules?)` – produces engine diagnostics for project-aware, fragment, or multi-root contexts
- `lint(obj)` – lints an in-memory OpenAPI object using the full pipeline inside a temporary in-memory host
- `defineSchema(schema)` - helper for defining Zod schemas for validation

## Usage (LSP)

```ts
import { lintDocument, resolveLintingContext } from "lens";

const context = await resolveLintingContext(uri, host, workspaceFolders);
const diagnostics = await lintDocument(context, host);
```

`lintDocument` lazily loads any missing documents, builds the reference graph and index, filters rules based on context, and then runs the engine. Parse failures are surfaced as diagnostics with `ruleId: "parse-error"`.

## Usage (in-memory)

```ts
import { lint } from "lens";

const diagnostics = await lint(openApiObject);
```

`lint(obj)` shells an object through the same pipeline by serialising it to YAML and feeding it through an in-memory host. It automatically returns an empty array for fragments so consumers can guard before invoking it.

## Validation Schemas

Lens provides a `defineSchema` helper to create Zod schemas that can be used by the Telescope validation service to validate arbitrary YAML and JSON files.

```ts
import { defineSchema } from "lens";
import { z } from "zod";

export default defineSchema(
  z.object({
    name: z.string(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
);
```

These schemas can be registered in your `.telescope/config.yaml`:

```yaml
additionalValidation:
  my-config:
    patterns:
      - "configs/*.yaml"
    schemas:
      - schema: "./schemas/my-schema.ts"
```

The validation service will automatically:
1. Generate a JSON Schema from your Zod schema for standard LSP features (hover, completion).
2. Run the Zod schema against your files for enhanced validation and error reporting.

## Notes

- When no custom rules are provided, `lintDocument` loads all rules from `blueprint` and automatically filters them via `filterRulesByContext`.
- Multi-root contexts lint each root separately, merging diagnostics at the end.
- Fragment contexts only run rules that are safe without project-wide context, ensuring quick feedback for partial files.
