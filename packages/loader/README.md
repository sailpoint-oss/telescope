# Loader — YAML/JSON parsing and pointer utilities

Loader parses OpenAPI documents from URIs provided by a `VfsHost`. It produces typed `ParsedDocument` objects that include source maps, version detection, and helpers for working with JSON Pointers.

## Responsibilities

- Load YAML/JSON text via the host and parse it into an AST + metadata (`ParsedDocument`)
- Detect document type (OpenAPI root, fragment, non-OpenAPI) and version
- Provide pointer helpers for reading and manipulating AST nodes safely

## Exports

- `loadDocument({ host, uri })` → `ParsedDocument`
- `identifyDocumentType(ast)` / `isRootDocument(ast)` / `isPartialDocument(ast)`
- `detectDocumentVersion(ast)`
- Pointer helpers: `encodePointerSegment`, `decodePointerSegment`, `splitPointer`, `joinPointer`, `getValueAtPointer`

## Usage

```ts
import { loadDocument, getValueAtPointer } from "loader";

const doc = await loadDocument({ host, uri });
const title = getValueAtPointer(doc.ast, "/info/title");
```

Guard against unknown document types when linting mixed-format workspaces:

```ts
import { identifyDocumentType } from "loader";

const parsed = await loadDocument({ host, uri });
if (identifyDocumentType(parsed.ast) === "unknown") {
  // skip non-OpenAPI files
}
```

## Notes

- Source maps allow the engine to convert byte offsets into line/character ranges; rules should rely on the engine helpers instead of computing positions manually.
- YAML parsing is handled by `yaml`; JSON parsing uses `jsonc-parser` to support comments when necessary.


