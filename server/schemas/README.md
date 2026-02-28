# OpenAPI JSON Schema Definitions

This directory is the **single source of truth** for all OpenAPI structural schema definitions used by Telescope.

## Structure

```
schemas/
├── specifications/     # OpenAPI spec text (authoritative reference)
│   ├── 2.0.md
│   ├── 3.0.0.md ... 3.0.4.md
│   ├── 3.1.0.md ... 3.1.2.md
│   └── 3.2.0.md
├── src/                # Zod schema source (TypeScript)
│   ├── openapi-base.ts
│   ├── 2.0/
│   ├── 3.0/
│   ├── 3.1/
│   ├── 3.2/
│   ├── data-types/
│   ├── extensions/
│   └── index.ts
├── scripts/
│   └── export.ts       # Zod → JSON Schema export script
├── generated/          # Committed JSON Schema output (go:embed source)
│   ├── openapi-2.0-root.json
│   ├── openapi-3.0-root.json
│   ├── openapi-3.1-root.json
│   ├── openapi-3.2-root.json
│   └── openapi-3.x-*.json
├── embed.go            # Go embed directive for generated/*.json
├── package.json
└── tsconfig.json
```

## Regenerating Schemas

```bash
cd schemas
npm install
npm run export
```

The generated `.json` files are committed to git so that Go builds never need Node.js. After regenerating, commit the updated files.

## Design Decisions

- **`z.looseObject()`** is used for all OpenAPI object definitions, which produces JSON Schema without `additionalProperties: false`. This natively allows `x-*` extension keys.
- **Zero post-processing**: The export script calls `z.toJSONSchema()` directly with no modifications to the output.
- **Go handles unknown-key enforcement**: Since the JSON Schema allows additional properties, the Go validator (`gossip/jsonschema/`) flags non-`x-*` unknown keys with Levenshtein suggestions.
