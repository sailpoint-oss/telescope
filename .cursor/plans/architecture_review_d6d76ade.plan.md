---
name: Architecture Review
overview: A comprehensive 10-part architecture review of the Telescope OpenAPI linting extension, analyzing each major component with specific strengths, weaknesses, and actionable improvement suggestions.
todos: []
---

# Telescope Extension Architecture Review

This review breaks down the extension into 10 architectural components with specific feedback on each.

---

## Part 1: Intermediate Representation (IR) System

**Files:** [`packages/aperture-server/src/engine/ir/`](packages/aperture-server/src/engine/ir/)

**Purpose:** Provides a unified, format-agnostic representation of YAML/JSON documents with precise byte-offset location tracking.

**Strengths:**

- Clean abstraction over YAML/JSON differences with single `IRNode` type
- Excellent location tracking with separate key/value offsets (`keyStart`, `keyEnd`, `valStart`, `valEnd`)
- JSON Pointer (`ptr`) on every node enables stable identity and efficient lookups
- YAML alias tracking (`aliasTargetPtr`) for anchor resolution

**Weaknesses:**

- **Incomplete anchor resolution:** `findAnchorPointer()` in [`builder-yaml.ts:201-208`](packages/aperture-server/src/engine/ir/builder-yaml.ts) has a TODO and returns `undefined`
- **No incremental IR updates:** Entire IR is rebuilt on every change (see `OpenAPIVirtualCode.update()` which sets `_ir = undefined`)
- **Missing format normalization:** IR doesn't normalize differences like YAML's multiple string formats (block scalar, quoted, etc.)

**Recommendations:**

1. Implement anchor pointer resolution by traversing the document during build
2. Consider structural sharing for incremental IR updates (reuse unchanged subtrees)
3. Add a `sourceFormat` field to track original YAML string type for round-tripping

---

## Part 2: Reference Graph and Dependency Tracking

**Files:** [`packages/aperture-server/src/engine/indexes/graph.ts`](packages/aperture-server/src/engine/indexes/graph.ts), [`ref-graph.ts`](packages/aperture-server/src/engine/indexes/ref-graph.ts)

**Purpose:** Tracks `$ref` relationships between documents for cross-file validation and navigation.

**Strengths:**

- Bidirectional tracking (deps and rdeps) enables both forward and reverse traversal
- Pointer-level granularity via `reverseEdges` Map enables precise "find references"
- Cycle detection with caching (`cycleCache`) prevents infinite loops
- Clean `RefGraph` interface allows for alternative implementations

**Weaknesses:**

- **Edge removal is O(n):** `removeEdgesForUri()` iterates entire `_edges` Set - could be expensive with many refs
- **No lazy resolution:** All refs are scanned eagerly on `updateFromIR()` even if never queried
- **External URL handling is incomplete:** HTTP refs are added to graph but never resolved

**Recommendations:**

