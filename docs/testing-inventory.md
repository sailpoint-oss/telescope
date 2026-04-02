# Telescope test inventory (feature vs suite)

This document maps **LSP / extension features** to **non-E2E tests** (Go, Bun) and **VS Code E2E** cases. Use it when deciding where to add coverage or what to trim from E2E.

## E2E classification legend

| Tag | Meaning |
|-----|---------|
| **A — smoke / wiring** | Validates extension + binary + host integration; keep at least one per area. |
| **B — duplicate of Go** | Core LSP behavior already covered by `server/lsp/handler_test.go`, `integration_test.go`, or other Go tests; E2E is redundant unless it caught a **client-only** bug (see notes). |
| **C — client-only** | Editor language IDs, scanner, session wiring; cannot be replaced by Go LSP tests alone. |

## Feature matrix (high level)

| Feature area | Primary Go / Bun coverage | E2E suite file(s) | Notes |
|--------------|---------------------------|-------------------|--------|
| Activation & test API | — | `activation.e2e.ts` | **C/A** — wiring |
| Diagnostics (invalid spec, schema errors) | `integration_test.go`, rules | `diagnostics.e2e.ts` | Mix **A/B** |
| Delta / file lifecycle | integration + graph | `delta-sync.e2e.ts`, `cross-file-diagnostics.e2e.ts` | **A** |
| Definition / refs / links / format | `handler_test.go` | `definition-flow.e2e.ts`, `providers.e2e.ts` | Providers slimmed to **links + format** (defs/refs in definition-flow) |
| Hover | handler + integration (`TestRichAPIFixture_HoverAndDefinition_UnixFileURI`, etc.) | `hover.e2e.ts` | **A** — host wiring only; detailed content in Go |
| Completion | `handler_test.go` | `completion.e2e.ts` | **B** + **A** |
| Rename | `handler_test.go` | `rename.e2e.ts` | **B** + **A** |
| Code actions | `handler_test.go` | `code-actions.e2e.ts` | **B** + **A** |
| Code lens | — | `code-lens.e2e.ts` | **A** |
| Symbols | — | `symbols.e2e.ts` | **A** |
| Folding | — | `folding.e2e.ts` | **A** |
| Document highlight | `handler_test.go` (`TestRichAPIFixture_DocumentHighlight_UserSchema`, `TestDocumentHighlight_RefDirect`) | `document-highlight.e2e.ts` | **A** — host wiring; semantics in Go |
| Semantic tokens | — | `semantic-tokens.e2e.ts` | **A** |
| Inlay hints | — | `inlay-hints.e2e.ts` | **A** |
| Language IDs / classifier | `client/test/classifier.test.ts`, `src/utils.ts` | `language-ids.e2e.ts` | **C** |
| Client–server sync / scanner | — | `client-server-sync.e2e.ts`, `no-bulk-open.e2e.ts` | **C/A** |
| Multi-root workspace | — | `multi-root.e2e.ts` | **A** — session counts plus one focused cross-file routing journey |
| Sidecar (custom rules, Bun runner) | `server/lsp/bun/*_test.go`, `server/lsp/bun/runner/src/*.test.ts` | `sidecar-*.e2e.ts` | **A** for wiring; deep rules live in Go/Bun. If Bun never becomes ready, suites skip at `suiteSetup` so CI shows pending coverage rather than silent passes. |

## E2E tests by file (tag per `test("…")` title)

### `activation.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Extension should activate | A |
| Extension should expose test API | A |
| Sessions should start running | A |

### `client-server-sync.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Scanner should discover OpenAPI files after scan | C |
| Project info should include workspace path | C |

### `code-actions.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Code actions offered for file with diagnostics | B |
| Code actions do not crash on valid file | A |
| Code actions include disable-rule actions for telescope diagnostics | A |

### `code-lens.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Code lens shows reference counts on components | A |
| Code lens returns array for valid spec | A |

### `completion.e2e.ts`

| Test name | Tag |
|-----------|-----|
| $ref completion offers schema component names | B |
| Completion inside path item offers HTTP methods | B |
| Completion items have non-empty labels and valid kinds | A |

### `cross-file-diagnostics.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Both cross-file documents produce diagnostics independently | A |
| Editing a file triggers re-analysis with updated diagnostics | A |

### `definition-flow.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Local definition resolves to component in same file | B |
| Cross-file go-to-definition targets correct file | B |
| Target document has working hover after navigation | A |
| Target document has working document symbols | A |
| Find References works on local schema | B |

