# Telescope V2 — Engineering Implementation Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   telescope/core                    │
│  graph · parser · classify · validate · analyze     │
│  zero LSP deps · zero CLI deps · importable         │
└──────────┬──────────────────┬───────────────────────┘
           │                  │                  │
    ┌──────▼──────┐   ┌──────▼───────┐   ┌──────▼────────────┐
    │ telescope/  │   │ telescope/   │   │ external consumer │
    │    lsp      │   │    cli       │   │    (sdk import)   │
    │             │   │              │   │                   │
    │ gossip      │   │ cobra cmds   │   │ imports core      │
    │ JSON-RPC    │   │ lint/ci/     │   │ directly as a     │
    │ protocol    │   │ bundle/serve │   │ Go package        │
    └─────────────┘   └──────────────┘   └───────────────────┘
```

Hard constraint: `core/` and `sdk/` compile with zero imports from `lsp/`, `cli/`, or any LSP protocol package. Enforced via `depguard` in CI.

### Embedded Bun Runtime (Custom Rules, Zod Validation, Spectral Rulesets)

Bun exists in the architecture for three purposes, all on the async analysis path:

1. **Custom rules** — user-authored TypeScript/JavaScript rules from `.telescope/rules/`.
2. **Zod overlay validation** — org-standard Zod schemas executed natively, with Zod's full refinement/transform/error-map support preserved. No lossy JSON Schema conversion.
3. **Spectral ruleset execution** — real `@stoplight/spectral-core` running actual Spectral YAML rulesets. 100% compatibility with the existing Spectral ecosystem, zero reimplementation in Go.

The LSP server, CLI, CI action, core OAS validation, built-in rules, file classification, and graph engine are all pure Go. Bun never touches the sync LSP request path (hover, completion, definition). It runs exclusively on the async analysis path, batched per document per analysis cycle.

```
Go Core (sync path, every keystroke, in-process):
  Parse → Classify → Lint → Bind → Core OAS Validate → LSP handlers

Bun Sidecar (async path, batched per analysis cycle, IPC):
  Zod overlays + Spectral rulesets + Custom rules
