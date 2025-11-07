# CLI — Telescope OpenAPI Linter

The CLI wraps Telescope's shared pipeline in a Bun executable. It resolves configuration via `lens`, loads entrypoints, and prints diagnostics using built-in formatters.

## Quick usage

```bash
# from the repository root
bun run --filter cli lint path/to/openapi.yaml

# or pass multiple files / globs
bun run --filter cli lint "apis/**/*.yaml"
```

The process exits with a non-zero status if any error-severity diagnostics are reported.

## Configuration

- Reads `resolveConfig()` from `lens`, which defaults to the `recommended31` preset from `blueprint`
- Accepts glob patterns and `file://` URIs alongside relative/absolute filesystem paths
- Skips non-OpenAPI documents automatically (see `identifyDocumentType` guard in `src/index.ts`)

Extend the default config to enable, disable, or tweak rules. Both the CLI and Aperture honor the same configuration logic.

## Output formatters

Select output via the `TELESCOPE_FORMAT` environment variable:

- `stylish` (default) – single-line diagnostics
- `json` – machine readable diagnostics array

```bash
TELESCOPE_FORMAT=json bun run --filter cli lint openapi.yaml
```

Add new formatter functions to `src/formatters.ts` and register them on the exported map.

## Programmatic API

```ts
import { lint } from "cli";

const { diagnostics, fixes } = await lint(["path/to/openapi.yaml"]);
```

The API returns engine diagnostics plus any generated fixes, enabling downstream tooling to reuse the CLI pipeline without invoking the binary.


