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
│   ├── openapi-3.0-module.ts
│   ├── openapi-3.1-module.ts
│   ├── openapi-3.2-module.ts
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
│   ├── openapi-3.{0,1,2}-root.json
│   ├── openapi-3.{0,1,2}-operation.json
│   ├── openapi-3.{0,1,2}-parameter.json
│   ├── openapi-3.{0,1,2}-schema.json
│   └── ... (10 fragment schemas per version)
├── embed.go            # Go embed directive for generated/*.json
├── package.json
└── tsconfig.json
```

## Regenerating Schemas

```bash
cd server/schemas
bun install
bun run export
```

The generated `.json` files are committed to git so that Go builds never need Node.js/Bun. After regenerating, commit the updated files.

## Design Decisions

- **`z.looseObject()`** is used for all OpenAPI object definitions, which produces JSON Schema with permissive `additionalProperties`.
- **Post-processing tightens schemas**: The export script replaces permissive `additionalProperties` (empty schema refs from `looseObject()`) with `false`, so the validator flags unknown keys.
- **Go exempts `x-*` keys**: The Go validator (`gossip/jsonschema/`) skips `x-*` extension keys during `additionalProperties` checks, so vendor extensions work despite `additionalProperties: false`.
