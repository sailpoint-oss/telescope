# Lens — Document lint orchestration

Lens glues together the host, loader, indexer, and engine in order to lint a document given a resolved linting context. It is the primary entrypoint used by Aperture's language server and also provides an in-memory linter for OpenAPI objects. Lens also handles configuration resolution, materializing presets and rule overrides into runnable rule objects.

## Exports

- `lintDocument(context, host, rules?)` – produces engine diagnostics for project-aware, fragment, or multi-root contexts
- `lint(obj)` – lints an in-memory OpenAPI object using the full pipeline inside a temporary in-memory host

## Usage (LSP)

```ts
import { lintDocument, resolveLintingContext } from "lens";

const context = await resolveLintingContext(uri, host, workspaceFolders, entrypoints);
const diagnostics = await lintDocument(context, host);
```

`lintDocument` lazily loads any missing documents, builds the reference graph and index, filters rules based on context, and then runs the engine. Parse failures are surfaced as diagnostics with `ruleId: "parse-error"`.

## Usage (in-memory)

```ts
import { lint } from "lens";

const diagnostics = await lint(openApiObject);
```

`lint(obj)` shells an object through the same pipeline by serialising it to YAML and feeding it through an in-memory host. It automatically returns an empty array for fragments so consumers can guard before invoking it.

## Notes

- When no custom rules are provided, `lintDocument` loads all rules from `blueprint` and automatically filters them via `filterRulesByContext`.
- Multi-root contexts lint each root separately, merging diagnostics at the end.
- Fragment contexts only run rules that are safe without project-wide context, ensuring quick feedback for partial files.


