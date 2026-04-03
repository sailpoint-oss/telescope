# Telescope V2 — Implementation Roadmap

## Guiding Principles

- **Keep what works.** The gossip framework, Telescope-owned diagnostic publishing, RuleBuilder API, 88 built-in rules, and CLI are not being thrown away — they are being migrated into the new architecture.
- **Upgrade the foundation.** The graph engine, pipeline stages, file classification, snapshot model, and extensibility layer are being replaced wholesale.
- **Bun is opt-in.** The entire Go core works without Bun. Custom TS/JS rules simply don't load if Bun is unavailable.
- **No big bang.** Each phase ships a working, testable, releasable state.

---

## Phase 0 — Foundations (Pre-work, no user-visible change)

> Goal: establish the architectural primitives everything else builds on. Nothing user-visible ships in this phase.

### 0.1 — Workspace Graph Engine

Replace the separate `Project Manager` + `IndexCache` with a unified directed graph.

**Deliver:**
- `WorkspaceGraph` with `NodeStore`, `EdgeIndex`, `ReverseEdgeIndex`, `RootSet`
- Version vectors per node (LSP document version + file mtime)
- Append-only change log; graph rebuilt reactively
- Invalidation cascade via reverse edge index — O(dependents), not O(all nodes)
- Cycle detection via color-marking DFS (white/gray/black) — cycles are valid in OAS 3.1, must not loop
- `IndexCache` and `Project Manager` remain in place as a facade over the new graph during migration

**Tests:**
- Unit: invalidation cascade correctness, cycle detection, concurrent reads during writes
- Benchmark: full index build on Stripe API spec, incremental update latency

### 0.2 — Pipeline Stage Separation

Break `BuildIndex` (currently one pass CST → typed model) into independently cacheable stages.

**Deliver:**
- Stage 1: `Raw` — bytes + dirty flag
- Stage 2: `Parse` — tree-sitter CST + source map (already exists, extract cleanly)
- Stage 3: `Lint` — structural validation, no resolution required
- Stage 4: `Bind` — `$ref` resolution, edge materialization, YAML anchor/alias dereferencing
- Stage 5: `Validate` — semantic correctness, runs in background goroutines with cancellation
- Stage 6: `Analyze` — cross-document rules, unused components, breaking changes
- Each stage keyed by (URI, version) — only reruns when inputs change
- `BuildIndex` becomes a thin orchestrator of these stages

**Tests:**
- Stage isolation: changing a downstream stage does not invalidate upstream cache entries
- Cancellation: in-progress validate/analyze stages cancel cleanly on document change

### 0.3 — Snapshot Model

Explicit separation between the snapshot served to sync requests and the snapshot being built.

**Deliver:**
- `Snapshot` type: immutable, complete view of the workspace at a point in time
- `SnapshotManager`: holds current snapshot N, builds snapshot N+1 in background
- Sync requests (hover, complete, definition) always read from snapshot N
- Async requests (diagnostics, full analysis) enqueue to the engine building N+1
- Goroutine pool per pipeline stage (configurable pool size)

**Tests:**
- Sync requests never block on ongoing analysis
- Snapshot N remains readable while N+1 is being built

### 0.4 — Fault-Tolerant Parser Integration

Ensure the tree-sitter layer feeds the pipeline correctly under broken documents.