```

The Bun sidecar is compiled into a standalone binary via `bun build --compile` and embedded directly into the Telescope Go binary per-platform. At runtime, Telescope extracts the platform-appropriate compiled runner to a temp directory and spawns it lazily — only when the workspace config declares custom rules, Zod overlays, or Spectral rulesets. If none are configured, Bun is never extracted or spawned.

This means:
- **LSP** — pure Go. All 24 handlers, snapshot model, graph engine, diagnostics.
- **CLI** (`telescope lint`, `telescope ci`, `telescope bundle`) — pure Go via `sdk.Workspace`. Bun spawned only if the workspace has custom rules, Zod overlays, or Spectral rulesets.
- **CI Action** — shells out to the CLI binary.
- **88 built-in rules** — pure Go. Ship with the binary, run in-process at native speed.
- **Core OAS schema validation** — pure Go via `santhosh-tekuri/jsonschema`. Hot path, latency-critical.
- **Zod overlay validation** — Bun sidecar. Zod schemas run natively, preserving refinements, transforms, custom error maps, and `.describe()` metadata.
- **Spectral rulesets** — Bun sidecar. Actual `@stoplight/spectral-core`, not a Go reimplementation.
- **Custom rules** (`.telescope/rules/*.ts`, `.telescope/rules/*.js`) — Bun sidecar.

The tradeoff for embedding Bun is increased binary size (~50-90MB depending on platform for the Bun runtime), which is acceptable for an LSP server that runs as a long-lived background process.

## Module Layout

```
telescope/
├── go.mod
├── core/
│   ├── types/        # Range, Position, Severity, Diagnostic, Fix — NO LSP DEPS
│   ├── graph/        # WorkspaceGraph, DocumentSource, invalidation
│   ├── parser/       # tree-sitter wrapper, SemanticNode, OffsetMapper, CST→IR
│   ├── classify/     # FileClassifier, scored heuristics
│   ├── validate/     # ValidationPipeline, ErrorEnricher, overlays
│   ├── analyze/      # rule engine, visitor dispatch, RuleBuilder
│   └── index/        # OpenAPI typed model, IndexCache
├── sdk/              # stable public Go API, wraps core
│   ├── workspace.go
│   ├── options.go
│   ├── results.go
│   └── doc.go
├── lsp/
│   ├── server.go     # gossip wiring
│   ├── adapt/        # core types → protocol types
│   ├── handlers/     # all 24 feature handlers
│   └── bun/          # Bun sidecar manager
├── cli/
│   ├── main.go
│   └── commands/     # lint, ci, bundle, serve
├── rules/
│   └── builtin/      # 88 built-in rules
└── packages/
    └── telescope-server/  # npm package for Bun rules SDK
```

---

## Phase 0 — Foundations

No user-visible changes. Establishes every primitive the rest of the system builds on.

### 0.1 — Protocol-Independent Core Types

Create `core/types/` as the canonical type system shared by every consumer. No type in this package may reference `protocol.Range`, `protocol.Diagnostic`, or any LSP-specific struct.

**Files to create:**

`core/types/range.go`
- `Position` struct: `Line int`, `Character int` (both 0-indexed).
- `Range` struct: `Start Position`, `End Position`.
- Helper: `ContainsPosition(Range, Position) bool`.
- Helper: `IsEmpty(Range) bool`.

`core/types/diagnostic.go`
- `Severity` type (`int`): constants `SeverityError = 1`, `SeverityWarning = 2`, `SeverityInfo = 3`, `SeverityHint = 4`.
- `Diagnostic` struct: `URI string`, `Range Range`, `Severity Severity`, `Message string`, `Code string`, `Source string`, `Related []RelatedInfo`, `Fixes []Fix`.
- `RelatedInfo` struct: `URI string`, `Range Range`, `Message string`.
- `Fix` struct: `Description string`, `Edits []TextEdit`.
- `TextEdit` struct: `Range Range`, `NewText string`.

`core/types/doc.go`
- Package-level godoc explaining the purpose and the hard no-LSP-deps rule.

**CI gate:** Add a `go list -deps ./core/...` check that fails if any dependency path contains `protocol` or `jsonrpc2`.

### 0.2 — DocumentSource Interface

Create `core/graph/source.go`. This is how documents enter the graph regardless of origin (filesystem, LSP `didOpen`, synthetic injection from an external tool).

**Interface: `DocumentSource`**
- `URI() string` — canonical identifier. Filesystem sources use `file://` scheme. Synthetic sources use `synthetic://` scheme.
- `Read(ctx context.Context) (content []byte, version int64, err error)` — returns current content and a monotonically increasing version token.
- `Watch(ctx context.Context, onChange func()) (cancel func())` — registers a change callback. Returns nil if watching is unsupported.
- `Hint() ClassificationHint` — optional pre-classification to skip heuristics.

**Struct: `ClassificationHint`**
- `IsOpenAPI bool`, `OpenAPIVersion string` (empty = unknown), `IsFragment bool`, `Skip bool` (explicitly not OpenAPI).

**Implementations to deliver in this step:**

`core/graph/source_filesystem.go` — `FilesystemSource`
- Wraps a file path. `Read` does `os.ReadFile`. `Watch` uses `fsnotify` on the parent directory, filters to the specific file, calls `onChange`. Version derived from `mtime` as Unix nanos.

`core/graph/source_lsp.go` — `LSPSource`
- Wraps an LSP document overlay. `Read` returns the overlay content and the LSP document version. `Watch` is a no-op (the LSP layer pushes `didChange` events externally). This source is created/updated by the LSP `didOpen`/`didChange` handlers.

`core/graph/source_synthetic.go` — `SyntheticSource`
- For programmatic injection by external tools (the generator use case).
- `NewSyntheticSource(uri string, content []byte, hint ClassificationHint) *SyntheticSource`.
- `Update(content []byte)` — bumps internal version, calls all registered `onChange` callbacks.
- Thread-safe via `sync.RWMutex`.

**Tests:**
- `FilesystemSource`: write a temp file, `Read`, modify, verify version increments, verify `Watch` fires callback.
- `SyntheticSource`: create, `Read`, `Update`, verify version and callback.

### 0.3 — Workspace Graph Engine

Replace the separate Project Manager + IndexCache with a unified directed graph. This is the single most important data structure in the system.

**File: `core/graph/graph.go`**

**Struct: `WorkspaceGraph`**
- `NodeStore map[string]*GraphNode` — keyed by canonical URI.
- `EdgeIndex map[string][]Edge` — source URI → outbound edges (each edge: source pointer, target URI, target pointer).
- `ReverseEdgeIndex map[string][]Edge` — target URI → inbound edges.
- `RootSet map[string]bool` — URIs classified as root OpenAPI documents.
- `ChangeLog []ChangeEntry` — append-only log of mutations for debugging/replay.
- `mu sync.RWMutex` — readers (sync LSP requests) never block on writers (background analysis).

**Struct: `GraphNode`**
- `URI string`
- `Source DocumentSource`
- `Version int64` — last processed version.
- `Raw []byte` — cached content.
- `StageResults map[StageName]*StageResult` — per-stage cached output, keyed by stage name.
- `DirtyStages map[StageName]bool` — which stages need re-running.

**Struct: `Edge`**
- `SourceURI string`, `SourcePointer string` (JSON pointer to the `$ref` field).
- `TargetURI string`, `TargetPointer string` (JSON pointer to the target, empty = root of target doc).
- `Kind EdgeKind` — enum: `EdgeRef`, `EdgePathRef`, `EdgeAnchor`.

**Methods on `WorkspaceGraph`:**

`AddSource(src DocumentSource) error`
- Creates a `GraphNode`, reads initial content, marks all stages dirty.

`RemoveSource(uri string) error`
- Removes the node, removes all edges where this URI is source or target, triggers invalidation cascade on dependents.

`Invalidate(uri string)`
- Marks all stages dirty on the node.
- Walks `ReverseEdgeIndex[uri]` recursively, marks `Bind`/`Validate`/`Analyze` stages dirty on every dependent.
- Stops at nodes already marked dirty (avoids redundant traversal).
- Complexity: O(dependents), not O(all nodes).

`AddEdge(e Edge)`
- Inserts into `EdgeIndex[e.SourceURI]` and `ReverseEdgeIndex[e.TargetURI]`.
- Appends to `ChangeLog`.

`RemoveEdgesFrom(uri string)`
- Clears all outbound edges from `EdgeIndex[uri]`.
- Removes corresponding entries from `ReverseEdgeIndex`.
- Called at the start of the `Bind` stage before re-extracting edges.

`Roots() []string` — returns sorted list of root URIs.

`Dependents(uri string) []string` — returns transitive closure of reverse edges.

`ReadOnlyGraph` interface — exported read-only view for the SDK:
- `Node(uri string) *GraphNode`
- `Roots() []string`
- `Dependents(uri string) []string`
- `Edges(uri string) []Edge`

**Cycle detection:**

`DetectCycles() [][]string`
- Color-marking DFS: white (unvisited), gray (in current path), black (fully processed).
- Encountering a gray node = cycle. Record the cycle path.
- OpenAPI 3.1 allows cycles — this is informational, not fatal. The `Bind` stage uses a visited set to avoid infinite resolution loops.

**Tests:**
- Add 5 nodes with edges forming a diamond dependency. Invalidate the bottom node. Assert only the 2 direct dependents and the root are marked dirty, not the unrelated node.
- Add nodes forming a cycle (A→B→C→A). Assert `DetectCycles` returns the cycle. Assert `Invalidate` terminates and doesn't loop.
- Concurrent read during write: spawn a goroutine that reads `Node()` while another goroutine calls `Invalidate`. Assert no race (run with `-race`).

**Benchmark:**
- Load the Stripe API spec (approximately 7000 lines, 300+ components). Build the full graph. Measure time. Target: under 200ms.
- Single field change in a large file. Measure invalidation cascade time. Target: under 1ms.

### 0.4 — Pipeline Stage Separation

Break the monolithic `BuildIndex` into independently cacheable stages. Each stage is a pure function: `(inputs) → (output, error)`. Caching is keyed by `(URI, version)`.

**File: `core/graph/pipeline.go`**

**Type: `StageName string`**
- Constants: `StageRaw`, `StageParse`, `StageLint`, `StageBind`, `StageValidate`, `StageAnalyze`.

**Interface: `Stage`**
```go
type Stage interface {
    Name() StageName
    DependsOn() []StageName
    Run(ctx context.Context, node *GraphNode, graph *WorkspaceGraph) (*StageResult, error)
}
```

**Struct: `StageResult`**
- `StageName StageName`
- `Version int64` — the input version this result was computed from.
- `Data any` — stage-specific output (parsed CST, semantic AST, diagnostics, etc.).
- `Diagnostics []types.Diagnostic` — diagnostics produced by this stage.
- `Duration time.Duration`

**Stage implementations:**

**Stage 1 — `Raw`** (`core/graph/stage_raw.go`)
- Input: `DocumentSource.Read()`.
- Output: `[]byte` content + dirty flag.
- DependsOn: nothing.
- This stage simply reads the source and caches the bytes. If the version hasn't changed, it's a no-op.

**Stage 2 — `Parse`** (`core/parser/stage_parse.go`)
- Input: raw bytes from `StageRaw`.
- Output: tree-sitter CST + `SemanticNode` IR + `PointerIndex` + `VirtualDocumentIndex`.
- DependsOn: `StageRaw`.
- Details in section 0.5 below.

**Stage 3 — `Lint`** (`core/graph/stage_lint.go`)
- Input: `SemanticNode` IR from `StageParse`.
- Output: structural diagnostics (missing required fields, invalid key names, duplicate keys).
- DependsOn: `StageParse`.
- No `$ref` resolution needed. Operates on a single document in isolation.

**Stage 4 — `Bind`** (`core/graph/stage_bind.go`)
- Input: `SemanticNode` IR from `StageParse` + graph for cross-file resolution.
- Output: resolved edges added to the graph, `$ref` targets cached on the node, YAML anchor/alias fully dereferenced.
- DependsOn: `StageParse`.
- Procedure:
  1. Call `graph.RemoveEdgesFrom(uri)` to clear stale edges.
  2. Walk the `SemanticNode` tree. For every `$ref` value found:
     a. Parse the reference: local (`#/components/schemas/Foo`), relative file (`./models/foo.yaml#/Foo`), absolute, or HTTP.
     b. Create an `Edge` with source pointer and target URI+pointer.
     c. Call `graph.AddEdge(e)`.
  3. For YAML aliases, dereference in-place during the walk (this is a YAML concern, not OpenAPI — resolve before any higher stage sees the node).
  4. Build a visited set (`map[string]bool`) to detect and short-circuit cycles during resolution.

**Stage 5 — `Validate`** (`core/validate/stage_validate.go`)
- Input: `SemanticNode` IR + resolved refs from `StageBind`.
- Output: semantic diagnostics (schema validation errors, type mismatches, enum violations).
- DependsOn: `StageBind`.
- Runs in background goroutines with cancellation via `ctx`.
- Details in Phase 3.

**Stage 6 — `Analyze`** (`core/analyze/stage_analyze.go`)
- Input: full graph snapshot (all nodes at `StageBind` or above).
- Output: cross-document diagnostics (unused components, duplicate operationIds, breaking changes).
- DependsOn: `StageValidate`.
- Details in Phase 6.

**Orchestrator: `PipelineRunner`** (`core/graph/runner.go`)
- `Run(ctx context.Context, graph *WorkspaceGraph, uri string) error`
- For the given URI, walks the stage dependency chain. For each stage, checks if `node.StageResults[stage].Version == node.Version`. If yes, skip. If no, run the stage, store the result.
- Respects `ctx` cancellation at every stage boundary.
- Returns aggregated diagnostics from all stages.

**Tests:**
- Change a downstream stage input (mock a `Validate` input change). Assert upstream `Parse` cache is not invalidated.
- Cancel `ctx` mid-`Validate`. Assert the stage returns `ctx.Err()` and partial results are discarded.
- Run the full pipeline on a valid single-file spec. Assert zero diagnostics from `Lint` and `Validate`. Assert `Parse` produces a non-nil `SemanticNode`.

### 0.5 — Tree-Sitter Parser Integration and Semantic IR

**File: `core/parser/parser.go`**

**Struct: `Parser`**
- Wraps tree-sitter YAML and JSON grammars.
- `Parse(content []byte, format string) (*sitter.Tree, error)` — full parse.
- `IncrementalParse(oldTree *sitter.Tree, edit sitter.EditInput, content []byte) (*sitter.Tree, error)` — incremental reparse on keystroke. Tree-sitter's killer feature — do not bypass this.

**File: `core/parser/semantic.go`**

**Struct: `SemanticNode`**
```go
type SemanticNode struct {
    Kind     NodeKind           // NodeMapping, NodeSequence, NodeScalar, NodeNull
    Value    any                // Go native value for scalars
    Range    types.Range        // source location from tree-sitter node
    Children map[string]*SemanticNode  // for mappings
    Items    []*SemanticNode           // for sequences
    RawKey   string             // the key name in the parent mapping
    CST      *sitter.Node       // retained for cheap re-queries
}
```

**`NodeKind` enum:** `NodeMapping`, `NodeSequence`, `NodeScalar`, `NodeNull`.

**Struct: `ASTBuilder`**
- `BuildFromCST(root *sitter.Node, source []byte) (*SemanticNode, error)`
- Recursive tree walk. Switch on `n.Type()`:
  - `"block_mapping"` / `"flow_mapping"` → `NodeMapping`, recurse into key-value pairs.
  - `"block_sequence"` / `"flow_sequence"` → `NodeSequence`, recurse into items.
  - `"plain_scalar"` / `"double_quoted_scalar"` / `"single_quoted_scalar"` → `NodeScalar`, parse value (handle booleans, numbers, nulls per YAML 1.2 core schema).
  - `"block_scalar"` → `NodeScalar`, handle `|` (literal) and `>` (folded) styles, strip indentation, apply chomping indicator.
  - `"alias"` → look up anchor in a `map[string]*SemanticNode` built during the walk, return the referenced node (deep copy to avoid aliased mutation). This is YAML-level alias resolution, separate from `$ref`.
  - `"anchor"` → register the anchored node in the anchor map, continue.
  - Error recovery nodes → produce a partial `SemanticNode` with `Kind = NodeNull` and a diagnostic "syntax error at line X". Stages 1-3 still function on partial trees. Stages 4-6 degrade gracefully.

**File: `core/parser/pointers.go`**

**Struct: `PointerIndex`** — `map[string]types.Range`

**Function: `BuildPointerIndex(node *SemanticNode, prefix string, idx PointerIndex)`**
- Recursive walk. For each node, record `idx[prefix] = node.Range`.
- For mapping children: `prefix + "/" + escapeJSONPointer(key)`.
- For sequence items: `prefix + "/" + strconv.Itoa(i)`.
- JSON pointer escaping: `~` → `~0`, `/` → `~1`.

This index enables O(1) `ctx.locate(uri, pointer)` on the Bun side and in the validator's source-mapping layer.

**File: `core/parser/virtual.go`**

**Struct: `VirtualDocument`**
```go
type VirtualDocument struct {
    URI         string      // "openapi-md://real-file.yaml#/paths/~1users/get/description"
    Content     string
    Language    string      // "markdown", "json", "yaml"
    ParentURI   string
    JSONPointer string
    SourceRange types.Range
    ScalarStyle string      // "literal", "folded", "quoted", "plain"
}
```

**Interface: `OffsetMapper`**
- `ToReal(virtualPos types.Position) types.Position`
- `ToVirtual(realPos types.Position) types.Position`

**Implementations:**
- `LiteralBlockMapper` — YAML `|` style. Lines map directly after accounting for base indentation level and the indicator line. Most common for long descriptions.
- `FoldedBlockMapper` — YAML `>` style. Lines are folded (newlines become spaces except for blank-line-separated paragraphs). Map virtual line/col back to the real folded source.
- `QuotedStringMapper` — `"` or `'` style. Account for leading quote offset and escape sequences (`\"`, `\\`, `\n`, etc.).

**Function: `ExtractVirtualDocuments(node *SemanticNode, uri string) []VirtualDocument`**
- Walk the `SemanticNode` tree. At each scalar node, check if the parent key matches a known embedded content pointer pattern:
  - `**/description` → language `"markdown"`.
  - `**/example` → language inferred from context (JSON if under a JSON media type, YAML otherwise).
  - `**/x-codeSamples/*/source` → language from sibling `lang` field.
- For each match, build a `VirtualDocument` with the appropriate `OffsetMapper`.

**Tests:**
- Parse a YAML file with a literal block description. Assert `SemanticNode` has correct `Range` for the description value. Assert `PointerIndex` maps `/paths/~1users/get/description` to the correct range.
- Parse a file with a YAML alias. Assert the alias is resolved in the `SemanticNode` — no alias nodes survive the transform.
- Parse a file with a syntax error mid-document. Assert partial `SemanticNode` is produced for the valid portion. Assert an error diagnostic is emitted for the broken portion.
- `LiteralBlockMapper`: given a 5-line literal block starting at line 10 with 4-space indent, assert `ToReal(Position{Line: 2, Character: 5})` returns `Position{Line: 12, Character: 9}`.
- Benchmark: Parse the Stripe API spec. Target: under 50ms for full parse, under 5ms for incremental reparse after a single character edit.

### 0.6 — Snapshot Model

**File: `core/graph/snapshot.go`**

**Struct: `Snapshot`**
- Immutable, complete view of the workspace at a point in time.
- `ID int64` — monotonically increasing.
- `Nodes map[string]*GraphNode` — deep copy of node store at snapshot creation time.
- `PointerIndices map[string]PointerIndex` — per-URI pointer indices.
- `VirtualDocs map[string][]VirtualDocument` — per-URI virtual documents.
- `Diagnostics map[string][]types.Diagnostic` — per-URI aggregated diagnostics from all stages.
- `Classifications map[string]*FileClassification` — per-URI classification results.

**Struct: `SnapshotManager`**
- Holds `current *Snapshot` (served to sync requests) and builds `next *Snapshot` in background.
- `Current() *Snapshot` — returns the current snapshot. Called by sync LSP handlers (hover, complete, definition). Never blocks.
- `Enqueue(uri string)` — marks a URI for re-processing in the next snapshot.
- `BuildNext(ctx context.Context) error` — runs the pipeline on all enqueued URIs, produces a new snapshot, atomically swaps `current`. Called by the analysis engine in a background goroutine.
- `OnSnapshot(fn func(*Snapshot))` — registers a callback fired after each new snapshot. Used by the LSP layer to push diagnostics.

**Concurrency contract:**
- `Current()` is lock-free (atomic pointer swap).
- `BuildNext` holds a write lock only during the final swap.
- Multiple readers of `Current()` proceed concurrently with `BuildNext`.
- Goroutine pool per pipeline stage. Pool size configurable via `Option`. Default: `runtime.NumCPU()`.

**Tests:**
- Create a snapshot, start building the next one (slow stage simulated with `time.Sleep`), verify `Current()` returns the old snapshot during the build.
- After `BuildNext` completes, verify `Current()` returns the new snapshot with updated diagnostics.

### 0.7 — SDK Package

**File: `sdk/workspace.go`**

```go
type Workspace struct {
    graph    *graph.WorkspaceGraph
    pipeline *graph.PipelineRunner
    snapMgr  *graph.SnapshotManager
    config   *Config
    mu       sync.RWMutex
}
```

**Public API:**

`New(opts ...Option) (*Workspace, error)` — creates a workspace with the given options. Options include `WithConfig(*Config)`, `WithBuiltinRules(bool)`, `WithCustomRules(bool)`, `WithLogger(*slog.Logger)`.

`AddSource(src graph.DocumentSource) error` — registers a source, triggers classification and initial pipeline run.

`RemoveSource(uri string) error` — removes a source and invalidates dependents.

`Analyze(ctx context.Context) (*AnalysisResult, error)` — runs the full pipeline on all sources. Blocks until complete or cancelled.

`AnalyzeURI(ctx context.Context, uri string) (*AnalysisResult, error)` — runs pipeline for a single URI and its dependents.

`Watch(ctx context.Context, onChange func(*AnalysisResult)) (cancel func(), err error)` — registers a change callback, starts background processing via `SnapshotManager`.

`Index(uri string) *openapi.Index` — returns the resolved OpenAPI index for a URI from the current snapshot. Nil if unknown.

`Graph() graph.ReadOnlyGraph` — read-only graph access.

`Close() error` — shuts down background goroutines, Bun sidecar if running, fsnotify watchers.

**File: `sdk/results.go`**

```go
type AnalysisResult struct {
    Diagnostics    map[string][]types.Diagnostic
    NodeCount      int
    EdgeCount      int
    RootDocuments  []string
    StageDurations map[string]time.Duration
    RuleDurations  map[string]time.Duration
}
```

**File: `sdk/options.go`**
- `Option` type (functional options pattern).
- `WithConfig`, `WithBuiltinRules`, `WithCustomRules`, `WithLogger`, `WithGoroutinePoolSize`.

**Integration test: `sdk/sdk_test.go`**
- Create a workspace.
- Add a `SyntheticSource` with a minimal valid OpenAPI 3.1 spec.
- Call `Analyze`.
- Assert: zero error diagnostics, `RootDocuments` contains the synthetic URI, `NodeCount == 1`.
- Add a second synthetic source with a `$ref` pointing to the first.
- Call `Analyze`.
- Assert: `EdgeCount >= 1`, both URIs in diagnostics map.
- Update the first source with an invalid spec (missing `info`).
- Call `Analyze`.
- Assert: diagnostics for the first URI contain a "missing required field: info" error.

This test is the primary proof that the core/sdk boundary is clean and the package works without LSP.

---

## Phase 1 — Server-Side File Classification

### 1.1 — Scored Heuristic Classifier

**File: `core/classify/classifier.go`**

**Struct: `FileClassifier`**
- `Classify(content []byte, uri string, graph graph.ReadOnlyGraph) *FileClassification`

**Struct: `FileClassification`**
- `IsOpenAPI bool`, `Confidence float64`, `OpenAPIVersion string`, `IsFragment bool`, `Signals []string`.

**Scoring algorithm:**

1. Check for `openapi:` or `swagger:` root key. If present, score += 0.95. Extract version string.
2. Root key fingerprinting — parse only the top-level keys (fast, no full parse needed). Known root keys and weights:
   - `openapi`/`swagger`: 0.95
   - `paths`: 0.60
   - `components`: 0.60
   - `webhooks`: 0.50
   - `info`: 0.30
   - `tags`: 0.20
   - `servers`: 0.40
   - `security`: 0.30
   - `externalDocs`: 0.30
   - Fragment-level: `schema` 0.40, `properties` 0.30, `allOf`/`oneOf`/`anyOf` 0.50, `$ref` 0.40, `parameters` 0.40, `responses` 0.40.
   - Sum weights of present keys. Cap at 1.0.
3. Graph membership — if `graph.ReverseEdgeIndex` contains edges pointing to this URI, score = 1.0, `IsFragment = true`.
4. Workspace proximity — if the file's directory contains a known root spec, score += 0.10.
5. File extension — `.openapi.yaml` / `.oas.yaml` / `.openapi.json`: += 0.15. Plain `.yaml`/`.json`: += 0.0 (no signal).
6. Explicit config override — if the URI matches a pattern in `config.roots` or `config.include`, score = 1.0.

**Threshold:** `IsOpenAPI = score >= 0.60`. Below 0.60 but above 0.30: possible OpenAPI, activate reduced feature set (no diagnostics, basic hover only).

**Caching:** Classification result cached in the `GraphNode` per `(URI, version)`. Re-classification only on content change or graph edge change.

### 1.2 — Config-Driven Classification

**File: `core/classify/config.go`**

Extend the workspace config schema (`.telescope/config.yaml`):

```yaml
roots:
  - ./specs/petstore.yaml
  - ./specs/billing-api.yaml
include:
  - ./schemas/**/*.yaml
  - ./components/**/*.json