1. Index edges by source URI (`Map<uri, Set<RefEdge>>`) for O(1) removal
2. Add lazy ref scanning - only scan IR when graph queries are made
3. Add special handling for external URLs (mark as "external" type, don't attempt resolution)

---

## Part 3: Project Indexing and Atom Extraction

**Files:** [`packages/aperture-server/src/engine/indexes/project-index.ts`](packages/aperture-server/src/engine/indexes/project-index.ts), [`atoms.ts`](packages/aperture-server/src/engine/indexes/atoms.ts)

**Purpose:** Extracts all OpenAPI elements (operations, schemas, parameters, etc.) into queryable indexes.

**Strengths:**

- Comprehensive coverage of all OpenAPI element types (15+ entity types)
- Handles both root documents and fragment files elegantly
- `ScopeProvider` enables contextual validation (knowing which path/operation contains a node)
- Clean separation between `AtomIndex` (per-document) and `ProjectIndex` (cross-document)

**Weaknesses:**

- **Large monolithic function:** `buildIndex()` is 100+ lines - hard to test individual collectors
- **Duplicate iteration:** Many elements are visited multiple times (e.g., schemas in components and inline)
- **No incremental updates:** Index is rebuilt from scratch on every change
- **Missing webhooks support:** OpenAPI 3.1 webhooks aren't indexed

**Recommendations:**

1. Extract each collector into a separate function with its own tests
2. Build a unified visitor that collects all element types in a single pass
3. Implement incremental index updates - track which documents changed and rebuild only affected portions
4. Add webhooks indexing for OpenAPI 3.1 compatibility

---

## Part 4: Rule API and Type System

**Files:** [`packages/aperture-server/src/engine/rules/api.ts`](packages/aperture-server/src/engine/rules/api.ts), [`types.ts`](packages/aperture-server/src/engine/rules/types.ts)

**Purpose:** Defines the rule authoring API and type system for validation rules.

**Strengths:**

- Excellent DX with typed accessors on refs (`op.summary()`, `schema.isComposition()`)
- Declarative `fields` API for simple validation without writing code
- `reportAt()` and `reportHere()` simplify common reporting patterns
- Strong typing with 15 visitor types covering all OpenAPI elements
- State factory pattern enables stateful rules with proper lifecycle

**Weaknesses:**

- **Limited composability:** No way to compose multiple rules or share validation logic
- **No async support:** `check()` is synchronous - can't validate against external schemas
- **Missing `exit` visitors:** Only enter visitors - no way to validate after children are processed
- **Rule options schema not used:** `RuleMeta.schema` is defined but not validated

**Recommendations:**

1. Add rule composition utilities (`combineRules()`, `withCommonValidation()`)
2. Support async visitors for rules that need external data
3. Add exit visitors (`OperationExit`, `SchemaExit`) for post-traversal validation
4. Validate rule options against the declared schema at load time

---

## Part 5: Rule Execution Engine

**Files:** [`packages/aperture-server/src/engine/execution/runner.ts`](packages/aperture-server/src/engine/execution/runner.ts)

**Purpose:** Orchestrates rule execution by dispatching visitors for each OpenAPI element.

**Strengths:**

- Efficient visitor dispatch with enriched refs (typed accessors attached to payloads)
- `walkSchemaChildren()` generator for recursive schema traversal
- Cancellation token support for responsive UI
- `generateFieldVisitors()` auto-generates visitors from declarative `fields`
- Project-level visitor for aggregate checks (`Project` visitor)

**Weaknesses:**

- **No visitor ordering guarantees:** Visitors run in rule array order but not element order
- **Missing batch optimizations:** Each rule gets its own visitors - no shared traversal
- **Context creation per-file:** `createRuleContext()` builds line offsets each time (cached internally but could share)
- **Long function:** `runEngine()` is 200+ lines - mixing setup, traversal, and collection

**Recommendations:**

1. Document element visiting order or make it deterministic (parent before children, etc.)
2. Consider single traversal with batched visitor dispatch for better performance
3. Pre-compute line offsets in VirtualCode and pass to contexts
4. Split `runEngine()` into setup, traversal, and result collection phases

---

## Part 6: Context Resolution and Document Loading

**Files:** [`packages/aperture-server/src/engine/context/`](packages/aperture-server/src/engine/context/)

**Purpose:** Resolves which documents to lint together based on `$ref` relationships.

**Strengths:**

- Three-mode design (`project-aware`, `fragment`, `multi-root`) handles all scenarios
- `DocumentTypeCache` prevents redundant parsing during discovery
- `ProjectContextCache` enables reuse across lint runs
- Clean root discovery via reverse `$ref` traversal

**Weaknesses:**

- **Expensive discovery:** `discoverWorkspaceRoots()` scans entire workspace on partial documents
- **Cache invalidation complexity:** Multiple caches (DocumentTypeCache, ProjectContextCache) that need coordinated invalidation
- **Multi-root contexts are heavyweight:** Builds separate ProjectContext for each root, even with shared documents
- **Blocking operations:** File loading is `await` in sequence, not parallel

**Recommendations:**

1. Cache workspace root discovery results between lint runs
2. Unify caches into a single coordinated cache manager
3. Share documents between multi-root contexts (reference semantics)
4. Use `Promise.all()` for parallel document loading

---

## Part 7: Configuration System

**Files:** [`packages/aperture-server/src/engine/config/resolver.ts`](packages/aperture-server/src/engine/config/resolver.ts)

**Purpose:** Loads and validates `.telescope/config.yaml` with rule materialization.

**Strengths:**

- TypeBox schema validation with good error messages
- Dynamic TypeScript rule loading via esbuild
- Severity overrides per-rule via `rulesOverrides`
- Extension schema support for custom `x-*` properties

**Weaknesses:**

- **No config inheritance:** Can't extend from a base config
- **Single config location:** Only checks `.telescope/config.yaml`, no fallback to package.json or similar
- **Silent failure on rule load:** `loadOpenAPIRule()` returns `null` without logging errors
- **No config validation errors surfaced:** Parse errors are logged but not reported to user

**Recommendations:**

1. Support config extends: `extends: ["./base-config.yaml", "some-preset"]`
2. Add multiple config locations with precedence (`.telescope/config.yaml` > `package.json#telescope`)
3. Return structured errors from `loadOpenAPIRule()` instead of `null`
4. Surface config validation errors as diagnostics on the config file

---

## Part 8: Virtual Codes and LSP Language Plugins

**Files:** [`packages/aperture-server/src/lsp/languages/virtualCodes/`](packages/aperture-server/src/lsp/languages/virtualCodes/)

**Purpose:** Volar virtual code system for embedded language support (YAML, JSON, Markdown).

**Strengths:**

- Layered virtual codes: `DataVirtualCode` (parsing) < `OpenAPIVirtualCode` (IR + atoms)
- Markdown extraction from `description` fields with JSON string unescaping
- Lazy IR and atoms building - only computed when accessed
- Incremental update support via `update()` method

**Weaknesses:**

- **Markdown code recreation complexity:** `_markdownCodesDirty` flag indicates updates sometimes fail
- **Tight coupling to Volar:** Hard to test VirtualCodes without Volar infrastructure
- **Format code duplication:** Both OpenAPI and format VirtualCode hold the same document
- **No caching of parsed object:** Re-parses on every `parsedObject` access if AST dirty

**Recommendations:**

1. Simplify markdown code management - consider full regeneration on changes
2. Extract pure parsing logic into testable units separate from VirtualCode
3. Share snapshot between OpenAPI and format codes instead of duplicating
4. Cache parsed object and invalidate explicitly

---

## Part 9: OpenAPI Service and LSP Features

**Files:** [`packages/aperture-server/src/lsp/services/openapi-service.ts`](packages/aperture-server/src/lsp/services/openapi-service.ts)

**Purpose:** Main LSP service providing diagnostics, navigation, and code intelligence.

**Strengths:**

- Comprehensive feature coverage: 15+ LSP capabilities (diagnostics, hover, completion, rename, etc.)
- Result ID caching for workspace diagnostics efficiency
- Forward ref loading - fetches missing referenced documents from disk
- Semantic tokens enhance syntax highlighting beyond grammar

**Weaknesses:**

- **Massive file:** 1600+ lines with all features in one file
- **No feature toggling:** All features enabled always - can't disable expensive ones
- **Duplicate pointer parsing:** `parseJsonPointer()` defined locally instead of reusing utils
- **Synchronous provideDiagnostics:** Could be async for better responsiveness

**Recommendations:**

1. Split into separate files: `openapi-diagnostics.ts`, `openapi-navigation.ts`, etc.
2. Add settings to enable/disable expensive features (semantic tokens, code lens)
3. Move pointer utilities to shared location
4. Return diagnostics progressively instead of all-at-once

---

## Part 10: Client Extension Architecture

**Files:** [`packages/aperture-client/src/extension.ts`](packages/aperture-client/src/extension.ts)

**Purpose:** VS Code extension that manages language server sessions and document classification.

**Strengths:**

- Per-workspace-folder server isolation via `SessionManager`
- Smart document classification - OpenAPI detection before sending to server
- Format conversion commands (YAML/JSON) with collision handling
- Volar Labs integration for debugging

**Weaknesses:**

- **Blocking activation:** `await sessionManager.initialize()` blocks extension activation
- **Manual document classification:** Client re-parses documents server already parses
- **No graceful degradation:** Server failure = all features unavailable
- **Status bar UX:** Shows scan count but not server health

**Recommendations:**

1. Initialize sessions lazily/async - don't block extension activation
2. Move classification to server side, use languageId from server
3. Add fallback mode with limited features when server fails
4. Show server status (starting/ready/error) in status bar

---

## Cross-Cutting Observations

**Memory Management:**

- Multiple caches (DocumentTypeCache, ProjectContextCache, WorkspaceIndex) without coordinated eviction
- Consider LRU eviction or memory pressure monitoring

**Error Handling:**

- Many functions silently return null/empty on errors
- Consider structured error types with categorization (parse error, validation error, IO error)

**Testing:**

- Good test coverage for rules and IR builders
- Missing integration tests for LSP service features
- Consider snapshot testing for diagnostic output

**Performance:**

- No profiling instrumentation to identify bottlenecks
- Consider adding telemetry for timing critical paths

---

## Summary

The architecture is well-designed with clear separation between:

- **Engine** (parsing, indexing, rules) - format/protocol agnostic
- **LSP** (Volar integration, language services) - VS Code specific
- **Client** (extension, session management) - VS Code UI

Key improvement areas:

1. **Incrementality:** Most systems rebuild from scratch - incremental updates would improve responsiveness
2. **Code organization:** Several large files (openapi-service.ts, project-index.ts) should be split
3. **Error propagation:** Many silent failures - errors should bubble up to users
4. **Configuration flexibility:** Limited config options for power users