**Deliver:**
- Tree-sitter incremental reparse on every keystroke (already in gossip — verify it's wired to the new pipeline)
- CST → `SemanticNode` transform as a separate, independently testable function
- YAML anchor/alias dereferencing in the transform layer (before any stage above sees the node)
- YAML block scalar offset mappers (`LiteralBlockMapper`, `FoldedBlockMapper`, `QuotedStringMapper`)
- Partial CST from error-recovery nodes used by stages 1–3; stages 4–6 degrade gracefully on parse errors

---

## Phase 1 — Server-Side File Classification

> Goal: the Go server owns classification, not just the VS Code extension. CLI and non-VS Code editors work correctly.

### 1.1 — Scored Heuristic Classifier

**Deliver:**
- `FileClassifier` with scored signal system:
  - `openapi:`/`swagger:` root key → 0.95
  - Root key fingerprinting (weighted sum)
  - Graph membership (already referenced by a known root) → 1.0
  - Workspace proximity prior
  - File extension as weak prior
  - Explicit config override → 1.0
- `FileClassification` result: `IsOpenAPI`, `Confidence`, `OpenAPIVersion`, `IsFragment`
- Classification cached per (URI, content version) in snapshot
- Borderline confidence: activate reduced feature set, no false-positive diagnostics

### 1.2 — Config-Driven Classification Override

**Deliver:**
- `.telescope/config.yaml` gains `roots`, `include`, `exclude` for explicit classification
- Server reads config on `initialized` and on file watch events
- Config classification takes precedence over heuristics

### 1.3 — Client Classification Delegated to Server

**Deliver:**
- VS Code extension sends all YAML/JSON `didOpen` to server
- Server responds with classification result via custom notification `$/telescope/classify`
- Extension applies language mode (`openapi-yaml`/`openapi-json`) based on server response
- Removes dependency on client-side first-100-lines check for correctness (keep as fast-path hint only)

---

## Phase 2 — Virtual Document System

> Goal: markdown in descriptions and embedded content are first-class LSP citizens.

### 2.1 — Virtual Document Projection

**Deliver:**
- `VirtualDocument` type with synthetic URI (`openapi-md://real-file.yaml#/paths/~1users/get/description`), content, language, parent URI, JSON pointer, source range
- `VirtualDocumentIndex` extracted during the `Parse` stage, cached in snapshot
- Three `OffsetMapper` implementations: `QuotedStringMapper`, `LiteralBlockMapper`, `FoldedBlockMapper`
- Position mapping: virtual → real and real → virtual, both directions

### 2.2 — Embedded Language Registry

**Deliver:**
- `EmbeddedLanguageProvider` interface: `Matches(pointer, language)`, `Extract(node)`, `Hover(vdoc, pos)`, `Complete(vdoc, pos)`, `Diagnostics(vdoc)`
- Registered providers:
  - `**/description` → markdown (goldmark)
  - `**/example` → JSON/YAML (schema-validated against the surrounding schema context)
  - `**/x-codeSamples/*/source` → language from sibling `lang` field
- Markdown diagnostics mapped back to real file positions via `OffsetMapper`

### 2.3 — Tree-sitter Injection Queries

**Deliver:**
- Tree-sitter injection `.scm` queries for markdown inside description string values
- Syntax highlighting of markdown in descriptions works in VS Code without virtual documents
- Virtual documents handle LSP features (diagnostics, completions); injections handle highlighting — these are separate concerns, both ship

---

## Phase 3 — Validation Pipeline Upgrade

> Goal: AJV-quality validation with source-mapped, enriched diagnostics.

### 3.1 — JSON Schema Validator Integration

**Deliver:**
- `santhosh-tekuri/jsonschema/v6` integrated as the core schema validator
- `AnnotatedInstance` wrapper: implements the validator's instance interface, carries source range at every node from the `SemanticNode` IR
- OAS 3.0, 3.1, Swagger 2.0 dialect schemas loaded and compiled on startup
- Pointer index used to attach exact source locations to every validation error

### 3.2 — Error Enrichment Pipeline

**Deliver:**
- `ErrorEnricher` interface: `Matches(err)`, `Enrich(err, ctx) → LSPValidationError`
- Built-in enrichers:
  - **Typo/fuzzy match**: Levenshtein on `enum`/`const` failures → "did you mean X?"
  - **Discriminator**: human-readable messages for discriminator mapping failures
  - **`$ref` context**: `RelatedInformation` pointing to the `$ref` definition site when error originates through a ref
  - **Missing required key**: diagnostic on parent object's opening brace + code action to insert placeholder
  - **Type mismatch**: inspect actual value, emit targeted message with the value shown
- Annotation collection (title, description, default, examples, deprecated) harvested during validation → fed to hover content for free

### 3.3 — Zod Schema Overlay System

**Deliver:**
- `ValidationPipeline`: core OAS schema + overlay schemas + enrichers
- Overlay schemas loaded from user-provided JSON Schema files (Zod export compatible)
- Overlay validation runs after core validation, results merged
- Overlays hot-reloaded on file change via `fsnotify`
- Config registration:
  ```yaml
  validation:
    overlays:
      - ./schemas/org-standards.json
      - ./schemas/naming-rules.json
  ```

---

## Phase 4 — Bun Custom Rules Sidecar

> Goal: TypeScript/JavaScript custom rules with full Bun DX, opt-in, zero impact on core when absent.

### 4.1 — IPC Protocol and Manager

**Deliver:**
- Unix socket (Windows: named pipe) transport
- MessagePack framing (`Envelope` with ID, type, payload)
- `bun.Manager`: spawn, connect, ready handshake, read loop, pending request map, graceful shutdown
- `Manager.Available() bool` — returns false cleanly when Bun not installed; all callers check this before use
- Timeout per request (default 30s, configurable), interrupt on timeout
- Crash recovery: if Bun process dies, manager attempts one restart then marks unavailable and logs

**Message types:**
- `loadRules` / `unloadRules`
- `runRules` → `ruleResult`
- `ruleError` (load-time or run-time, isolated per rule)
- `ping` / `pong` (health check)

### 4.2 — Serialization Layer

**Deliver:**
- `SerializedDoc`: URI, raw AST as `map[string]any`, rawText, format, OAS version, `PointerIndex`
- `PointerIndex`: flat `map[JSON pointer → SerializedRange]` built during `Parse` stage — O(1) `ctx.locate()` on Bun side
- `SerializedProjectIndex`: operationIDs, componentRefs, tags (cross-file data only, not full graph)
- `BatchRuleRequest`: one round trip per document per analysis cycle — document sent once, all matching rule IDs in one message
- Serialization benchmark: must complete in <5ms for a 5000-line spec

### 4.3 — Embedded Runner Script

**Deliver:**
- `runner.ts` (TypeScript, ~400 lines) implementing the Bun side of the IPC protocol
- Built to `runner.js` (single bundle) via `bun build` as part of the release process
- Embedded into the Go binary via `//go:embed`
- Extracted to temp dir on first use
- Visitor engine: walks serialized AST, dispatches to registered visitor functions in correct order
- Typed ref builders: `buildInfoRef`, `buildOperationRef`, `buildPathItemRef`, `buildSchemaRef`, etc. — matching the visitor table from the custom rules design
- Context object: `ctx.locate()`, `ctx.report()`, `ctx.reportAt()`, `ctx.fix()`, `ctx.offsetToRange()`, `ctx.project`
- Per-rule timeout via `Promise.race` + cleanup
- Rule crash isolation: one rule throwing does not affect other rules

### 4.4 — telescope-server NPM Package

**Deliver:**
- `packages/telescope-server` published to npm
- `defineRule()`, `defineGenericRule()`, `defineSchema()` with runtime validation of rule shape
- Full TypeScript types for all ref types (`InfoRef`, `OperationRef`, `SchemaRef`, etc.)
- Utility functions: `getValueAtPointer`, `joinPointer`, `splitPointer`, `getParentPointer`
- Versioned independently from the Go binary with a compatibility matrix in docs
- `bun add telescope-server` in the custom rules guide

### 4.5 — Rule Loading and Hot Reload

**Deliver:**
- Config registration:
  ```yaml
  rules:
    - path: ./rules/require-examples.ts
      runner: bun
      severity: warning
    - path: ./rules/naming.js
      runner: goja        # fallback, no Bun needed
    - path: ./rules/internal/*.ts
      runner: auto        # bun if available, goja otherwise
  ```
- `fsnotify` watcher on `.telescope/rules/` and `.telescope/schemas/`
- File change → `loadRules` message with updated path → analysis cache invalidated for matching documents → re-analysis triggered
- User sees updated diagnostics within ~1s of saving their rule file

### 4.6 — Goja Fallback Runner

**Deliver:**
- `goja.Runtime` pool (one VM per goroutine, not goroutine-safe)
- ES2015+ rule support without Bun dependency
- Same `SerializedDoc` / `PointerIndex` contract as Bun runner
- No TypeScript support (transpile externally or use plain JS)
- `runner: auto` selects Goja when Bun is unavailable

---

## Phase 5 — Graph-Powered LSP Features

> Goal: all 24 feature handlers upgraded to use the new graph engine.

### 5.1 — Go to Definition

**Upgrade:**
- `$ref` resolution via graph edge index (was: string parsing + file scan)
- Handles JSON Pointer, `$anchor`, path-based refs as distinct resolver types
- External HTTP `$ref` with disk cache keyed by URL+ETag
- operationId, tag, security scheme definitions all resolved through graph
- Cross-file navigation uses reverse edge index

### 5.2 — Find All References

**Upgrade:**
- Reverse edge index makes this O(dependents) — was O(all documents × all refs)
- Results grouped by file, sorted by position
- Works for: `$ref` targets, operationIds, tag names, security scheme names, component names

### 5.3 — Hover

**Upgrade:**
- Renders the resolved schema (post-`allOf` merge, post-`$ref` follow) not just the raw node
- Annotation collection from validation phase used directly (title, description, default, examples)
- Deprecation warnings with migration note when `deprecated: true`
- Cycle-safe rendering (max depth limit, "..." for truncated cyclic refs)
- Markdown descriptions rendered as HTML in hover popup

### 5.4 — Completions

**Upgrade:**
- `$ref` path completions use the component index from the graph — filtered by expected type at cursor position (schema ref won't suggest parameters)
- HTTP method completions aware of already-present methods on path item
- Status code completions with RFC descriptions
- Security scheme name completions from root document's `securitySchemes`
- `operationId` completions for `$ref`-style link objects
- Inside description values: delegate to markdown completion provider

### 5.5 — Rename

**Upgrade:**
- Rename operationId: updates all `$ref`-style links and `operationId` references across the full graph
- Rename component: updates all `$ref` strings pointing to that component across all files
- Rename file: updates all cross-file `$ref` paths (with confirmation dialog for large graphs)
- Preview rename: show all affected locations before applying

### 5.6 — Diagnostics Through `$ref`

**Upgrade:**
- When a validation error occurs inside a `$ref`-resolved node, emit a `RelatedInformation` entry at the `$ref` usage site pointing to the definition
- "Unresolved `$ref`" diagnostics include the resolved search path attempted
- Cycle diagnostics show the full cycle path

---

## Phase 6 — Project-Level Intelligence

> Goal: cross-file analysis that was previously only partially implemented.

### 6.1 — Dead Component Detection

**Deliver:**
- Walk reverse edge index: any component with zero inbound edges from outside `components/` is unreferenced
- Reported as `info` severity diagnostic on the component definition
- Code action: "Delete unused component"
- Suppressible per-component via `x-telescope-ignore: unused`

### 6.2 — Breaking Change Detection

**Deliver:**
- `telescope ci` command gains `--diff-base <ref>` flag
- Compares current graph snapshot against the base ref's snapshot (built from git checkout)
- Breaking changes detected: removed paths, removed operations, removed required parameters, type narrowing, removed enum values, authentication added to previously open operation
- Output as SARIF, JSON, or GitHub Actions annotations
- LSP mode: compare against last git-committed version of each file, show breaking changes as `warning` diagnostics

### 6.3 — Multi-Root Bundle Preview

**Deliver:**
- Code lens on root documents: "Preview bundled spec"
- Produces a single dereferenced JSON/YAML document (cycles broken with inline `$ref` to first occurrence)
- Opens as a virtual read-only document in the editor
- CLI: `telescope bundle api.yaml --output bundled.yaml`

---

## Phase 7 — Polish and Ecosystem

> Goal: production-quality release.

### 7.1 — Performance Benchmarks as CI Gates

**Deliver:**
- Benchmark suite in `server/bench/`:
  - Full index build: Stripe API spec (~7000 lines, ~300 components)
  - Incremental update: single field change in a large file
  - Completion latency: `$ref` completion in a file with 500+ components
  - Bun round trip: 20 rules against a large spec
- CI fails if benchmarks regress >20% vs baseline
- Benchmark results published as PR comments

### 7.2 — Debug and Observability

**Deliver:**
- Structured logging via `slog` throughout (already partially in place — make consistent)
- Every LSP request gets a trace ID; every graph operation logs touched nodes at `debug` level
- Custom notification `$/telescope/graphInfo`: returns live graph stats (node count, edge count, dirty nodes, last analysis duration per stage)
- VS Code extension gains a "Telescope: Show Graph Info" command that displays a panel with this data
- Per-rule timing exposed via `$/telescope/rulePerf` — slow rules (>100ms) logged as warnings

### 7.3 — Test Infrastructure

**Deliver:**
- Golden fixture tests: capture real workspace states, assert diagnostic output + completion lists + hover content
- Protocol conformance tests: partial results, work done progress, cancellation, large workspaces
- Bun runner integration tests: load real rule files, assert diagnostic output matches expected
- `testdata/large-workspace/`: Stripe API + Kubernetes API + a synthetic multi-root workspace with 50 fragment files
- Race detector enabled on all CI runs (`go test -race`)

### 7.4 — Documentation

**Deliver:**
- `ARCHITECTURE.md` updated to reflect V2 pipeline (replace current mermaid diagram)
- `docs/CUSTOM-RULES.md` updated: Bun rules, Goja rules, Zod schemas, migration from Go plugin rules
- `docs/RULES.md` updated with all 88 rules + any new rules added in phases above
- `packages/telescope-server/README.md`: full SDK reference with examples for every visitor type
- `CONFIGURATION.md`: new fields (roots, include/exclude, overlays, runner config)

---

## Migration Notes

### Existing Users

| Current Feature          | V2 Status                                                               |
| ------------------------ | ----------------------------------------------------------------------- |
| 88 built-in rules        | Preserved, migrated to new pipeline                                     |
| Go plugin binaries       | Preserved via `hashicorp/go-plugin` — existing plugins continue to work |
| Spectral YAML rulesets   | Preserved                                                               |
| `.telescope.yaml` config | Extended, backwards compatible                                          |
| VS Code extension        | Updated to delegate classification to server; otherwise same UX         |
| CLI `lint`/`ci`/`serve`  | Preserved, `ci` gains `--diff-base`                                     |

### Go Plugin Rules (Deprecated Path)

Go plugin binaries continue to work in V2 but are considered legacy. The migration path is:
1. Rewrite rule logic in TypeScript using `defineRule()` for Bun runner
2. Or rewrite as a built-in Go rule and contribute upstream

The plugin host is not removed in V2 — removal is a V3 consideration after the Bun ecosystem matures.

---

## Phase Sequencing Summary

```
Phase 0  ████████░░░░░░░░░░░░░░░░░░░░  Foundations (graph, pipeline, snapshots)
Phase 1  ░░░░████░░░░░░░░░░░░░░░░░░░░  Server-side classification
Phase 2  ░░░░░░████░░░░░░░░░░░░░░░░░░  Virtual documents + embedded markdown
Phase 3  ░░░░░░░░████░░░░░░░░░░░░░░░░  Validation pipeline upgrade
Phase 4  ░░░░░░░░░░██████░░░░░░░░░░░░  Bun custom rules sidecar
Phase 5  ░░░░░░░░░░░░░░████░░░░░░░░░░  Graph-powered LSP features
Phase 6  ░░░░░░░░░░░░░░░░████░░░░░░░░  Project-level intelligence
Phase 7  ░░░░░░░░░░░░░░░░░░░░████████  Polish + ecosystem
```

Phases 0–3 are internal/architectural — users see improved correctness and performance but no new features. Phases 4–7 deliver user-visible capabilities. This ordering means the foundation is solid before the feature work lands on top of it.