exclude:
  - ./config/**
  - ./node_modules/**
```

- `roots`: explicit root documents. Classification = root, confidence 1.0.
- `include`: glob patterns. Matching files classified as OpenAPI fragments, confidence 1.0.
- `exclude`: glob patterns. Matching files skipped entirely (`ClassificationHint.Skip = true`).

Config is read on server `initialized` and on `fsnotify` events for `.telescope/config.yaml`.

### 1.3 — Client Classification Delegation

**LSP custom notification: `$/telescope/classify`**

Direction: server → client.

Payload:
```json
{
  "uri": "file:///path/to/file.yaml",
  "isOpenAPI": true,
  "version": "3.1",
  "isFragment": false,
  "confidence": 0.95
}
```

The VS Code extension receives this notification and applies the appropriate language mode (`openapi-yaml` / `openapi-json`). The extension's client-side first-100-lines check is retained as a fast-path hint only — the server's classification is authoritative.

The server registers for `yaml`, `json`, and `jsonc` document selectors. All YAML/JSON `didOpen` events are sent to the server. The server classifies internally and responds with `$/telescope/classify`. Files classified as non-OpenAPI are ignored by all subsequent handlers.

---

## Phase 2 — Virtual Document System

### 2.1 — Virtual Document Projection

The `VirtualDocument` struct and `ExtractVirtualDocuments` function are delivered in Phase 0.5. This phase wires them into the LSP.

**File: `lsp/handlers/virtual.go`**

`VirtualDocumentManager`
- Maintains a `map[string][]VirtualDocument` keyed by parent URI, sourced from the current snapshot.
- On snapshot update, diff the virtual documents and emit `textDocument/publishDiagnostics` for any that changed.

**Position mapping integration:**
- Every LSP handler that receives a position checks if the position falls within a virtual document's `SourceRange`.
- If yes, maps the position to virtual document coordinates, delegates to the appropriate embedded language provider, maps the result back to real file coordinates.

### 2.2 — Embedded Language Registry

**File: `core/parser/embedded.go`**

**Interface: `EmbeddedLanguageProvider`**
```go
type EmbeddedLanguageProvider interface {
    Matches(pointer string, language string) bool
    Extract(node *SemanticNode) []VirtualDocument
    Hover(vdoc VirtualDocument, pos types.Position) (*HoverResult, error)
    Complete(vdoc VirtualDocument, pos types.Position) ([]CompletionItem, error)
    Diagnostics(vdoc VirtualDocument) ([]types.Diagnostic, error)
}
```

**Registered providers:**

`MarkdownProvider` (`core/parser/embedded_markdown.go`)
- Matches: `**/description` pointer pattern.
- Uses `goldmark` for markdown parsing and linting.
- Diagnostics: broken links, unclosed code fences, invalid heading levels (configurable).
- Hover: renders markdown as HTML for hover popups.
- Completions: CommonMark link syntax, fenced code block language IDs.

`ExampleProvider` (`core/parser/embedded_example.go`)
- Matches: `**/example` and `**/examples/*/value` pointer patterns.
- Validates the example content against the surrounding schema context using the JSON Schema validator.
- Diagnostics: schema validation errors mapped back to real file positions.

`CodeSampleProvider` (`core/parser/embedded_codesample.go`)
- Matches: `**/x-codeSamples/*/source` pointer pattern.
- Language determined from sibling `lang` field.
- Diagnostics: syntax validation only (no semantic analysis).

### 2.3 — Tree-Sitter Injection Queries

**File: `queries/yaml/injections.scm`**

Tree-sitter injection query that marks description string values as markdown for syntax highlighting:

```scheme
((block_mapping_pair
  key: (flow_node) @_key
  value: (block_node (block_scalar) @injection.content))
 (#match? @_key "description")
 (#set! injection.language "markdown"))
```

This handles syntax highlighting. Virtual documents handle LSP features (diagnostics, completions). These are separate concerns — both ship.

---

## Phase 3 — Core Validation Pipeline

### 3.1 — JSON Schema Validator Integration

**File: `core/validate/validator.go`**

**Dependency:** `github.com/santhosh-tekuri/jsonschema/v6`

**Struct: `SchemaValidator`**
- `compiler *jsonschema.Compiler` — configured on startup.
- `schemas map[string]*jsonschema.Schema` — compiled schemas for OAS 3.0, 3.1, Swagger 2.0.

**Initialization:**
1. Create a `jsonschema.Compiler`.
2. Register a custom `Loader` that resolves schema URIs against embedded OAS meta-schemas (shipped with the binary via `//go:embed`).
3. Compile the three dialect schemas. Cache them.

**Struct: `AnnotatedInstance`**
- Wraps `*SemanticNode`.
- Implements whatever interface `santhosh-tekuri/jsonschema` expects for validation input.
- Carries `types.Range` at every node from the `SemanticNode` IR.
- When the validator reports an error at an instance path, the `AnnotatedInstance` maps that path to a `PointerIndex` lookup → exact source range.

**`Validate(node *SemanticNode, pointers PointerIndex, version string) []types.Diagnostic`**
1. Determine the OAS version from the `openapi` or `swagger` field.
2. Select the correct compiled schema.
3. Wrap the `SemanticNode` as an `AnnotatedInstance`.
4. Run `schema.Validate(instance)`.
5. For each validation error, resolve the instance path to a source range via `pointers[instancePath]`.
6. Pass each error through the enrichment pipeline (3.2).
7. Return enriched diagnostics.

### 3.2 — Error Enrichment Pipeline

**File: `core/validate/enrich.go`**

**Interface: `ErrorEnricher`**
```go
type ErrorEnricher interface {
    Matches(err *RawValidationError) bool
    Enrich(err *RawValidationError, ctx *EnrichmentContext) *types.Diagnostic
}
```

**`EnrichmentContext`** — provides access to the `SemanticNode`, `PointerIndex`, and graph for cross-reference information.

**Built-in enrichers:**

`TypoEnricher` (`core/validate/enrich_typo.go`)
- Matches: `enum` or `const` validation failures.
- Action: compute Levenshtein distance between the actual value and all valid enum values. If closest match distance <= 2, suggest "Did you mean X?".
- Produces a `Fix` with a `TextEdit` replacing the value.

`DiscriminatorEnricher` (`core/validate/enrich_discriminator.go`)
- Matches: errors where the schema path contains `discriminator`.
- Action: extract the discriminator property name and mapping, emit a human-readable message explaining which variant was expected and what was found.

`RefContextEnricher` (`core/validate/enrich_ref.go`)
- Matches: any error where the instance path passes through a resolved `$ref`.
- Action: add a `RelatedInfo` entry pointing to the `$ref` definition site. The user sees both where the error is and where the schema that caused it lives.

`MissingRequiredEnricher` (`core/validate/enrich_required.go`)
- Matches: "required property X missing" errors.
- Action: point the diagnostic at the parent object's opening brace (not the missing key, which doesn't exist). Produce a `Fix` that inserts a placeholder `X: TODO` at the appropriate indentation.

`TypeMismatchEnricher` (`core/validate/enrich_type.go`)
- Matches: `type` validation failures.
- Action: include the actual value and expected type in the message. "Expected `number`, got string `\"hello\"`".

**Enrichment pipeline execution:**
- For each raw error, iterate enrichers. First match wins (enrichers are ordered by specificity).
- If no enricher matches, produce a default diagnostic with the raw validator message and the source-mapped range.

### 3.3 — Validation Pipeline Assembly

**File: `core/validate/pipeline.go`**

**Struct: `ValidationPipeline`**
```go
type ValidationPipeline struct {
    Core      *SchemaValidator
    Enrichers []ErrorEnricher
}
```

**`Validate(node *SemanticNode, pointers PointerIndex, version string) []types.Diagnostic`**
1. Run `Core.Validate(...)` → collect raw errors.
2. Run enrichment pipeline on all raw errors.
3. Return final diagnostics.

Note: Zod overlay validation and Spectral rulesets are handled entirely in the Bun sidecar (Phase 4.6, 4.7). They run on the async analysis path, not in this Go-side validation pipeline. This pipeline handles only core OAS structural/schema validation using `santhosh-tekuri/jsonschema` — the latency-critical hot path that runs on every keystroke.

---

## Phase 4 — Bun Sidecar (Custom Rules, Zod Validation, Spectral Rulesets)

Bun's scope is strictly limited to three async analysis concerns: custom rules, Zod overlay validation, and Spectral ruleset execution. It is not involved in any core LSP, CLI, or CI functionality. The sidecar is spawned lazily — only when the workspace config declares custom rules, Zod overlays, or Spectral rulesets. Workspaces without any of these never extract or spawn the Bun binary.

### 4.1 — IPC Protocol and Manager

**File: `lsp/bun/protocol.go`**

```go
type MessageType string

const (
    MsgLoadRules   MessageType = "loadRules"
    MsgUnloadRules MessageType = "unloadRules"
    MsgRunRules    MessageType = "runRules"
    MsgRuleResult  MessageType = "ruleResult"
    MsgRuleError   MessageType = "ruleError"
    MsgReady       MessageType = "ready"
    MsgPing        MessageType = "ping"
    MsgPong        MessageType = "pong"
)

type Envelope struct {
    ID      string            `msgpack:"id"`
    Type    MessageType       `msgpack:"type"`
    Payload msgpack.RawMessage `msgpack:"payload"`
}
```

**Message schemas:**

`LoadRulesRequest`: `Rules []RuleConfig`, `WorkDir string`.
`RuleConfig`: `ID string`, `Path string` (absolute), `Kind string` ("openapi" | "generic" | "schema"), `Severity string` (override), `Patterns []string`, `Options map[string]any`.

`RunRulesRequest`: `DocumentURI string`, `RuleIDs []string`, `Document SerializedDoc`, `Project SerializedProjectIndex`.

`RunRulesResponse`: `DocumentURI string`, `Diagnostics []SerializedDiagnostic`, `Fixes []SerializedFix`, `RuleTimings map[string]float64`, `Errors []RuleRunError`.

`RuleRunError`: `RuleID string`, `Error string`, `Phase string` ("load" | "run").

`RunZodRequest`: `DocumentURI string`, `Document SerializedDoc`, `Schemas []ZodSchemaConfig`.
`ZodSchemaConfig`: `ID string`, `Path string` (absolute path to `.ts` file exporting Zod schema), `TargetPointers []string` (JSON pointers to validate, e.g. `["/paths/*/get/responses/*/content"]`).
`RunZodResponse`: `DocumentURI string`, `Diagnostics []SerializedDiagnostic`, `SchemaTimings map[string]float64`, `Errors []RuleRunError`.

`RunSpectralRequest`: `DocumentURI string`, `Document SerializedDoc`, `RulesetPaths []string` (absolute paths to `.spectral.yaml` files).
`RunSpectralResponse`: `DocumentURI string`, `Diagnostics []SerializedDiagnostic`, `RulesetTimings map[string]float64`, `Errors []RuleRunError`.

**File: `lsp/bun/manager.go`**

**Struct: `Manager`**
```go
type Manager struct {
    mu         sync.RWMutex
    proc       *os.Process
    conn       net.Conn
    pending    map[string]chan *Envelope
    pendingMu  sync.Mutex
    ready      chan struct{}
    workDir    string
    runnerPath string    // path to extracted compiled runner binary
    logger     *slog.Logger
    alive      atomic.Bool
}
```

**`NewManager(workDir string, logger *slog.Logger) (*Manager, error)`**
- Does not extract or spawn anything. Just initializes the struct. The runner binary is extracted and spawned lazily on the first `RunRules` call (or explicitly via `Start`). If no custom rules are configured, the manager is never started and Bun is never touched.

**`Available() bool`** — returns `m != nil && m.alive.Load()`. Before `Start` is called, returns false. The pipeline checks `hasCustomRulesFor(uri)` first, then calls `EnsureStarted()` which triggers lazy extraction and spawn on first use.

**`Start(ctx context.Context) error`**
1. Extract the embedded compiled runner binary for the current `runtime.GOOS`/`runtime.GOARCH` to a temp directory (see 4.3). If extraction fails (unsupported platform, disk full), return error — the caller logs and continues without custom rules.
2. Create a Unix socket at `$TMPDIR/telescope-<pid>.sock`. On Windows, use a named pipe `\\.\pipe\telescope-<pid>`.
3. Spawn the extracted runner binary directly (it's a self-contained executable — no `bun run` wrapper needed). Set env `TELESCOPE_SOCKET=<socketPath>`. Set `cmd.Dir = workDir`. Redirect stderr to a `slog`-backed writer at `Warn` level.
4. Accept connection on the socket with a 10-second deadline.
5. Start the `readLoop` goroutine.
6. Wait for a `MsgReady` envelope with a 10-second timeout.
7. Set `alive = true`.

**`EnsureStarted(ctx context.Context) error`** — calls `Start` if not already started. Thread-safe via `sync.Once`. This is what the pipeline calls before the first `RunRules`.

**`readLoop(ctx context.Context)`**
- Reads `Envelope` messages from the socket in a loop.
- For `MsgReady`: close the `ready` channel.
- For `MsgRuleResult` / `MsgRuleError`: look up `pending[envelope.ID]`, send the envelope on that channel.
- For `MsgPong`: log at debug level.
- On read error: log, set `alive = false`, attempt one restart.

**`RunRules(ctx context.Context, req *RunRulesRequest) (*RunRulesResponse, error)`**
1. If `!Available()`, return empty response (no error).
2. Marshal `req` to msgpack.
3. Generate a unique request ID (UUID or monotonic counter).
4. Create a response channel, register in `pending[id]`.
5. Send the envelope.
6. Select on: response channel, `ctx.Done()`, 30-second timeout.
7. On response: unmarshal `RunRulesResponse`, return.
8. Cleanup: remove from `pending` in all cases.

**`RunZod(ctx context.Context, req *RunZodRequest) (*RunZodResponse, error)`**
- Same request/response pattern as `RunRules`. Sends `MsgRunZod`, waits for `MsgZodResult`.

**`RunSpectral(ctx context.Context, req *RunSpectralRequest) (*RunSpectralResponse, error)`**
- Same request/response pattern as `RunRules`. Sends `MsgRunSpectral`, waits for `MsgSpectralResult`.

**`LoadRules(ctx context.Context, req *LoadRulesRequest) error`**
- Same request/response pattern as `RunRules`. Waits for `MsgReady` response.

**`Shutdown()`**
- Send a close on the socket. Wait 5 seconds for the Bun process to exit. If it doesn't, `proc.Kill()`.

**Crash recovery:**
- If the Bun process dies (detected by `readLoop` getting an EOF), the manager attempts one restart via `Start`.
- If the restart fails, `alive` is set to false permanently. Custom rules won't run for the rest of this session.
- All pending requests receive an error.

**Health check:**
- Every 30 seconds, send `MsgPing`. If no `MsgPong` within 5 seconds, treat as dead, trigger restart.

### 4.2 — Serialization Layer

**File: `lsp/bun/serialize.go`**

**Struct: `SerializedDoc`**
```go
type SerializedDoc struct {
    URI      string            `msgpack:"uri"`
    AST      map[string]any    `msgpack:"ast"`
    RawText  string            `msgpack:"rawText"`
    Format   string            `msgpack:"format"`   // "yaml" | "json"
    Version  string            `msgpack:"version"`   // "3.0" | "3.1" | "2.0"
    Pointers map[string]SerializedRange `msgpack:"pointers"`
}
```

**Struct: `SerializedRange`**
- `StartLine int`, `StartChar int`, `EndLine int`, `EndChar int`.

**Struct: `SerializedProjectIndex`**
```go
type SerializedProjectIndex struct {
    OperationIDs  map[string][]string `msgpack:"operationIds"`
    ComponentRefs map[string][]string `msgpack:"componentRefs"`
    Tags          map[string][]string `msgpack:"tags"`
}
```

**Function: `SerializeDoc(node *GraphNode, snap *Snapshot) SerializedDoc`**
- Converts the `SemanticNode` to `map[string]any` (the raw resolved value tree — what rule authors expect to see as a plain JS object).
- Includes the `PointerIndex` converted to `map[string]SerializedRange`.
- Includes raw text for `ctx.offsetToRange()` support.

**Function: `SerializeIndex(snap *Snapshot) SerializedProjectIndex`**
- Walks the snapshot's graph to extract cross-file indices: operationID → []URI, component ref → []URI, tag → []URI.
- Only sends cross-file data. Rules get individual document ASTs separately.

**Batching contract:**
- One round trip per document per analysis cycle.
- Document content sent once, all matching rule IDs in one message.
- Round trip includes all matching rules for that document.

**Benchmark:** Serialization must complete in <5ms for a 5000-line spec. Add this to the benchmark suite.

### 4.3 — Embedded Runner Script

**File: `lsp/bun/runner.go`**

```go
//go:embed runner/dist/runner.js
var runnerScript []byte

func (m *Manager) extractRunner() (string, error) {
    dir, err := os.MkdirTemp("", "telescope-runner-*")
    if err != nil {
        return "", err
    }
    path := filepath.Join(dir, "runner.js")
    return path, os.WriteFile(path, runnerScript, 0700)
}
```

**Source: `lsp/bun/runner/src/runner.ts`** (~400 lines)

Structure:
1. Connect to Unix socket via `TELESCOPE_SOCKET` env var.
2. On connect, send `MsgReady`.
3. Message loop: decode msgpack envelopes, dispatch by type.
4. `handleLoadRules`: for each rule config, `await import(ruleConfig.path)`. Store in `loadedRules` map. On import error, send `MsgRuleError` with phase `"load"`.
5. `handleRunRules`: build context once per document (shared across rules). For each rule ID, run the rule with `Promise.race([rulePromise, timeoutPromise])`. Collect diagnostics, fixes, timings, errors. Send `MsgRuleResult`.
6. `handleRunZod`: load and cache Zod schemas, validate matching nodes, map `ZodError.issues` to diagnostics. Send `MsgZodResult`. (See 4.6.)
7. `handleRunSpectral`: load and cache Spectral rulesets, run `spectral.run()`, map results to diagnostics, send `MsgSpectralResult`. (See 4.7.)
8. `handlePing`: send `MsgPong`.

**File: `lsp/bun/runner/src/engine.ts`** — Visitor engine

`runOpenAPIRule(rule, ctx, doc, project)`
- Extracts visitor functions from `rule.check(ctx)`.
- Walks the serialized AST in semantic order: Root → Info → PathItem → Operation → Parameter → Response → Component → Schema.
- For each node type, if a visitor is registered, call it with the typed ref.

`walkPaths(ast, doc, visitors)`
- Iterates `ast.paths`. For each path, calls `visitors.PathItem` if registered.
- For each HTTP method on the path item, calls `visitors.Operation` if registered.
- Inside each operation, walks parameters and responses if those visitors are registered.

`walkComponents(ast, doc, visitors)`
- Iterates `ast.components.schemas`, `ast.components.parameters`, etc.
- Calls the appropriate visitor for each component type.

**File: `lsp/bun/runner/src/refs.ts`** — Typed ref builders

Each builder wraps a raw AST node with typed accessor methods:

`buildInfoRef(doc, node, pointer)` → `{ uri, pointer, node, title(), version(), description(), contact(), license(), hasContact(), hasLicense() }`

`buildOperationRef(doc, node, pointer, method, path)` → `{ uri, pointer, node, method, path, operationId(), summary(), description(), tags(), deprecated(), eachParameter(fn), eachResponse(fn) }`

`buildPathItemRef(doc, node, pointer, path)` → `{ uri, pointer, node, path, eachOperation(fn), parameters() }`

`buildSchemaRef(doc, node, pointer)` → `{ uri, pointer, node, type(), properties(), required(), allOf(), oneOf(), anyOf(), items(), enum(), format(), nullable() }`

`buildParameterRef(doc, node, pointer)` → `{ uri, pointer, node, name(), in(), required(), schema(), description() }`

`buildResponseRef(doc, node, pointer, statusCode)` → `{ uri, pointer, node, statusCode, description(), content(), headers() }`

**File: `lsp/bun/runner/src/context.ts`** — Context object

`buildContext(req: RunRulesRequest)` returns:
- `_diagnostics: []` — internal collection array.
- `_fixes: []` — internal collection array.
- `project.docs` — map of document URIs to serialized docs.
- `project.index` — the cross-file index.
- `locate(uri, pointer)` — O(1) lookup in `doc.pointers[pointer]`.
- `reportAt(ref, field, opts)` — ergonomic shorthand. Resolves `ref.pointer + "/" + field` to a range via `locate`. Pushes to `_diagnostics`.
- `report(opts)` — full manual report with explicit URI and range.
- `fix(opts)` — pushes to `_fixes`.
- `offsetToRange(start, end)` — converts byte offsets to a range using `doc.rawText`.

**Build process:**
- `lsp/bun/runner/` has its own `package.json` and `tsconfig.json`.
- `bun build src/runner.ts --target=bun --outfile=dist/runner.js --bundle` as part of the release process.
- The output `dist/runner.js` is committed (or generated in CI) and embedded via `//go:embed`.

### 4.4 — telescope-server NPM Package

**Directory: `packages/telescope-server/`**

**Exports:**
```typescript
export { defineRule } from "./define-rule"
export { defineGenericRule } from "./define-generic-rule"
export { defineSchema } from "./define-schema"
export { getValueAtPointer, joinPointer, splitPointer, getParentPointer } from "./pointers"
export type {
    RuleContext, RuleDefinition, GenericRuleDefinition, SchemaDefinition,
    InfoRef, RootRef, OperationRef, PathItemRef, SchemaRef,
    ParameterRef, ResponseRef, RequestBodyRef, ComponentRef,
    TagRef, ExampleRef, HeaderRef, MediaTypeRef, LinkRef,
    CallbackRef, ReferenceRef, SecurityRequirementRef,
    ReportOptions, FixOptions, Range, Severity,
    Visitors, OpenAPIDocument, SerializedDoc,
} from "./types"
```

**`defineRule(def)`** — validates `meta.id`, `meta.number`, `check` function. Returns the definition unchanged. Throws on invalid shape (fail-fast at load time, not at run time).

**`defineGenericRule(def)`** — same validation, but for rules that operate on the raw AST rather than typed visitors.

**`defineSchema(def)`** — for rules that are expressed as JSON Schema assertions against specific node types.

**Pointer utilities:**
- `getValueAtPointer(obj, pointer)` — traverse an object by JSON pointer.
- `joinPointer(...segments)` — join segments with proper escaping.
- `splitPointer(pointer)` — split into unescaped segments.
- `getParentPointer(pointer)` — return the parent pointer.

**Versioning:** Independent semver from the Go binary. Publish to npm as `telescope-server`. Maintain a compatibility matrix in the README: which npm package versions work with which Go binary versions.

### 4.5 — Rule Loading and Hot Reload

**Config schema extension:**
```yaml
rules:
  - path: ./rules/require-examples.ts
    runner: bun
    severity: warning
  - path: ./rules/naming-convention.js
    runner: goja
  - path: ./rules/internal/*.ts
    runner: auto
    options:
      prefix: "x-acme-"
```

**Auto-detection logic:**
- If `runner: auto` and path ends with `.ts` → `bun` (always available, embedded runtime).
- If `runner: auto` and path ends with `.js` → `bun` (default). Use `goja` only if explicitly configured.
- If `runner: goja` → in-process Goja execution. Useful for simple, high-frequency rules where avoiding IPC overhead matters.
- If `runner: bun` → Bun sidecar (the default for everything).

**Hot reload via fsnotify:**

**File: `lsp/bun/watch.go`**

`WatchRules(ctx context.Context, telescopeDir string)`
- Watch `.telescope/rules/` and `.telescope/schemas/` directories.
- On `Write` or `Create` event:
  1. Determine which rule config(s) match the changed file.
  2. Send `MsgLoadRules` with the updated rule path to Bun (reimport with fresh module cache).
  3. Invalidate the analysis cache for all documents matching that rule's `patterns`.
  4. Trigger re-analysis on those documents.
- User sees updated diagnostics within ~1 second of saving their rule file.

### 4.6 — Pipeline Integration

**File: `core/analyze/stage_analyze.go` (update)**

Add custom rule execution as the final step of the `Analyze` stage:

```go
func (s *AnalyzeStage) Run(ctx context.Context, node *GraphNode, graph *WorkspaceGraph) (*StageResult, error) {
    result := &StageResult{StageName: StageAnalyze}

    // Built-in Go rules (always run, in-process, native speed)
    result.Diagnostics = append(result.Diagnostics, s.builtinRules.Run(node, graph)...)

    // Bun sidecar work — lazy spawn on first use, batched per document
    needsBun := s.hasCustomRulesFor(node.URI) || s.hasZodOverlaysFor(node.URI) || s.hasSpectralRulesetsFor(node.URI)

    if needsBun {
        if err := s.bunManager.EnsureStarted(ctx); err != nil {
            s.logger.Warn("failed to start bun runner, skipping bun-side analysis", "err", err)
        } else {
            serialized := s.serializer.SerializeDoc(node, graph)

            bunCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
            defer cancel()

            // Custom rules
            if s.hasCustomRulesFor(node.URI) {
                ruleIDs := s.matchingRuleIDs(node.URI)
                bunResult, err := s.bunManager.RunRules(bunCtx, &RunRulesRequest{
                    DocumentURI: node.URI,
                    RuleIDs:     ruleIDs,
                    Document:    serialized,
                    Project:     s.serializer.SerializeIndex(graph),
                })
                if err != nil {
                    s.logger.Warn("bun custom rules error", "err", err, "uri", node.URI)
                } else {
                    result.Diagnostics = append(result.Diagnostics, deserializeDiagnostics(bunResult)...)
                    s.reportSlowRules(bunResult.RuleTimings)
                }
            }

            // Zod overlay validation
            if s.hasZodOverlaysFor(node.URI) {
                zodResult, err := s.bunManager.RunZod(bunCtx, &RunZodRequest{
                    DocumentURI: node.URI,
                    Document:    serialized,
                    Schemas:     s.matchingZodSchemas(node.URI),
                })
                if err != nil {
                    s.logger.Warn("bun zod validation error", "err", err, "uri", node.URI)
                } else {
                    result.Diagnostics = append(result.Diagnostics, deserializeDiagnostics(zodResult)...)
                }
            }

            // Spectral rulesets
            if s.hasSpectralRulesetsFor(node.URI) {
                spectralResult, err := s.bunManager.RunSpectral(bunCtx, &RunSpectralRequest{
                    DocumentURI:  node.URI,
                    Document:     serialized,
                    RulesetPaths: s.matchingSpectralRulesets(node.URI),
                })
                if err != nil {
                    s.logger.Warn("bun spectral ruleset error", "err", err, "uri", node.URI)
                } else {
                    deduped := s.deduplicateAgainstBuiltins(result.Diagnostics, spectralResult)
                    result.Diagnostics = append(result.Diagnostics, deduped...)
                }
            }
        }
    }

    return result, nil
}
```

---

## Phase 5 — Graph-Powered LSP Features

All 24 feature handlers upgraded to use the graph engine and snapshot model. The LSP layer reads from `SnapshotManager.Current()` for sync requests.

**File: `lsp/adapt/diagnostics.go`** — thin adapter from core types to protocol types:

```go
func DiagnosticToProtocol(d types.Diagnostic) protocol.Diagnostic { ... }
func RangeToProtocol(r types.Range) protocol.Range { ... }
func PositionToProtocol(p types.Position) protocol.Position { ... }
```

### 5.1 — Go to Definition

**File: `lsp/handlers/definition.go`**

- `$ref` resolution via `EdgeIndex`. Parse the `$ref` value at cursor, look up the edge, follow to target URI + pointer, resolve pointer to source range via `PointerIndex`.
- JSON Pointer refs (`#/components/schemas/Foo`): local edge, resolve pointer.
- File-relative refs (`./models/foo.yaml#/Foo`): cross-file edge, resolve target URI + pointer.
- `$anchor` refs: look up anchor in the target document's anchor index (built during `Parse`).
- `operationId` refs: look up in `SerializedProjectIndex.OperationIDs`.
- `tag` refs: look up in `SerializedProjectIndex.Tags`.
- `securitySchemes` refs: resolve to `#/components/securitySchemes/<name>`.
- External HTTP `$ref`: cache to disk keyed by URL+ETag. Resolve against cached content. If not cached, fetch async, return "loading..." and re-resolve on next request.

### 5.2 — Find All References

**File: `lsp/handlers/references.go`**

- Use `ReverseEdgeIndex[targetURI]` filtered to edges whose target pointer matches the cursor position's pointer.
- O(dependents), not O(all documents).
- Results grouped by file, sorted by position.
- Works for: `$ref` targets, operationIds, tag names, security scheme names, component names.

### 5.3 — Hover

**File: `lsp/handlers/hover.go`**

- Resolve the node at cursor position.
- If the node is a `$ref`, follow it and render the resolved schema (post-`allOf` merge, post-`$ref` follow).
- Use annotations collected during validation (title, description, default, examples, deprecated). These are "free" — harvested from the validator's annotation pass.
- If `deprecated: true`, render a deprecation warning with any `x-deprecated-description` migration note.
- Cycle-safe rendering: track visited pointers, max depth limit (default 10), emit "..." for truncated cyclic refs.
- If cursor is inside a description value, render the markdown as HTML.
- If cursor is inside a virtual document, delegate to the embedded language provider.

### 5.4 — Completions

**File: `lsp/handlers/completion.go`**

- `$ref` path completions: use the component index from the graph. Filter by expected type at cursor position (if cursor is in a schema context, only suggest schema refs; if in a parameter context, only suggest parameter refs).
- HTTP method completions on path items: filter out methods already present on the current path item.
- Status code completions with RFC descriptions (200 "OK", 201 "Created", 400 "Bad Request", etc.).
- Security scheme name completions from root document's `securitySchemes`.
- `operationId` completions for link objects.
- Inside description values: delegate to the markdown completion provider.
- Keyword completions: `openapi`, `info`, `paths`, `components`, etc. at the appropriate nesting level.
- Format completions for `format` fields: `date`, `date-time`, `email`, `uri`, `uuid`, etc.

### 5.5 — Rename

**File: `lsp/handlers/rename.go`**

- Rename operationId: find all references via reverse index, update all occurrences.
- Rename component: find all `$ref` strings pointing to `#/components/<type>/<oldName>`, update to `<newName>`.
- Rename file: find all cross-file `$ref` paths referencing the old file path, update to new path. Show confirmation dialog for large graphs (>50 affected locations).
- Preview rename (`prepareRename`): return the range and placeholder text. Show all affected locations before applying.

### 5.6 — Diagnostics Through $ref

**File: `lsp/handlers/diagnostics.go`**

- When a validation error occurs inside a `$ref`-resolved node, emit a `RelatedInformation` entry at the `$ref` usage site pointing to the definition.
- "Unresolved `$ref`" diagnostics include the full resolved search path attempted (e.g., "Tried: ./models/foo.yaml, ./schemas/foo.yaml").
- Cycle diagnostics show the full cycle path as related information entries.

### 5.7 — Additional Handlers

Deliver implementations for all remaining handlers using the same graph + snapshot pattern:

- **Document Symbols** (`textDocument/documentSymbol`): walk the `SemanticNode`, emit symbols for paths, operations, components, schemas.
- **Workspace Symbols** (`workspace/symbol`): query the cross-file index for operationIds, component names, tags.
- **Code Actions** (`textDocument/codeAction`): extract inline schema to `$ref` component, inline a `$ref`, add missing required field, fix typo from enricher suggestions.
- **Semantic Tokens** (`textDocument/semanticTokens`): token types for `$ref` values, HTTP methods, status codes, JSON pointers.
- **Folding Ranges** (`textDocument/foldingRange`): fold path items, operations, components, schemas. Use tree-sitter folding queries where possible.
- **Document Links** (`textDocument/documentLink`): make `$ref` values clickable links.
- **Code Lens** (`textDocument/codeLens`): reference count on components, "Preview bundled spec" on root documents (Phase 6.3).
- **Inlay Hints** (`textDocument/inlayHint`): resolved `$ref` target name next to `$ref` values, resolved schema type inline.
- **Selection Range** (`textDocument/selectionRange`): use tree-sitter node hierarchy.
- **Formatting** (`textDocument/formatting`): delegate to a YAML/JSON formatter, respect workspace settings.

---

## Phase 6 — Project-Level Intelligence

### 6.1 — Dead Component Detection

**File: `core/analyze/unused.go`**

- Walk `ReverseEdgeIndex`. Any component (URI matches `#/components/...`) with zero inbound edges from outside `components/` is unreferenced.
- Report as `SeverityInfo` diagnostic on the component definition's key.
- Produce a `Fix` with description "Delete unused component" that removes the entire mapping entry.
- Suppressible via `x-telescope-ignore: unused` extension on the component.

### 6.2 — Breaking Change Detection

**File: `core/analyze/breaking.go`**

**CLI command: `telescope ci --diff-base <ref>`**
1. Checkout the base ref to a temp directory (or use `git show` to read individual files).
2. Build a full graph snapshot from the base files.
3. Build a full graph snapshot from the current files.
4. Compare the two snapshots:
   - Removed paths → breaking.
   - Removed operations (HTTP methods) → breaking.
   - Removed or newly-required parameters → breaking.
   - Type narrowing (e.g., `string | number` → `string`) → breaking.
   - Removed enum values → breaking.
   - Authentication added to previously open operation → breaking.
   - New required request body fields → breaking.
5. Output formats: SARIF, JSON, GitHub Actions annotations (`::error file=...`), plain text.

**LSP mode:**
- Compare each file against its last git-committed version (via `git show HEAD:<path>`).
- Show breaking changes as `SeverityWarning` diagnostics with code `"breaking-change"`.
- Only runs when the file is under git (check for `.git` directory).

### 6.3 — Multi-Root Bundle Preview

**File: `core/analyze/bundle.go`**

**Code lens on root documents:** "Preview bundled spec"
- Produces a single fully-dereferenced JSON/YAML document.
- Cycles broken by inserting an inline `$ref` pointing to the first occurrence.
- Opens as a virtual read-only document in the editor (synthetic URI `telescope-bundle://<rootURI>`).

**CLI: `telescope bundle <root.yaml> --output <bundled.yaml> [--format yaml|json]`**
- Uses `sdk.Workspace` to load and analyze the root document.
- Traverses the graph, inlines all `$ref` targets, writes the output.

---

## Phase 7 — Polish and Ecosystem

### 7.1 — Performance Benchmarks as CI Gates

**Directory: `server/bench/`**

Benchmark cases:
- `BenchmarkFullIndexBuild` — Stripe API spec (~7000 lines, ~300 components). Target: <200ms.
- `BenchmarkIncrementalUpdate` — single field change in the Stripe spec. Target: <5ms for full pipeline re-run on affected nodes.
- `BenchmarkCompletionLatency` — `$ref` completion in a file with 500+ components. Target: <50ms.
- `BenchmarkBunRoundTrip` — 20 custom rules against a 5000-line spec. Target: <100ms total.
- `BenchmarkZodValidation` — 5 Zod overlay schemas against a 5000-line spec. Target: <50ms total.
- `BenchmarkSpectralRuleset` — `spectral:oas` default ruleset against a 5000-line spec. Target: <200ms total.
- `BenchmarkSerialization` — serialize a 5000-line spec to msgpack. Target: <5ms.
- `BenchmarkClassification` — classify 100 files. Target: <10ms.

CI gate: `benchstat` comparison against baseline. Fail if any benchmark regresses >20%.

### 7.2 — Debug and Observability

**Structured logging:**
- `slog` throughout all packages.
- Every LSP request gets a trace ID (UUID) logged with every related operation.
- Every graph operation logs touched node URIs at `slog.LevelDebug`.

**Custom notifications:**
- `$/telescope/graphInfo` — returns live graph stats: node count, edge count, root count, dirty node count, last analysis duration per stage, memory usage.
- `$/telescope/rulePerf` — returns per-rule timing data. Rules >100ms logged as warnings.

**VS Code extension:**
- "Telescope: Show Graph Info" command opens a panel displaying live graph stats (polls `$/telescope/graphInfo` every 5 seconds).
- "Telescope: Show Rule Performance" command displays a table of rule execution times.

### 7.3 — Test Infrastructure

**Golden fixture tests:**
- `testdata/fixtures/` — real workspace states captured as directory trees.
- Each fixture has an `expected/` directory with `diagnostics.json`, `completions.json`, `hover.json`.
- Test runner loads the fixture into an `sdk.Workspace`, runs analysis, asserts output matches expected (with `go-cmp` for diffing).

**Protocol conformance tests:**
- Partial results support.
- Work done progress tokens.
- Request cancellation (`$/cancelRequest`).
- Large workspace handling (1000+ files).

**Bun runner integration tests:**
- Load real custom rule files from `testdata/rules/`. Run against test specs. Assert diagnostic output matches expected.
- Load real Zod overlay schemas from `testdata/zod/`. Run against test specs. Assert Zod-native error messages appear in diagnostics.
- Load real Spectral rulesets from `testdata/spectral/`. Run against test specs. Assert Spectral diagnostics are correctly mapped and deduplicated against built-in rules.

**Test data:**
- `testdata/large-workspace/`: Stripe API + Kubernetes API + a synthetic multi-root workspace with 50 fragment files.
- `testdata/broken/`: files with syntax errors, unresolved refs, cycles.

**CI:**
- `go test -race ./...` on every PR.
- Benchmark suite on every PR (via `benchstat`).
- Bun integration tests (requires Bun in CI — add to CI matrix).

### 7.4 — Documentation

**`ARCHITECTURE.md`** — updated to reflect V2 pipeline with Mermaid diagrams showing the stage pipeline, graph structure, consumer adapters, and Bun sidecar.

**`docs/SDK.md`** — guide for the Go SDK: creating a workspace, injecting synthetic documents, watching for changes, mapping results to source positions. Includes the generator tool integration pattern.

**`docs/CUSTOM-RULES.md`** — full guide: writing rules in TypeScript or JavaScript with the Bun sidecar, Zod overlay schemas with native validation, Spectral ruleset integration, migration from legacy Go plugin rules. Includes examples for every visitor type.

**`docs/RULES.md`** — all 88 built-in rules documented with: rule ID, severity, description, example violation, example fix.

**`docs/CONFIGURATION.md`** — full config schema reference: roots, include, exclude, Zod overlays, Spectral rulesets, custom rule config, severity overrides.

**`packages/telescope-server/README.md`** — full SDK reference with examples for every ref type, every utility function, and a "getting started" walkthrough.

**`sdk/doc.go`** — package-level godoc with usage examples.

---

## Migration Compatibility

| Current Feature          | V2 Status                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| 88 built-in rules        | Preserved, migrated to new pipeline stages                                                |
| Go plugin binaries       | **Removed.** Migrate to Bun custom rules or contribute as built-in rules.                 |
| Spectral YAML rulesets   | Preserved. Executed via real `@stoplight/spectral-core` in Bun sidecar — 100% compatible. |
| `.telescope.yaml` config | Extended with new fields, backwards compatible                                            |
| VS Code extension        | Updated to delegate classification to server                                              |
| CLI `lint`/`ci`/`serve`  | Preserved, `ci` gains `--diff-base`, all use `sdk.Workspace`                              |

---

## Phase Sequencing

```
Phase 0   ████████░░░░░░░░░░░░░░░░░░░░  Foundations
Phase 1   ░░░░████░░░░░░░░░░░░░░░░░░░░  Classification
Phase 2   ░░░░░░████░░░░░░░░░░░░░░░░░░  Virtual documents
Phase 3   ░░░░░░░░████░░░░░░░░░░░░░░░░  Core validation pipeline
Phase 4   ░░░░░░░░░░██████░░░░░░░░░░░░  Bun sidecar (rules, Zod, Spectral)
Phase 5   ░░░░░░░░░░░░░░████░░░░░░░░░░  LSP features
Phase 6   ░░░░░░░░░░░░░░░░████░░░░░░░░  Project intelligence
Phase 7   ░░░░░░░░░░░░░░░░░░░░████████  Polish + ecosystem
```

Phases 0–3 are internal/architectural. Users see improved correctness and performance but no new features. Phases 4–7 deliver user-visible capabilities. The foundation is solid before the feature work lands on top of it.