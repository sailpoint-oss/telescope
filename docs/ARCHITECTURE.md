# Telescope V2 Architecture Guide

Telescope is a fast, extensible OpenAPI linter and language server built in Go. This document describes the V2 architecture, which introduces a unified workspace graph, pipeline-based processing, and protocol-independent core types.

## Overview

Telescope provides:

- **Linting** — Structural validation, naming conventions, documentation checks, security rules, and OWASP recommendations
- **Language Server** — Hover, completion, definition, references, rename, code actions, semantic tokens
- **CLI** — `lint`, `ci`, and `serve` subcommands for integration into CI/CD pipelines
- **SDK** — Programmatic access for tools like [Cartographer](https://github.com/sailpoint-oss/openapi-generation) to lint extracted specs

The V2 architecture centers on a **workspace graph** that models documents as nodes with directed edges for `$ref` relationships. A **pipeline** runs stages (Raw → Parse → Lint → Bind → Validate → Analyze) with per-node caching and invalidation cascades.

## High-Level Architecture

```mermaid
flowchart TB
    subgraph Input
        Doc[Document]
    end

    subgraph Parse
        TS[Tree-sitter Parse]
        SI[Semantic Index]
    end

    subgraph Graph["Workspace Graph"]
        WG[WorkspaceGraph]
        Nodes[GraphNodes]
        Edges[Edges]
    end

    subgraph Pipeline["Pipeline Stages"]
        Raw[Raw]
        ParseStage[Parse]
        LintStage[Lint]
        BindStage[Bind]
        ValidateStage[Validate]
        AnalyzeStage[Analyze]
    end

    subgraph Output
        Diags[Diagnostics]
        Snap[Snapshots]
    end

    Doc --> TS
    TS --> SI
    SI --> WG
    WG --> Nodes
    WG --> Edges
    Nodes --> Raw
    Raw --> ParseStage
    ParseStage --> LintStage
    LintStage --> BindStage
    BindStage --> ValidateStage
    ValidateStage --> AnalyzeStage
    AnalyzeStage --> Diags
    WG --> Snap
    Snap --> LSP[LSP Handlers]
```

**Data flow**: Document → Tree-sitter Parse → OpenAPI Index → Pipeline Stages → Diagnostics. The WorkspaceGraph maintains nodes, edges, and snapshots consumed by LSP handlers.

## Package Layout

| Package | Purpose |
|---------|---------|
| `core/types` | Protocol-independent types: `Diagnostic`, `Range`, `Position`, `Severity`, `DiagnosticTag` |
| `core/graph` | Workspace graph engine: `WorkspaceGraph`, `GraphNode`, `Edge`, `StageName`, `StageResult` |
| `core/graph` (source) | Document sources: `DocumentSource`, `FilesystemSource`, `SyntheticSource`, `LSPSource` |
| `core/graph` (pipeline) | Pipeline runner: `Stage`, `PipelineRunner`, `RawStage`, `ParseStage`, etc. |
| `core/graph` (snapshot) | Immutable snapshots: `Snapshot`, `SnapshotManager`, `SnapshotNode` |
| `core/parser` | Semantic model: `SemanticNode`, `NodeKind`, YAML tree walking |
| `core/parser` (virtual) | Virtual documents: `VirtualDocument`, `VirtualDocumentManager`, `OffsetMapper` |
| `core/parser` (embedded) | Embedded content: `EmbeddedLanguageProvider`, `MarkdownProvider` |
| `core/classify` | File classification: `FileClassifier`, `FileClassification`, heuristic signals |
| `core/validate` | JSON Schema validation: `SchemaValidator`, `ValidationError` |
| `core/analyze` | Cross-document analysis: `FindUnusedComponents`, `DetectBreakingChanges`, `BundlePreview` |
| `sdk` | Public Go API: `Workspace`, `Option`, `AnalysisResult`, plugin SDK |
| `lsp` | LSP server wiring, handlers, graph bridge |
| `lsp/adapt` | Type conversion: `core/types` ↔ `gossip/protocol` |
| `lsp/bun` | Bun sidecar for TypeScript/JavaScript custom rules and Spectral rulesets |
| `lsp/observe` | Observability: `GraphInfo`, `RulePerf`, `$/telescope/*` notifications |
| `rules` | Rule registry, `RuleBuilder`, `Reporter`, `Walker` |
| `rules/analyzers` | Built-in analyzers (structural, naming, documentation, security, OWASP) |
| `rules/checks` | Syntactic checks (duplicate keys, ASCII, missing tokens) |
| `rules/testing` | Test harness: `rulestest.Run()` with exact diagnostic assertions |
| `spectral` | Spectral-compatible YAML rulesets (JSONPath + built-in functions) |
| `project` | Multi-file workspace: file discovery, dependency graph |
| `plugin` | Go plugin host via `hashicorp/go-plugin` |
| `openapi` | Tree-sitter → typed OpenAPI model (`Document`, `Operation`, `Schema`, etc.) |
| `config` | `.telescope.yaml` loading, ruleset merging |
| `extensions` | `x-*` vendor extension schema validation |
| `markdown` | Markdown parsing/validation in description fields |
| `validation` | Additional JSON Schema validation for non-OpenAPI files |

## Data Flow

### Document Lifecycle

1. **Open** — Document enters via `DocumentSource` (filesystem, LSP overlay, or synthetic). Added to `WorkspaceGraph` via `AddSource`.
2. **Classify** — `FileClassifier` uses heuristics (root key, fingerprint, extension, config override, graph membership) to determine if the file is OpenAPI and whether it is a root or fragment.
3. **Parse** — `RawStage` reads content from the source; `ParseStage` runs tree-sitter and builds a semantic index.
4. **Lint** — Structural validation, duplicate keys, ASCII checks. No `$ref` resolution yet.
5. **Bind** — `$ref` resolution; edges materialized in the graph (`EdgeRef`, `EdgePathRef`, `EdgeExternal`).
6. **Validate** — JSON Schema validation against version-specific schemas (OpenAPI 3.0, 3.1, 3.2).
7. **Analyze** — Cross-document: unused components, breaking changes, bundle preview.
8. **Diagnostics** — Stored per-node; aggregated in `Snapshot` for LSP/CLI output.

### Invalidation

When a document changes, `Invalidate(uri)` marks all stages dirty for that URI and cascades to dependents (documents that reference it). Pipeline stages re-run only for dirty nodes; cached results are reused when `StageResult.Version` matches `GraphNode.Version`.

## Core Abstractions

### Protocol-Independent Types (`core/types`)

- **`Diagnostic`** — Range, severity, code, message, tags, related info, optional fix
- **`Range`** — Start/end `Position` (0-based line, character)
- **`Severity`** — Error, Warning, Info, Hint
- **`DiagnosticTag`** — Unnecessary, Deprecated

These types are used throughout the core engine. The `lsp/adapt` package converts to/from `gossip/protocol` types at the LSP boundary.

### Workspace Graph (`core/graph`)

- **`WorkspaceGraph`** — Thread-safe directed graph: nodes (documents), edges (`$ref` relationships), roots
- **`GraphNode`** — Per-document state: source, version, raw bytes, stage results, dirty flags, diagnostics
- **`Edge`** — Source/target URI + JSON pointers, `EdgeKind` (Ref, Component, External)
- **`ReadOnlyGraph`** — Interface for SDK consumers to query the graph without mutating

### Document Sources

| Source | Use Case |
|--------|----------|
| `FilesystemSource` | CLI, file watcher |
| `LSPSource` | LSP document overlays (gossip `document.Store`) |
| `SyntheticSource` | SDK, Cartographer — programmatic injection |

### Pipeline Stages

| Stage | Depends On | Purpose |
|-------|------------|---------|
| `StageRaw` | — | Read content from `DocumentSource` |
| `StageParse` | Raw | Tree-sitter parse, semantic index |
| `StageLint` | Parse | Structural validation, syntactic checks |
| `StageBind` | Lint | `$ref` resolution, edge materialization |
| `StageValidate` | Bind | JSON Schema validation |
| `StageAnalyze` | Validate | Unused components, breaking changes, bundle |

### Virtual Document System

Embedded content (e.g., Markdown in `description` fields) is extracted as **virtual documents** with synthetic URIs (`vdoc://parent#/paths/~1users/get/description`). `VirtualDocumentManager` maintains them; `OffsetMapper` translates positions between virtual and source. Used for hover/completion in embedded Markdown.

### File Classification

`FileClassifier` uses weighted signals:

- Config override (glob → isOpenAPI) — weight 1.0
- Graph membership (referenced by known OpenAPI) — weight 1.0
- Root key (`openapi:` / `swagger:`) — weight 0.95
- Root key fingerprint (info, paths, components, etc.) — weight 0.6
- File extension (.yaml, .yml, .json) — weight 0.1

Confidence is computed as weighted sum; `IsOpenAPI` requires root key or (content signal + confidence ≥ 0.30).

### SDK (`sdk`)

`Workspace` wraps the graph, pipeline, and snapshot manager:

- `New(opts...)` — Create workspace with options
- `AddSource(src)` — Add document source
- `Analyze(ctx)` — Run full pipeline, return `AnalysisResult`
- `AnalyzeURI(ctx, uri)` — Run pipeline for single document
- `Graph()` — Read-only graph access
- `Snapshot()` — Current immutable snapshot

## LSP Integration

### Graph Bridge

`GraphBridge` connects the core graph engine to LSP handlers:

- `OnDocumentOpen` — Add synthetic source, classify, set root
- `OnDocumentChange` — Update synthetic source content, invalidate
- `OnDocumentClose` — Remove from graph, clear virtual docs
- `SyncEdgesFromIndex` — Sync edges from OpenAPI index (bridges old `IndexCache`)
- `LookupDefinition`, `FindReferences` — Use edge index for `$ref` resolution
- `BuildSnapshot` — Build immutable snapshot for sync handlers

Sync handlers read from `CurrentSnapshot()`; async analysis builds the next snapshot.

### Adapt Layer

`lsp/adapt` converts between `core/types` and `gossip/protocol`:

- `DiagnosticToProtocol` / `DiagnosticFromProtocol`
- `RangeToProtocol` / `RangeFromProtocol`
- `PositionToProtocol` / `PositionFromProtocol`
- `SeverityToProtocol` / `SeverityFromProtocol`

## Observability

Custom LSP notifications:

| Notification | Payload | Purpose |
|--------------|---------|---------|
| `$/telescope/graphInfo` | `GraphInfo` | Node count, edge count, roots, dirty count, stage durations, memory, snapshot version |
| `$/telescope/rulePerf` | `RulePerf` | Per-rule timing and diagnostic counts |

`CollectGraphInfo` and `RulePerfTracker` build these payloads for debugging and performance tuning.

## Extension Points

| Extension | Description |
|-----------|-------------|
| **Go plugins** | Compiled binaries in `.telescope/plugins/`, RPC via `hashicorp/go-plugin`. Use `sdk.Rule()` and `sdk.NewPlugin()` to define rules. |
| **Spectral rulesets** | YAML files with JSONPath + built-in functions. No JS execution. Configure via `.telescope.yaml` `spectralRulesets` field. |
| **Bun sidecar** | TypeScript/JavaScript rules run in a Bun subprocess with health checks and crash recovery. IPC protocol in `lsp/bun/protocol.go`. |
| **Additional JSON Schema** | Non-OpenAPI schema validation handled by the Go validator via `additionalValidation.schemas`. |
