---
name: Codelens UX + ref hover
overview: Move all non-$ref-preview UI hints to CodeLens (header identity/usage, required summaries, reference counts), keep $ref previews as inlay hints, and improve $ref link hover formatting to show basename + pointer + rich schema/parameter details. Also fix click-to-show-references by routing through a client command that converts protocol args to VS Code types.
todos:
  - id: refsindex-semantics
    content: Extend ReferencesIndex with excludeSelf + internal/external split and expose refs/files counts.
    status: completed
  - id: move-to-codelens
    content: Remove non-$ref inlays; add header + required summaries as CodeLens.
    status: completed
  - id: atom-usage-lenses
    content: Update component/atom usage lenses to show “refs (files)” and include internal+external breakdown.
    status: completed
  - id: client-showReferences-bridge
    content: Add telescope.showReferences client command and switch server clicks to use it.
    status: completed
  - id: ref-hover-upgrade
    content: Improve $ref hover formatting in document links handler (basename + pointer + rich details).
    status: completed
  - id: tests-build
    content: Add/adjust tests and rebuild telescope-client dist.
    status: completed
---

## Goals

- Use **CodeLens** for all “UI artifacts” except **$ref previews** (which remain InlayHints).
- Header should render **above** the first line (so it doesn’t shift `openapi:`).
- Fix reference count semantics:
- **File header “Used by”**: count only references from **other files**.
- **Per-atom usage** (schemas/params/etc): show **both** internal + external, as `"{refs} refs ({files} files)"`.
- Make clicking usage lenses reliable (no constraint error).
- Improve `$ref` hover: show **basename + pointer** plus rich details (type/items/required/enum/description, etc.).

## Implementation steps

### 1) ReferencesIndex: add semantics + richer return shape

- Update `packages/telescope-server/src/lsp/services/references-index.ts`:
- Add options: `excludeSelf?: boolean` and (for per-atom) an option to include same-file refs.
- Return a structured result that includes:
  - `locations` (all $ref sites)
  - `byFile` map
  - `internalLocations` / `externalLocations` (split by same-file vs other-file)
- Add helpers to produce:
  - `refsCount` + `filesCount` for both internal/external and totals.

### 2) Move header + required summaries to CodeLens

- Update `packages/telescope-server/src/lsp/handlers/inlay-hints.ts`:
- Remove the header inlay.
- Remove required summaries (so this file only emits $ref preview inlays).
- Update `packages/telescope-server/src/lsp/handlers/code-lens.ts`:
- Add a **file header CodeLens** at `{ line: 0, character: 0 }`:
  - `"{Kind} - OpenAPI {version}"`
  - `"Used by: {externalRefs} refs ({externalFiles} files)"`
- Add **schema required** CodeLens at schema definition range:
  - `"Required: {n} (a, b, …)"` with tooltip listing all.

### 3) Per-atom reference counts: show refs+files and make clickable

- Update `packages/telescope-server/src/lsp/handlers/code-lens.ts` component lenses:
- Use ReferencesIndex to compute both internal + external.
- Title: `"{totalRefs} refs ({totalFiles} files)"`.
- Tooltip: breakdown internal vs external + top referencing files.

### 4) Fix click-to-show-references (client command bridge)

Reason: VS Code’s built-in `editor.action.showReferences` expects VS Code objects, but CodeLens args are protocol JSON.

- Client: `packages/telescope-client/src/extension.ts`
- Register `telescope.showReferences` command.
- Convert protocol args `{ uri, position, locations }` → `vscode.Uri/Position/Location[]`.
- Call `vscode.commands.executeCommand('editor.action.showReferences', ...)`.
- Client manifest: `packages/telescope-client/package.json`
- Add command contribution for `telescope.showReferences`.
- Server: change clickable lenses to call `telescope.showReferences` with protocol args.

### 5) Improve $ref hover formatting (Document Links)

- Update `packages/telescope-server/src/lsp/handlers/document-links.ts` (or wherever `$ref` links + hover are produced):
- Hover markdown layout:
  - **`{basename}`** + `#{pointer}` (code)
  - Kind/type summary line (schema/parameter/array<...>/object props)
  - Description (if present)
  - Key fields block (type/format/items/required/enum/etc.), truncated sensibly.
- Keep it fast by using already-parsed docs when available; otherwise load through the existing FS-backed project/doc cache.

### 6) Tests + build

- Add/update tests:
- ReferenceIndex internal/external split + counts.
- CodeLens titles for header + per-atom refs(files).
- Hover formatter unit tests for a few target shapes.
- Rebuild extension: run `bun scripts/build.ts` in `packages/telescope-client`.

## Files to change

- Server:
- `packages/telescope-server/src/lsp/services/references-index.ts`
- `packages/telescope-server/src/lsp/handlers/inlay-hints.ts`
- `packages/telescope-server/src/lsp/handlers/code-lens.ts`
- `packages/telescope-server/src/lsp/handlers/document-links.ts`
- Client:
- `packages/telescope-client/src/extension.ts`
- `packages/telescope-client/package.json`