### `delta-sync.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Create/change/remove should update diagnostics | A |

### `diagnostics.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Should produce diagnostics for OpenAPI file with issues | B |
| Schema validation diagnostics should surface as errors | B |
| Should not produce errors for valid OpenAPI file | B |

### `document-highlight.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Document highlight on User schema returns array (host wiring) | A |

### `folding.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Folding ranges cover paths and operations | A |
| Folding ranges exist for simple spec too | A |

### `hover.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Hover on local $ref returns array (host wiring) | A |
| Hover on cross-file $ref is well-behaved when graph resolves | A |
| Hover returns empty or array at non-hoverable position | A |

### `inlay-hints.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Inlay hints appear for $ref values | A |
| Inlay hints do not crash on file without refs | A |

### `language-ids.e2e.ts`

| Test name | Tag |
|-----------|-----|
| OpenAPI YAML should be set to openapi-yaml on open | C |
| OpenAPI JSON should be set to openapi-json on open | C |
| Non-OpenAPI YAML should remain yaml | C |
| Open YAML should reclassify after becoming OpenAPI | C |

### `multi-root.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Should create sessions for all workspace folders | A |
| Should produce diagnostics for files in each workspace folder | A |
| Delta changes in folderA should not affect folderB project model | A |
| Cross-file definitions stay bound to the owning workspace folder | A |

### `no-bulk-open.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Startup scan should not open all discovered OpenAPI files | C |

### `providers.e2e.ts` (slim)

| Test name | Tag |
|-----------|-----|
| Document links include $ref links | B (handler `TestDocumentLinkHandler`) + **A** wiring |
| Format provider returns valid edits | B + **A** (buffer + LSP format path) |

### `rename.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Rename tag updates all references | B |
| Rename provider does not crash on non-renameable position | A |
| Cross-file schema rename returns edits for definition and refs | B |

### `semantic-tokens.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Semantic tokens returned for OpenAPI file | A |
| Semantic tokens data has reasonable size for rich spec | A |

### `symbols.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Document symbols include paths, operations, and components | A |
| Document symbols have valid ranges | A |
| Workspace symbols find schemas by query | A |
| Workspace symbols find operations by name | A |

### `sidecar-custom-rules.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Invalid file triggers custom-operation-summary diagnostic | A |
| Valid file has no custom-operation-summary diagnostics | A |

### `sidecar-generic-rules.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Invalid generic file triggers custom-version-required diagnostic | A |
| Valid generic file has no custom-version-required diagnostics | A |

### `sidecar-lifecycle.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Sidecar produces custom rule diagnostics after startup | A |
| Editing a file keeps sidecar available after save and restore | A - edit/save a normal fixture, confirm sidecar health via test API, then restore it and confirm sidecar health again |

### `sidecar-multi-file-refs.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Version-isolated external $ref resolves without unresolved-ref diagnostics | A |
| Path parameters declared via external path fragment stay aligned | A |

### `sidecar-openapi-rules.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Missing operationId triggers custom-require-operationid diagnostic | A |
| Out-of-order keys trigger custom-yaml-key-order diagnostic | A |

### `sidecar-schema-fixtures-json.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Invalid JSON schema fixture is analyzable | A |
| Valid JSON schema fixture is analyzable | A |

### `sidecar-schema-fixtures-legacy-zod.e2e.ts`

| Test name | Tag |
|-----------|-----|
| Invalid legacy zod-named fixture is analyzable | A |
| Valid legacy zod-named fixture has no json-schema errors | A |

## Go references (non-exhaustive)

- Handlers: `server/lsp/handler_test.go` — rename, completion, code action, document link, formatting.
- Integration / broken specs: `server/lsp/integration_test.go`.
- Formatting paths: `server/lsp/formatting_path_test.go`.
- Sidecar / Bun: `server/lsp/bun/*_test.go`, `custom_rules_integration_test.go`.
- Contract runner config mapping: `server/contractrunner/config_test.go` — `BuildBarometerClientConfig`.

## Client unit tests (Bun)

- `client/test/classifier.test.ts` — OpenAPI detection.
- `client/test/utils-patterns.test.ts` — `matchesPatternList`, key extractors, language ID helpers from `src/utils.ts`.

## Smoke E2E subset

When `TELESCOPE_E2E_SMOKE=1` is set (e.g. local fast-feedback loop), the extension host runs a **minimal** file list from `client/e2e-suites.json`. CI runs the full matrix, not smoke.
