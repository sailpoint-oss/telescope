# Telescope V2 — Comprehensive Test Plan

## Testing Philosophy

Every layer of the system is tested at three levels: **unit** (single function/struct, mocked dependencies, sub-millisecond), **integration** (multiple components wired together, real data, real I/O), and **end-to-end** (full system as a user experiences it). Tests are the specification. If a behavior isn't tested, it doesn't exist.

All Go tests run with `-race` in CI. No exceptions. All benchmarks run with `benchstat` comparison against a committed baseline. Flaky tests are treated as bugs, not annoyances.

## Test Infrastructure

### Fixture System

**Directory: `testdata/`**

```
testdata/
├── specs/
│   ├── petstore/                 # small, single-file, valid OAS 3.1
│   │   ├── petstore.yaml
│   │   └── expected/
│   │       ├── diagnostics.json
│   │       ├── completions/
│   │       │   ├── ref-in-schema.json
│   │       │   └── method-on-path.json
│   │       ├── hover/
│   │       │   ├── ref-target.json
│   │       │   └── description-markdown.json
│   │       ├── definition/
│   │       │   └── schema-ref.json
│   │       └── classification.json
│   │
│   ├── multi-file/               # 3 files, cross-file $refs
│   │   ├── root.yaml
│   │   ├── schemas/
│   │   │   ├── user.yaml
│   │   │   └── error.yaml
│   │   └── expected/
│   │
│   ├── circular/                 # valid OAS 3.1 with circular $refs
│   │   ├── api.yaml
│   │   └── expected/
│   │
│   ├── multi-root/               # 2 root specs sharing fragments
│   │   ├── public-api.yaml
│   │   ├── internal-api.yaml
│   │   ├── shared/
│   │   │   ├── pagination.yaml
│   │   │   └── errors.yaml
│   │   └── expected/
│   │
│   ├── swagger-2/                # Swagger 2.0 spec
│   │   ├── api.json
│   │   └── expected/
│   │
│   ├── openapi-30/               # OAS 3.0 spec
│   │   ├── api.yaml
│   │   └── expected/
│   │
│   ├── large/
│   │   ├── stripe/               # real Stripe API spec (~7000 lines)
│   │   │   └── openapi.yaml
│   │   ├── kubernetes/           # real Kubernetes API spec
│   │   │   └── swagger.json
│   │   └── synthetic-50-files/   # generated multi-root workspace
│   │       ├── generate.go       # go:generate script to rebuild
│   │       ├── root-1.yaml
│   │       ├── root-2.yaml
│   │       └── fragments/
│   │           ├── schema-001.yaml
│   │           └── ... (50 files)
│   │
│   ├── broken/
│   │   ├── syntax-error.yaml         # YAML parse error mid-document
│   │   ├── unresolved-ref.yaml       # $ref to nonexistent file
│   │   ├── circular-unresolvable.yaml # cycle that prevents resolution
│   │   ├── duplicate-keys.yaml       # duplicate mapping keys
│   │   ├── invalid-schema-type.yaml  # type: "strnig" (typo)
│   │   ├── missing-info.yaml         # missing required info block
│   │   ├── mixed-valid-invalid.yaml  # partially valid, errors in middle
│   │   └── expected/
│   │
│   ├── embedded/
│   │   ├── markdown-descriptions.yaml  # descriptions with markdown
│   │   ├── code-samples.yaml           # x-codeSamples extension
│   │   ├── block-scalar.yaml           # literal | and folded > styles
│   │   └── expected/
│   │
│   └── classification/
│       ├── definite-openapi.yaml       # openapi: "3.1.0" present
│       ├── probable-openapi.yaml       # paths + components, no openapi field
│       ├── fragment-only.yaml          # just a schema object
│       ├── not-openapi.yaml            # regular YAML config file
│       ├── kubernetes-resource.yaml    # looks like OAS but isn't
│       ├── ambiguous.yaml              # borderline score
│       └── expected/
│
├── rules/
│   ├── valid/
│   │   ├── require-operation-id.ts
│   │   ├── require-description.ts
│   │   ├── naming-convention.ts
│   │   ├── require-error-responses.js
│   │   └── generic-no-todo.ts          # generic rule, not OAS-specific
│   ├── invalid/
│   │   ├── missing-meta-id.ts          # fails defineRule validation
│   │   ├── throws-on-load.ts           # import error
│   │   ├── throws-on-run.ts            # runtime error in check()
│   │   ├── infinite-loop.ts            # exceeds timeout
│   │   └── syntax-error.ts             # TS syntax error
│   └── expected/
│       ├── require-operation-id.json   # expected diagnostics when run against petstore
│       └── ...
│
├── zod/
│   ├── org-standards.ts                # valid Zod overlay
│   ├── response-shape.ts               # targets response objects only
│   ├── with-refinements.ts             # uses .refine(), .superRefine()
│   ├── with-custom-errors.ts           # custom error maps
│   ├── invalid-export.ts               # doesn't export a Zod schema
│   └── expected/
│
├── spectral/
│   ├── default-oas.spectral.yaml       # extends spectral:oas
│   ├── custom-functions.spectral.yaml  # references JS custom functions
│   ├── custom-functions/
│   │   └── check-prefix.js
│   ├── naming.spectral.yaml            # naming convention rules
│   └── expected/
│
├── snapshots/                          # golden snapshot files for LSP protocol tests
│   ├── hover/
│   ├── completion/
│   ├── definition/
│   ├── references/
│   ├── rename/
│   ├── code-action/
│   ├── semantic-tokens/
│   └── diagnostics/
│
└── edits/                              # scripted edit sequences for incremental tests
    ├── add-path.yaml                   # add a new path to existing spec
    ├── break-ref.yaml                  # change a $ref to point to nothing
    ├── fix-typo.yaml                   # fix "strnig" → "string"
    ├── add-component.yaml              # add a new schema component
    └── rename-component.yaml           # rename a component (multi-file)
```

### Test Helpers

**File: `internal/testutil/testutil.go`**

```go
// LoadFixture reads a fixture workspace into a sdk.Workspace
// with SyntheticSources. Returns the workspace and a cleanup func.
func LoadFixture(t *testing.T, fixturePath string) *sdk.Workspace

// LoadExpected reads and unmarshals an expected/*.json file.
func LoadExpected[T any](t *testing.T, path string) T

// AssertDiagnosticsMatch compares actual diagnostics against expected,
// using go-cmp with options that ignore diagnostic ordering and
// normalize ranges to (line, character) tuples.
func AssertDiagnosticsMatch(t *testing.T, expected, actual []types.Diagnostic)

// AssertNoDiagnostics fails if any diagnostics are present.
func AssertNoDiagnostics(t *testing.T, result *sdk.AnalysisResult)

// WithTimeout returns a context with a test-appropriate timeout
// (10s for unit, 60s for integration, 120s for e2e).
func WithTimeout(t *testing.T, kind TestKind) context.Context

// MustParse parses a YAML/JSON string into a SemanticNode, fails test on error.
func MustParse(t *testing.T, content string) *parser.SemanticNode

// EditSpec applies a scripted edit to a spec string and returns the new content.
// Edits are described as (jsonPointer, newValue) pairs.
func EditSpec(t *testing.T, content string, edits ...Edit) string
```

**File: `internal/testutil/lsp.go`**

```go
// LSPClient is a test harness that speaks the LSP protocol
// over stdio to a running Telescope server process.
type LSPClient struct {
    cmd     *exec.Cmd
    stdin   io.WriteCloser
    stdout  *bufio.Reader
    reqID   atomic.Int64
    pending map[int64]chan json.RawMessage
}

// NewLSPClient spawns a Telescope LSP server process and
// performs the initialize/initialized handshake.
func NewLSPClient(t *testing.T, workspaceRoot string) *LSPClient

// OpenFile sends textDocument/didOpen for a file.
func (c *LSPClient) OpenFile(t *testing.T, uri, content string)

// EditFile sends textDocument/didChange with full content replacement.
func (c *LSPClient) EditFile(t *testing.T, uri, content string, version int)

// WaitDiagnostics blocks until a textDocument/publishDiagnostics
// notification arrives for the given URI, or times out.
func (c *LSPClient) WaitDiagnostics(t *testing.T, uri string, timeout time.Duration) []protocol.Diagnostic

// Hover sends textDocument/hover and returns the result.
func (c *LSPClient) Hover(t *testing.T, uri string, line, char int) *protocol.Hover

// Completion sends textDocument/completion and returns the result.
func (c *LSPClient) Completion(t *testing.T, uri string, line, char int) *protocol.CompletionList

// Definition sends textDocument/definition and returns the result.
func (c *LSPClient) Definition(t *testing.T, uri string, line, char int) []protocol.Location

// References sends textDocument/references and returns the result.
func (c *LSPClient) References(t *testing.T, uri string, line, char int) []protocol.Location

// Rename sends textDocument/rename and returns the workspace edit.
func (c *LSPClient) Rename(t *testing.T, uri string, line, char int, newName string) *protocol.WorkspaceEdit

// CodeAction sends textDocument/codeAction for a range and returns actions.
func (c *LSPClient) CodeAction(t *testing.T, uri string, startLine, startChar, endLine, endChar int) []protocol.CodeAction

// Custom sends a custom request/notification and returns the raw response.
func (c *LSPClient) Custom(t *testing.T, method string, params any) json.RawMessage

// Shutdown sends shutdown + exit and waits for the process to exit.
func (c *LSPClient) Shutdown(t *testing.T)
```

**File: `internal/testutil/bun.go`**

```go
// BunRunner starts the compiled Bun runner binary directly
// (extracted from the embed) with a test socket, and returns
// a connected Manager. For integration tests that need the real
// Bun sidecar without going through the full LSP.
func BunRunner(t *testing.T, workDir string) *bun.Manager
```

---

## Layer 1: Core Types (`core/types/`)

### Unit Tests

**File: `core/types/range_test.go`**

- `TestContainsPosition`: position inside range returns true. Position on start boundary returns true. Position on end boundary returns false (exclusive). Position before range returns false. Position after range returns false.
- `TestContainsPosition_SingleCharRange`: range where start == end-1. Position at start returns true.
- `TestContainsPosition_EmptyRange`: start == end. All positions return false.
- `TestIsEmpty`: empty range returns true. Non-empty returns false.
- `TestRangeEquality`: two ranges with same start/end are equal via `==`.

**File: `core/types/diagnostic_test.go`**

- `TestSeverityOrdering`: `SeverityError < SeverityWarning < SeverityInfo < SeverityHint`.
- `TestDiagnosticString`: verify `Diagnostic.String()` produces a human-readable format suitable for CLI output.

---

## Layer 2: Parser (`core/parser/`)

### Unit Tests

**File: `core/parser/parser_test.go`**

- `TestParseValidYAML`: parse a simple YAML mapping. Assert root node is `NodeMapping`. Assert children count and key names.
- `TestParseValidJSON`: parse a simple JSON object. Assert same structure as YAML equivalent.
- `TestParseYAMLSequence`: parse a YAML sequence. Assert root contains `NodeSequence` with correct item count.
- `TestParseYAMLScalars`: parse each scalar type (string, integer, float, boolean, null). Assert `Value` field has correct Go type (`string`, `int64`, `float64`, `bool`, `nil`).
- `TestParseYAMLBlockLiteral`: parse a `|` block scalar. Assert `Value` is the full string with preserved newlines. Assert `Range` covers the entire block including indicator line.
- `TestParseYAMLBlockFolded`: parse a `>` block scalar. Assert `Value` has newlines folded to spaces (except paragraph breaks).
- `TestParseYAMLChompIndicators`: test `|+`, `|-`, `|` (keep, strip, clip). Assert trailing newline behavior matches YAML spec.
- `TestParseYAMLAnchorAlias`: parse a document with `&anchor` and `*anchor`. Assert the alias is fully resolved in the `SemanticNode` — no alias nodes survive the transform. Assert the resolved node is a deep copy (mutating one doesn't affect the other).
- `TestParseYAMLMergeKey`: parse a document with `<<:` merge key. Assert merged keys appear in the mapping's `Children`.
- `TestParseSyntaxError_MidDocument`: parse YAML with a syntax error on line 5 of a 10-line document. Assert lines 1-4 produce valid `SemanticNode` entries. Assert a diagnostic is emitted for line 5. Assert the parser does not panic or return nil.
- `TestParseSyntaxError_UnclosedQuote`: parse `key: "unclosed`. Assert partial parse succeeds. Assert error diagnostic.
- `TestParseSyntaxError_BadIndentation`: parse YAML with inconsistent indentation. Assert error recovery produces partial nodes.
- `TestParseEmptyDocument`: parse empty string. Assert root is `NodeNull` or empty mapping, not an error.
- `TestParseLargeDocument`: parse the Stripe API spec. Assert no errors for the valid portions. Assert total node count is reasonable (>1000).

**File: `core/parser/parser_incremental_test.go`**

- `TestIncrementalReparse_SingleCharInsert`: parse a document, insert one character at line 5. Incremental reparse. Assert only the affected subtree is re-parsed (verify via tree-sitter's `changed_ranges`). Assert the resulting `SemanticNode` matches a full reparse.
- `TestIncrementalReparse_DeleteLine`: delete an entire line. Assert incremental result matches full reparse.
- `TestIncrementalReparse_InsertNewKey`: insert a new key-value pair into a mapping. Assert incremental result matches full reparse.
- `TestIncrementalReparse_MultiEdit`: apply 3 edits in one batch. Assert incremental result matches full reparse.
- `TestIncrementalReparse_BreakSyntax`: start with valid YAML, introduce a syntax error via edit. Assert partial parse with error diagnostic.
- `TestIncrementalReparse_FixSyntax`: start with broken YAML, fix the error via edit. Assert full valid parse.

**File: `core/parser/semantic_test.go`**

- `TestBuildFromCST_FullOpenAPISpec`: parse the petstore fixture. Assert `SemanticNode` tree structure: root is mapping, has `openapi`, `info`, `paths` children. Assert `paths` children are path strings. Assert operations under paths have correct method names.
- `TestBuildFromCST_NestedSchemas`: parse a spec with deeply nested schemas (allOf containing objects containing arrays containing $refs). Assert tree depth matches. Assert no stack overflow on 50+ levels of nesting.
- `TestBuildFromCST_NullValues`: YAML `~`, `null`, empty value. All produce `NodeNull` with `Value == nil`.
- `TestBuildFromCST_NumericKeys`: YAML allows numeric keys (status codes like `200`). Assert they're preserved as strings in `Children` map keys.

**File: `core/parser/pointers_test.go`**

- `TestBuildPointerIndex_Simple`: build index for `{openapi: "3.1.0", info: {title: "Test"}}`. Assert `""` maps to root range, `"/openapi"` maps to the `openapi` value range, `"/info"` maps to the `info` mapping range, `"/info/title"` maps to the `title` value range.
- `TestBuildPointerIndex_Sequences`: build index for `{tags: [{name: "users"}, {name: "pets"}]}`. Assert `"/tags/0/name"` and `"/tags/1/name"` map to correct ranges.
- `TestBuildPointerIndex_EscapedCharacters`: path `/paths/~1users~1{id}/get`. Assert the pointer is correctly escaped: `/paths/~1users~1%7Bid%7D/get` → correct range.
- `TestBuildPointerIndex_LargeSpec`: build index for Stripe spec. Assert index size is >5000 entries. Assert a sample of 20 known pointers all resolve to valid ranges.
- `TestBuildPointerIndex_Roundtrip`: for every entry in the index, assert `source[range.Start:range.End]` produces parseable content (the value at that pointer is actually at that location in the source).

**File: `core/parser/virtual_test.go`**

- `TestExtractVirtualDocuments_Descriptions`: parse a spec with 3 description fields (info, operation, schema). Assert 3 virtual documents extracted. Assert each has correct `Language = "markdown"`, correct `ParentURI`, correct `JSONPointer`, correct `Content` matching the description value.
- `TestExtractVirtualDocuments_BlockScalar`: description using `|` block scalar. Assert `Content` is the unindented block text. Assert `ScalarStyle = "literal"`.
- `TestExtractVirtualDocuments_FoldedScalar`: description using `>` folded scalar. Assert `Content` has folded lines.
- `TestExtractVirtualDocuments_Examples`: `example` field with JSON content. Assert `Language = "json"`.
- `TestExtractVirtualDocuments_CodeSamples`: `x-codeSamples` with `lang: python`. Assert `Language = "python"`.
- `TestExtractVirtualDocuments_NoDescriptions`: spec with no description fields. Assert empty slice returned.

**File: `core/parser/offset_mapper_test.go`**

- `TestLiteralBlockMapper_ToReal`: 5-line literal block starting at line 10 with 4-space indent. Assert `ToReal(Position{Line: 0, Character: 0})` returns `Position{Line: 11, Character: 4}` (first content line, after indent). Assert `ToReal(Position{Line: 2, Character: 5})` returns `Position{Line: 13, Character: 9}`.
- `TestLiteralBlockMapper_ToVirtual`: reverse of above. Assert round-trip: `ToVirtual(ToReal(pos)) == pos` for 10 sample positions.
- `TestFoldedBlockMapper_ToReal`: folded block where 3 source lines become 1 virtual line. Assert positions in the folded output map back to the correct source line.
- `TestQuotedStringMapper_ToReal`: double-quoted string with escape sequences. Assert positions account for `\"`, `\\`, `\n` expansions.
- `TestQuotedStringMapper_EscapeSequences`: string containing `\"`, `\\`, `\n`, `\t`, `\u0041`. Assert each escape maps to the correct real-file offset.
- `TestMapper_EmptyContent`: all mappers handle empty content without panic.
- `TestMapper_SingleLine`: all mappers handle single-line content correctly.

### Integration Tests

**File: `core/parser/parser_integration_test.go`**

- `TestParseAllFixtures`: iterate all files in `testdata/specs/`. Parse each. Assert no panics. Assert valid specs produce no parse errors. Assert broken specs produce parse errors at expected locations.
- `TestParseAndBuildPointerIndex_Consistency`: for each fixture, parse and build pointer index. For every entry in the index, verify the range points to real content in the source file (byte-level verification).

### Benchmarks

**File: `core/parser/parser_bench_test.go`**

- `BenchmarkParseFull_Petstore`: full parse of petstore. Target: <5ms.
- `BenchmarkParseFull_Stripe`: full parse of Stripe spec. Target: <50ms.
- `BenchmarkParseFull_Kubernetes`: full parse of Kubernetes spec. Target: <100ms.
- `BenchmarkIncrementalParse_SingleChar`: parse Stripe spec, then incremental reparse after 1-char edit. Target: <5ms.
- `BenchmarkIncrementalParse_InsertPath`: parse Stripe spec, then incremental reparse after inserting a new path (20 lines). Target: <10ms.
- `BenchmarkBuildPointerIndex_Stripe`: build pointer index for Stripe spec. Target: <20ms.
- `BenchmarkBuildSemanticNode_Stripe`: CST → SemanticNode transform for Stripe spec. Target: <30ms.
- `BenchmarkExtractVirtualDocuments_Stripe`: extract all virtual documents from Stripe spec. Target: <10ms.

---

## Layer 3: File Classification (`core/classify/`)

### Unit Tests

**File: `core/classify/classifier_test.go`**

- `TestClassify_ExplicitOpenAPIField`: content with `openapi: "3.1.0"` at root. Assert `IsOpenAPI = true`, `Confidence >= 0.95`, `OpenAPIVersion = "3.1"`, `IsFragment = false`.
- `TestClassify_ExplicitSwaggerField`: content with `swagger: "2.0"` at root. Assert `IsOpenAPI = true`, `OpenAPIVersion = "2.0"`.
- `TestClassify_RootKeyFingerprint_Strong`: content with `paths:`, `components:`, `info:` but no `openapi:` field. Assert `IsOpenAPI = true`, `Confidence >= 0.60`.
- `TestClassify_RootKeyFingerprint_Weak`: content with only `info:` and `tags:`. Assert `Confidence < 0.60` (below threshold). `IsOpenAPI = false`.
- `TestClassify_FragmentByGraphMembership`: content that looks like a plain schema object (no root keys). But the graph has an edge pointing to this URI. Assert `IsOpenAPI = true`, `IsFragment = true`, `Confidence = 1.0`.
- `TestClassify_NotOpenAPI`: regular YAML config file (e.g., Docker Compose). Assert `IsOpenAPI = false`, `Confidence < 0.30`.
- `TestClassify_KubernetesResource`: Kubernetes YAML with `apiVersion`, `kind`, `metadata`. Assert `IsOpenAPI = false` despite superficial similarity.
- `TestClassify_Ambiguous`: content that scores between 0.30 and 0.60. Assert `IsOpenAPI = false` but `Confidence` is in the borderline range.
- `TestClassify_ExplicitConfigOverride_Include`: URI matches `config.include` pattern. Assert `IsOpenAPI = true`, `Confidence = 1.0` regardless of content.
- `TestClassify_ExplicitConfigOverride_Exclude`: URI matches `config.exclude` pattern. Assert `IsOpenAPI = false` regardless of content.
- `TestClassify_ExplicitConfigOverride_Root`: URI listed in `config.roots`. Assert `IsOpenAPI = true`, `IsFragment = false`, `Confidence = 1.0`.
- `TestClassify_WorkspaceProximity`: file in a directory alongside a known root spec. Assert `Confidence` gets a proximity boost.
- `TestClassify_FileExtension_OAS`: file named `api.openapi.yaml`. Assert extension contributes +0.15 to confidence.
- `TestClassify_FileExtension_Plain`: file named `config.yaml`. Assert extension contributes nothing.
- `TestClassify_EmptyFile`: empty content. Assert `IsOpenAPI = false`.
- `TestClassify_JSONContent`: JSON file with `{"openapi": "3.1.0"}`. Assert correctly classified as OAS 3.1.
- `TestClassify_AllFixtures`: run classifier against every file in `testdata/classification/`. Assert results match `expected/classification.json`.

### Integration Tests

**File: `core/classify/classifier_integration_test.go`**

- `TestClassifyWithRealGraph`: load the multi-file fixture into a graph. Classify the root file (should be root). Classify fragment files (should be fragments via graph membership). Classify a file not in the graph (should be classified by content heuristics only).

---

## Layer 4: Workspace Graph (`core/graph/`)

### Unit Tests

**File: `core/graph/graph_test.go`**

- `TestAddSource`: add a `SyntheticSource`. Assert node exists in `NodeStore`. Assert all stages marked dirty.
- `TestRemoveSource`: add 3 sources with edges A→B→C. Remove B. Assert B removed from `NodeStore`. Assert edges A→B and B→C removed from both `EdgeIndex` and `ReverseEdgeIndex`. Assert C's reverse edge count drops to 0.
- `TestAddEdge`: add an edge A→B. Assert `EdgeIndex[A]` contains the edge. Assert `ReverseEdgeIndex[B]` contains the edge.
- `TestRemoveEdgesFrom`: add edges A→B, A→C, D→B. Call `RemoveEdgesFrom(A)`. Assert `EdgeIndex[A]` is empty. Assert `ReverseEdgeIndex[B]` only contains D→B. Assert `ReverseEdgeIndex[C]` is empty.
- `TestInvalidate_DirectDependent`: A→B. Invalidate A. Assert A's `Bind`, `Validate`, `Analyze` stages are dirty. Assert B's `Bind`, `Validate`, `Analyze` stages are dirty (propagated via reverse edge).
- `TestInvalidate_TransitiveCascade`: A→B→C→D. Invalidate A. Assert all 4 nodes have dirty `Bind`+ stages.
- `TestInvalidate_Diamond`: A→B, A→C, B→D, C→D. Invalidate A. Assert all 4 dirty. Assert D is only visited once (not exponential traversal).
- `TestInvalidate_AlreadyDirty`: A→B. Mark B dirty. Invalidate A. Assert traversal stops at B (doesn't re-traverse B's dependents).
- `TestInvalidate_NoReverseEdges`: isolated node A. Invalidate A. Assert only A is dirty.
- `TestDetectCycles_NoCycle`: A→B→C. Assert `DetectCycles` returns empty.
- `TestDetectCycles_SimpleCycle`: A→B→C→A. Assert `DetectCycles` returns `[["A","B","C","A"]]`.
- `TestDetectCycles_MultipleCycles`: A→B→A, C→D→C. Assert both cycles detected.
- `TestDetectCycles_SelfCycle`: A→A. Assert cycle detected.
- `TestDependents_Transitive`: A→B→C. `Dependents("C")` returns `["B", "A"]` (all transitively dependent nodes).
- `TestRoots`: add 3 nodes, mark 2 as roots. Assert `Roots()` returns sorted list of 2 URIs.
- `TestChangeLog`: perform several add/remove/invalidate operations. Assert `ChangeLog` contains entries for each mutation in order.
- `TestReadOnlyGraph`: get a `ReadOnlyGraph` view. Assert all read methods work. Assert no write methods are accessible (compile-time guarantee via interface).

**File: `core/graph/graph_concurrent_test.go`**

- `TestConcurrentReadDuringWrite`: spawn 10 goroutines reading `Node()` and `Dependents()`. Spawn 1 goroutine performing `AddSource`, `AddEdge`, `Invalidate` in a loop. Run for 2 seconds. Assert no races (test runs with `-race`). Assert no panics.
- `TestConcurrentInvalidation`: 2 goroutines invalidating different parts of the graph simultaneously. Assert final dirty state is correct.
- `TestConcurrentAddRemove`: add and remove sources concurrently. Assert graph is in a consistent state after all goroutines complete (no dangling edges, no phantom nodes).

**File: `core/graph/source_test.go`**

- `TestFilesystemSource_Read`: write a temp file, create source, Read. Assert content matches. Assert version > 0.
- `TestFilesystemSource_ReadAfterModify`: write file, read, modify file, read again. Assert version increased. Assert content is new content.
- `TestFilesystemSource_Watch`: create source, register watch, modify file. Assert callback fires within 1 second.
- `TestFilesystemSource_Watch_Delete`: create source, register watch, delete file. Assert callback fires.
- `TestSyntheticSource_Read`: create with content, read. Assert matches.
- `TestSyntheticSource_Update`: create, update with new content. Assert version incremented. Assert `Read` returns new content.
- `TestSyntheticSource_Watch`: create, register watch, update. Assert callback fires synchronously.
- `TestSyntheticSource_ConcurrentUpdate`: 10 goroutines calling `Update` simultaneously. Assert no race. Assert final version == initial + 10.
- `TestLSPSource_Read`: create with overlay content and version. Assert read returns correct content and version.
- `TestLSPSource_UpdateOverlay`: update overlay content. Assert new read returns new content and higher version.

### Integration Tests

**File: `core/graph/graph_integration_test.go`**

- `TestGraphBuild_MultiFile`: load the multi-file fixture. Add all files as `FilesystemSource`. Run `Bind` stage on all. Assert edges match expected `$ref` relationships. Assert `ReverseEdgeIndex` has correct entries.
- `TestGraphBuild_Circular`: load the circular fixture. Build graph. Assert `DetectCycles` returns the expected cycle. Assert `Invalidate` terminates and doesn't loop.
- `TestGraphBuild_MultiRoot`: load the multi-root fixture. Assert 2 entries in `RootSet`. Assert shared fragments have reverse edges from both roots.

### Benchmarks

**File: `core/graph/graph_bench_test.go`**

- `BenchmarkGraphBuild_Stripe`: build full graph from Stripe spec. Target: <200ms.
- `BenchmarkInvalidation_SingleNode`: invalidate one node in the Stripe graph. Target: <1ms.
- `BenchmarkInvalidation_Root`: invalidate the root node (cascades to all dependents). Measure total time. Target: <5ms.
- `BenchmarkDependents_DeepChain`: 100-node linear chain. `Dependents` on the leaf. Target: <0.1ms.

---

## Layer 5: Pipeline (`core/graph/`)

### Unit Tests

**File: `core/graph/pipeline_test.go`**

- `TestPipelineRunner_AllStagesRun`: create a node, mark all stages dirty, run pipeline. Assert all 6 stages produce results. Assert results cached on the node.
- `TestPipelineRunner_CacheHit`: run pipeline, then run again without changing version. Assert stages are not re-run (verify via call count on mock stages).
- `TestPipelineRunner_PartialInvalidation`: run pipeline, then mark only `Validate` dirty. Run again. Assert `Parse`, `Lint`, `Bind` are not re-run. Assert `Validate` and `Analyze` are re-run.
- `TestPipelineRunner_Cancellation`: start pipeline with a context that cancels after 50ms. Mock `Validate` stage to take 500ms. Assert pipeline returns `ctx.Err()`. Assert partial results from earlier stages are present on the node.
- `TestPipelineRunner_StageError`: mock `Bind` stage returns an error. Assert `Validate` and `Analyze` are not run. Assert `Parse` and `Lint` results are preserved.
- `TestPipelineRunner_DependencyOrdering`: assert stages run in order: Raw → Parse → Lint → Bind → Validate → Analyze. Verify via timestamps or ordered mock calls.

### Integration Tests

**File: `core/graph/pipeline_integration_test.go`**

- `TestPipeline_Petstore`: load petstore fixture, run full pipeline. Assert zero diagnostics (valid spec).
- `TestPipeline_BrokenSpec`: load each broken fixture, run pipeline. Assert diagnostics match expected. Assert stages that can run did run (e.g., `Parse` succeeds on syntax-error files, producing partial AST).
- `TestPipeline_IncrementalAfterEdit`: load petstore, run pipeline, edit to introduce an error, run pipeline again. Assert only affected stages re-run. Assert new diagnostics appear.

---

## Layer 6: Validation (`core/validate/`)

### Unit Tests

**File: `core/validate/validator_test.go`**

- `TestValidate_ValidOAS31`: validate the petstore fixture against OAS 3.1 schema. Assert zero errors.
- `TestValidate_ValidOAS30`: validate the OAS 3.0 fixture. Assert zero errors.
- `TestValidate_ValidSwagger20`: validate the Swagger 2.0 fixture. Assert zero errors.
- `TestValidate_MissingRequiredField`: spec missing `info.title`. Assert error at the `info` object with message containing "title".
- `TestValidate_InvalidType`: `type: "strnig"`. Assert error at the `type` field.
- `TestValidate_InvalidEnum`: `in: "query_string"` (should be `query`). Assert error at the `in` field.
- `TestValidate_ExtraField`: unknown field at root level. Assert appropriate diagnostic (warning or error depending on OAS version — 3.1 allows extensions, 3.0 does not without `x-` prefix).
- `TestValidate_NestedError`: error deep inside `paths./users.get.responses.200.content.application/json.schema.properties.id.type`. Assert the diagnostic range points to the exact `type` field in the source file, not the root.
- `TestValidate_SourceMapping_Accuracy`: for 10 known error locations in `testdata/broken/`, assert the diagnostic range matches the expected line and character (golden values).

**File: `core/validate/enrich_test.go`**

- `TestTypoEnricher_Match`: `type: "strnig"`. Assert enricher matches and suggests "string" (Levenshtein distance 1).
- `TestTypoEnricher_NoMatch`: `type: "xyzzy"`. Assert enricher matches but suggestion is the closest valid type.
- `TestTypoEnricher_ExactMatch`: `type: "string"`. Assert enricher does not match (no error to enrich).
- `TestDiscriminatorEnricher_Match`: discriminator validation error. Assert enricher produces a human-readable message naming the discriminator property and expected mapping.
- `TestRefContextEnricher_Match`: error through a `$ref`. Assert enricher adds `RelatedInfo` pointing to the `$ref` definition site.
- `TestRefContextEnricher_NoRef`: error not through a `$ref`. Assert enricher does not match.
- `TestMissingRequiredEnricher_Match`: "required property 'title' missing" error. Assert diagnostic points to parent object opening. Assert fix inserts `title: TODO`.
- `TestTypeMismatchEnricher_Match`: expected number, got string `"hello"`. Assert message includes the actual value.
- `TestEnrichmentPipeline_FirstMatchWins`: register 2 enrichers that both match. Assert only the first one's output is used.
- `TestEnrichmentPipeline_DefaultFallback`: error that no enricher matches. Assert default diagnostic with raw message and source-mapped range.

### Integration Tests

**File: `core/validate/validator_integration_test.go`**

- `TestValidateAllBrokenFixtures`: for each file in `testdata/broken/`, run validation. Assert diagnostics match `expected/diagnostics.json`.
- `TestValidateAllValidFixtures`: for each valid fixture, run validation. Assert zero error-level diagnostics.
- `TestValidate_Annotations_CollectedForHover`: validate a spec with `title`, `description`, `default`, `examples`, `deprecated` annotations. Assert annotations are collected and accessible from the validation result for hover content.

### Benchmarks

**File: `core/validate/validator_bench_test.go`**

- `BenchmarkValidate_Petstore`: validate petstore. Target: <10ms.
- `BenchmarkValidate_Stripe`: validate Stripe spec. Target: <100ms.
- `BenchmarkEnrichmentPipeline_100Errors`: enrich 100 raw errors. Target: <5ms.

---

## Layer 7: SDK (`sdk/`)

### Unit Tests

**File: `sdk/workspace_test.go`**

- `TestNew_DefaultOptions`: create workspace with defaults. Assert non-nil. Assert builtin rules enabled.
- `TestNew_WithConfig`: create workspace with a config. Assert config is applied.
- `TestAddSource_Single`: add one `SyntheticSource`. Assert `Graph().Node(uri)` is non-nil.
- `TestAddSource_Multiple`: add 3 sources. Assert all present in graph.
- `TestRemoveSource`: add then remove. Assert `Graph().Node(uri)` is nil.
- `TestClose`: create workspace, close. Assert no goroutine leaks (verify via `runtime.NumGoroutine` before and after, with tolerance for GC goroutines).

### Integration Tests

**File: `sdk/sdk_integration_test.go`**

This is the primary proof that the core/sdk boundary is clean.

- `TestSDK_SyntheticSource_ValidSpec`: create workspace, add synthetic source with valid OAS 3.1 spec. Analyze. Assert zero error diagnostics. Assert `RootDocuments` contains the URI. Assert `NodeCount == 1`.
- `TestSDK_SyntheticSource_InvalidSpec`: add synthetic source missing `info`. Analyze. Assert diagnostics contain "missing required field" for `info`.
- `TestSDK_MultipleSourcesWithRefs`: add 2 synthetic sources where source A `$ref`s source B. Analyze. Assert `EdgeCount >= 1`. Assert both URIs present in diagnostics map.
- `TestSDK_UpdateSource_Incremental`: add valid source, analyze (no errors), update to invalid, analyze. Assert new errors appear. Assert `StageDurations` shows only affected stages re-ran.
- `TestSDK_Watch`: add source, start watch. Update source. Assert `onChange` callback fires with new `AnalysisResult`. Cancel watch. Update source again. Assert no callback.
- `TestSDK_Index`: add source, analyze. Call `Index(uri)`. Assert non-nil. Assert index contains paths, operations, schemas from the spec.
- `TestSDK_Graph_ReadOnly`: get `Graph()`. Assert all read methods return correct data. Assert interface has no write methods (compile check via `var _ graph.ReadOnlyGraph = ...`).
- `TestSDK_ConcurrentAnalyze`: spawn 5 goroutines calling `AnalyzeURI` on different URIs simultaneously. Assert no races. Assert all return valid results.
- `TestSDK_LargeWorkspace_Stripe`: load Stripe spec files as filesystem sources. Analyze. Assert completes within 5 seconds. Assert diagnostics are reasonable (no spurious errors on a real-world spec).
- `TestSDK_NoLSPDependency`: `go list -deps ./sdk/...` must not contain any package with `protocol` or `jsonrpc2` in its path. This is a test that enforces the architectural boundary.

---

## Layer 8: Bun Sidecar (`lsp/bun/`)

### Unit Tests (Go side)

**File: `lsp/bun/protocol_test.go`**

- `TestEnvelope_MarshalRoundtrip`: create an `Envelope`, marshal to msgpack, unmarshal. Assert all fields match.
- `TestLoadRulesRequest_MarshalRoundtrip`: same for each message type.
- `TestRunRulesRequest_MarshalRoundtrip`: including `SerializedDoc` with pointer index.
- `TestRunZodRequest_MarshalRoundtrip`: with `ZodSchemaConfig`.
- `TestRunSpectralRequest_MarshalRoundtrip`: with ruleset paths.

**File: `lsp/bun/serialize_test.go`**

- `TestSerializeDoc_Simple`: serialize a simple `SemanticNode`. Assert `AST` field is a valid `map[string]any`. Assert `Pointers` field maps known pointers to valid ranges.
- `TestSerializeDoc_LargeSpec`: serialize the Stripe spec. Assert completion within 5ms. Assert `Pointers` has >5000 entries.
- `TestSerializeDoc_Roundtrip`: serialize, then deserialize on the "Bun side" (simulated in Go). Assert the deserialized AST matches the original `SemanticNode` values.
- `TestSerializeIndex`: serialize a project index with operationIDs, component refs, tags. Assert all cross-file mappings present.

**File: `lsp/bun/manager_test.go`**

- `TestManager_ExtractRunner`: call `extractRunner`. Assert file exists at returned path. Assert file is executable. Assert file size is >1MB (sanity check — a compiled Bun binary is tens of MB).
- `TestManager_ExtractRunner_PlatformSelection`: assert the extracted binary name matches `runtime.GOOS` and `runtime.GOARCH`.
- `TestManager_EnsureStarted_Idempotent`: call `EnsureStarted` 10 times concurrently. Assert the runner is started exactly once (verify via process count or log output).

### Integration Tests (Go ↔ Bun)

These tests require the compiled Bun runner binary. They are tagged `//go:build integration` and run in CI with the runner binary present.

**File: `lsp/bun/bun_integration_test.go`**

- `TestBun_StartAndReady`: start a real `Manager`. Assert it reaches the ready state within 5 seconds. Shutdown cleanly.
- `TestBun_Ping`: start manager, send ping. Assert pong received within 1 second.
- `TestBun_LoadRules_Valid`: start manager, load `testdata/rules/valid/require-operation-id.ts`. Assert no error. Assert ready response received.
- `TestBun_LoadRules_SyntaxError`: load `testdata/rules/invalid/syntax-error.ts`. Assert `MsgRuleError` with phase `"load"` and meaningful error message.
- `TestBun_LoadRules_MissingMetaID`: load `testdata/rules/invalid/missing-meta-id.ts`. Assert `MsgRuleError` with phase `"load"`.
- `TestBun_RunRules_Valid`: load `require-operation-id` rule, then run it against the petstore fixture (serialized). Assert diagnostics match expected (operations without `operationId` flagged).
- `TestBun_RunRules_NoMatchingOperations`: run `require-operation-id` against a spec where all operations have IDs. Assert zero diagnostics.
- `TestBun_RunRules_RuntimeError`: load `throws-on-run.ts`, run it. Assert `Errors` field contains the error. Assert other rules in the same batch are not affected.
- `TestBun_RunRules_Timeout`: load `infinite-loop.ts`, run with 2-second timeout. Assert error returned within ~2 seconds. Assert other rules still functional after timeout.
- `TestBun_RunRules_MultipleRules`: load 3 valid rules, run all in one batch. Assert diagnostics from all 3 are present. Assert `RuleTimings` has entries for all 3.
- `TestBun_RunZod_Valid`: load `testdata/zod/org-standards.ts`, run against a spec missing `info.contact`. Assert diagnostics include Zod's native error message.
- `TestBun_RunZod_WithRefinements`: load `testdata/zod/with-refinements.ts`. Assert refinement-based diagnostics appear (these have no JSON Schema equivalent).
- `TestBun_RunZod_WithCustomErrors`: load `testdata/zod/with-custom-errors.ts`. Assert custom error messages appear verbatim in diagnostics.
- `TestBun_RunZod_InvalidExport`: load `testdata/zod/invalid-export.ts`. Assert error reported, not crash.
- `TestBun_RunZod_TargetPointers`: load `testdata/zod/response-shape.ts` with targets `["/paths/*/*/responses/*"]`. Assert validation only runs on response objects, not the entire spec.
- `TestBun_RunSpectral_DefaultOAS`: load `testdata/spectral/default-oas.spectral.yaml`, run against petstore. Assert Spectral diagnostics appear. Assert severity mapping is correct.
- `TestBun_RunSpectral_CustomFunctions`: load `testdata/spectral/custom-functions.spectral.yaml` (references JS function file). Assert custom function diagnostics appear.
- `TestBun_CrashRecovery`: start manager, kill the Bun process externally (`proc.Kill()`). Assert manager detects the crash. Assert automatic restart attempt. Assert subsequent `RunRules` works after recovery.
- `TestBun_CrashRecovery_DoubleFailure`: start, kill, let it restart, kill again. Assert manager marks itself permanently unavailable. Assert `Available()` returns false. Assert `RunRules` returns empty response (graceful degradation).
- `TestBun_HotReload`: start manager, load a rule, run it (get diagnostics). Modify the rule file on disk. Send `LoadRules` with the updated path. Run again. Assert diagnostics reflect the updated rule logic.
- `TestBun_ConcurrentRunRules`: spawn 10 goroutines each sending `RunRules` simultaneously. Assert all receive valid responses. Assert no deadlock.
- `TestBun_LargeDocument`: serialize and send the Stripe spec. Run 5 rules. Assert response within 5 seconds.

### Benchmarks

**File: `lsp/bun/bun_bench_test.go`**

- `BenchmarkSerializeDoc_Stripe`: serialize Stripe spec to msgpack. Target: <5ms.
- `BenchmarkBunRoundTrip_SingleRule`: one rule, petstore spec. Measure end-to-end Go→Bun→Go. Target: <20ms.
- `BenchmarkBunRoundTrip_20Rules`: 20 rules, Stripe spec. Target: <100ms.
- `BenchmarkBunZod_5Schemas`: 5 Zod overlays, Stripe spec. Target: <50ms.
- `BenchmarkBunSpectral_DefaultOAS`: `spectral:oas` ruleset, Stripe spec. Target: <200ms.

---

## Layer 9: LSP Adapters (`lsp/adapt/`)

### Unit Tests

**File: `lsp/adapt/adapt_test.go`**

- `TestDiagnosticToProtocol`: convert a core `types.Diagnostic` to `protocol.Diagnostic`. Assert all fields mapped correctly: range, severity, message, code, source, related info.
- `TestDiagnosticToProtocol_AllSeverities`: convert each `Severity` value. Assert correct `protocol.DiagnosticSeverity`.
- `TestRangeToProtocol`: convert `types.Range` to `protocol.Range`. Assert `Line` and `Character` are `uint32` (protocol requirement).
- `TestDiagnosticToProtocol_WithFixes`: diagnostic with 2 fixes. Assert `protocol.Diagnostic` has `Data` field set for code action resolution.
- `TestDiagnosticToProtocol_WithRelatedInfo`: diagnostic with related info. Assert `RelatedInformation` field populated with correct URIs and ranges.
- `TestProtocolToDiagnostic_Roundtrip`: convert core→protocol→core. Assert equality (tests that no information is lost in the round trip).

---

## Layer 10: LSP Handlers (`lsp/handlers/`)

### Unit Tests (per handler, against mock snapshot)

Each handler test creates a mock `Snapshot` with pre-built `SemanticNode` trees, `PointerIndex` entries, edges, and classifications. Tests verify the handler's logic without going through the full pipeline or LSP protocol.

**File: `lsp/handlers/definition_test.go`**

- `TestDefinition_LocalRef`: cursor on `$ref: "#/components/schemas/User"`. Assert definition location points to the `User` schema in the same file.
- `TestDefinition_CrossFileRef`: cursor on `$ref: "./schemas/user.yaml#/User"`. Assert definition location points to the correct file and pointer.
- `TestDefinition_AnchorRef`: cursor on `$ref: "#my-anchor"`. Assert definition points to the anchored node.
- `TestDefinition_OperationId`: cursor on an `operationId` value referenced from a link. Assert definition points to the operation.
- `TestDefinition_SecurityScheme`: cursor on a security scheme name in `security:`. Assert definition points to `components/securitySchemes/<name>`.
- `TestDefinition_UnresolvedRef`: cursor on a `$ref` pointing to a nonexistent target. Assert empty result (no crash).
- `TestDefinition_NotOnRef`: cursor on a regular string value. Assert empty result.

**File: `lsp/handlers/references_test.go`**

- `TestReferences_SchemaComponent`: cursor on `components/schemas/User` definition. Assert all `$ref: "#/components/schemas/User"` locations across all files are returned.
- `TestReferences_OperationId`: cursor on an `operationId` value. Assert all references to that operationId are returned.
- `TestReferences_NoReferences`: cursor on a component with zero references. Assert empty result.
- `TestReferences_CrossFile`: cursor on a component referenced from 3 different files. Assert all 3 locations returned with correct URIs.

**File: `lsp/handlers/hover_test.go`**

- `TestHover_RefTarget`: cursor on a `$ref` value. Assert hover content shows the resolved schema with title, description, properties.
- `TestHover_Schema_AllOfMerged`: cursor on a schema that uses `allOf`. Assert hover shows the merged result, not the raw `allOf` array.
- `TestHover_Deprecated`: cursor on a deprecated operation. Assert hover includes deprecation warning.
- `TestHover_CyclicRef`: cursor on a schema involved in a cycle. Assert hover renders to max depth and shows "..." for the cycle. Assert no infinite loop or panic.
- `TestHover_Description_MarkdownRendered`: cursor inside a description value. Assert hover renders the markdown as HTML.
- `TestHover_Annotations`: cursor on a field with `title`, `description`, `default`, `examples`. Assert all annotations present in hover content.
- `TestHover_RegularField`: cursor on `openapi: "3.1.0"`. Assert hover shows appropriate context (field name, type, allowed values).

**File: `lsp/handlers/completion_test.go`**

- `TestCompletion_RefPath_SchemaContext`: cursor inside `$ref: "#/components/schemas/"`. Assert completion items include all schema component names. Assert no parameter or response components are suggested.
- `TestCompletion_RefPath_ParameterContext`: cursor in a parameter `$ref`. Assert only parameter components suggested.
- `TestCompletion_HTTPMethod`: cursor on a new key inside a path item. Assert `get`, `post`, `put`, `delete`, `patch`, `options`, `head`, `trace` are offered. Assert methods already present on the path item are excluded.
- `TestCompletion_StatusCode`: cursor on a new key inside `responses:`. Assert status codes with RFC descriptions are offered.
- `TestCompletion_SecuritySchemeName`: cursor inside `security: [{` Assert security scheme names from the root spec.
- `TestCompletion_Format`: cursor on `format:` value. Assert `date`, `date-time`, `email`, `uri`, `uuid`, etc.
- `TestCompletion_InsideDescription`: cursor inside a description value. Assert markdown-appropriate completions (not OpenAPI keyword completions).
- `TestCompletion_TopLevelKeys`: cursor at root level of an empty spec. Assert `openapi`, `info`, `paths`, `components`, `servers`, `security`, `tags`.
- `TestCompletion_Empty`: cursor in a non-completable context. Assert empty result.

**File: `lsp/handlers/rename_test.go`**

- `TestRename_ComponentName`: rename `components/schemas/User` to `Customer`. Assert `WorkspaceEdit` updates the component key and all `$ref` strings across all files.
- `TestRename_OperationId`: rename `getUser` to `fetchUser`. Assert all operationId references updated.
- `TestRename_CrossFile`: rename a component referenced from 5 files. Assert edits span all 5 files.
- `TestRename_InvalidPosition`: rename request on a non-renameable position. Assert error or null result.
- `TestPrepareRename_ComponentName`: prepare rename on a component. Assert range covers the component name. Assert placeholder is the current name.

**File: `lsp/handlers/codeaction_test.go`**

- `TestCodeAction_FixTypo`: cursor on `type: "strnig"` with a typo diagnostic. Assert code action "Replace with 'string'" is offered. Assert applying the action produces the correct edit.
- `TestCodeAction_InsertMissingField`: cursor on a diagnostic for missing required `title`. Assert code action "Add 'title'" is offered. Assert edit inserts at correct position with appropriate indentation.
- `TestCodeAction_ExtractInlineSchema`: select an inline schema object. Assert code action "Extract to component" is offered. Assert applying it creates a new component and replaces the inline schema with a `$ref`.
- `TestCodeAction_InlineRef`: cursor on a `$ref`. Assert code action "Inline $ref" is offered. Assert applying it replaces the `$ref` with the resolved content.
- `TestCodeAction_DeleteUnusedComponent`: cursor on an unused component with the diagnostic. Assert code action "Delete unused component" removes the entire entry.

**File: `lsp/handlers/diagnostics_test.go`**

- `TestDiagnostics_RefRelatedInfo`: validation error inside a `$ref`-resolved schema. Assert diagnostic has `RelatedInformation` pointing to both the error site and the `$ref` usage site.
- `TestDiagnostics_UnresolvedRef`: `$ref` to nonexistent target. Assert diagnostic message includes the search path attempted.
- `TestDiagnostics_CycleInfo`: cycle detected. Assert diagnostic `RelatedInformation` shows the full cycle path as a chain of locations.

**File: `lsp/handlers/symbols_test.go`**

- `TestDocumentSymbols`: assert petstore produces symbols for: root document, info, each path, each operation, each component.
- `TestWorkspaceSymbols_Query`: query "user". Assert results include `User` schema, `/users` path, any operationIds containing "user".

**File: `lsp/handlers/semantictokens_test.go`**

- `TestSemanticTokens_RefValues`: `$ref` values get the `reference` token type.
- `TestSemanticTokens_HTTPMethods`: `get`, `post`, etc. get the `method` token type.
- `TestSemanticTokens_StatusCodes`: `200`, `404`, etc. get the `number` token type.

**File: `lsp/handlers/folding_test.go`**

- `TestFoldingRanges`: assert fold ranges exist for: each path item, each operation, each component, `info` block, `servers` block.

**File: `lsp/handlers/documentlink_test.go`**

- `TestDocumentLinks`: assert every `$ref` value in the spec produces a document link with the correct target URI.

**File: `lsp/handlers/codelens_test.go`**

- `TestCodeLens_ReferenceCount`: component with 3 references. Assert code lens shows "3 references".
- `TestCodeLens_UnusedComponent`: component with 0 references. Assert code lens shows "0 references" or "unused".

**File: `lsp/handlers/inlayhint_test.go`**

- `TestInlayHint_RefTarget`: `$ref: "#/components/schemas/User"`. Assert inlay hint shows the resolved type name.

**File: `lsp/handlers/formatting_test.go`**

- `TestFormatting_YAML`: format a poorly-indented YAML spec. Assert output is correctly indented.
- `TestFormatting_JSON`: format a compact JSON spec. Assert output is pretty-printed.

---

## Layer 11: LSP Protocol Integration Tests

These tests use the `LSPClient` harness to communicate with a real running Telescope server over stdio. They test the full path: protocol → handler → pipeline → response.

**File: `lsp/lsp_integration_test.go`**

### Lifecycle

- `TestLSP_Initialize`: send `initialize`. Assert capabilities include all expected features (completion, hover, definition, references, rename, code actions, semantic tokens, folding, document links, code lens, inlay hints, formatting).
- `TestLSP_Initialize_ClientCapabilities`: send `initialize` with limited client capabilities. Assert server adapts (e.g., no semantic tokens if client doesn't support them).
- `TestLSP_Initialized_ConfigLoad`: send `initialized`. Assert server reads `.telescope/config.yaml` if present.
- `TestLSP_Shutdown`: send `shutdown` then `exit`. Assert clean process termination. Assert no leaked temp files (Bun runner binary cleaned up).

### Document Sync

- `TestLSP_DidOpen_ValidSpec`: open the petstore spec. Wait for diagnostics. Assert zero errors.
- `TestLSP_DidOpen_InvalidSpec`: open a broken spec. Wait for diagnostics. Assert expected errors at correct locations.
- `TestLSP_DidChange_IntroduceError`: open valid spec, edit to introduce error. Wait for new diagnostics. Assert error appears.
- `TestLSP_DidChange_FixError`: open broken spec, edit to fix the error. Wait for diagnostics. Assert error clears.
- `TestLSP_DidChange_RapidEdits`: send 20 `didChange` events in rapid succession (simulating fast typing). Assert server processes them without crashing, timeout, or inconsistent state. Assert final diagnostics match the final document state.
- `TestLSP_DidClose`: open a file, close it. Assert diagnostics are cleared for that URI.
- `TestLSP_DidOpen_NonOpenAPI`: open a regular YAML file. Assert no diagnostics published (classified as non-OpenAPI).

### Classification

- `TestLSP_Classification_Notification`: open a YAML file with `openapi: "3.1.0"`. Assert `$/telescope/classify` notification received with `isOpenAPI: true`.
- `TestLSP_Classification_Fragment`: open a file referenced via `$ref` from a known root. Assert classified as fragment.
- `TestLSP_Classification_NotOpenAPI`: open a Docker Compose file. Assert classified as non-OpenAPI.

### Features (End-to-End through Protocol)

- `TestLSP_Hover_RefResolution`: open multi-file fixture. Hover on a `$ref`. Assert hover content shows the resolved schema.
- `TestLSP_Hover_CrossFile`: hover on a `$ref` pointing to another file. Assert hover shows the target content.
- `TestLSP_Completion_RefPaths`: open spec, trigger completion inside a `$ref`. Assert component names are offered.
- `TestLSP_Definition_CrossFile`: go-to-definition on a cross-file `$ref`. Assert location in the target file.
- `TestLSP_References_CrossFile`: find references on a component used in 3 files. Assert all 3 locations returned.
- `TestLSP_Rename_CrossFile`: rename a component. Assert workspace edit spans all files that reference it.
- `TestLSP_CodeAction_FixTypo`: open spec with typo, get code action, apply it. Assert the edit fixes the typo.
- `TestLSP_Diagnostics_RefRelatedInfo`: open spec with error through `$ref`. Assert diagnostic has `relatedInformation` array.
- `TestLSP_DocumentSymbols`: request document symbols. Assert symbols for paths, operations, components.
- `TestLSP_SemanticTokens`: request semantic tokens. Assert `$ref` values and HTTP methods are tokenized.
- `TestLSP_FoldingRanges`: request folding ranges. Assert ranges for path items and operations.
- `TestLSP_CodeLens_ReferenceCount`: request code lens. Assert reference counts on components.

### Protocol Conformance

- `TestLSP_Cancellation`: send a long-running request (completion on huge file), then send `$/cancelRequest`. Assert the server responds with error code `-32800` (RequestCancelled).
- `TestLSP_WorkDoneProgress`: send a request that triggers work done progress (full workspace analysis). Assert `$/progress` notifications with begin/report/end tokens.
- `TestLSP_PartialResults`: for requests that support partial results (references, completion), assert the server sends partial results if configured.
- `TestLSP_InvalidRequest`: send a malformed JSON-RPC message. Assert the server responds with a parse error, does not crash.
- `TestLSP_UnknownMethod`: send a request with an unknown method. Assert the server responds with method not found, does not crash.
- `TestLSP_ConcurrentRequests`: send 10 requests simultaneously (mix of hover, completion, references). Assert all receive valid responses. Assert no deadlock.

### Performance

- `TestLSP_Startup_Time`: measure time from process start to first diagnostics. Target: <3 seconds for petstore, <10 seconds for Stripe spec.
- `TestLSP_Hover_Latency`: open Stripe spec, send 100 hover requests at random positions. Assert p99 < 50ms.
- `TestLSP_Completion_Latency`: open Stripe spec, send 100 completion requests. Assert p99 < 100ms.
- `TestLSP_Definition_Latency`: send 100 definition requests. Assert p99 < 20ms.
- `TestLSP_IncrementalDiagnostics_Latency`: edit one field in Stripe spec, measure time to new diagnostics. Target: p99 < 500ms.

### Bun Sidecar through LSP

- `TestLSP_CustomRules`: workspace with `.telescope/config.yaml` declaring custom rules and `testdata/rules/valid/require-operation-id.ts`. Open a spec. Assert custom rule diagnostics appear alongside built-in diagnostics.
- `TestLSP_CustomRules_HotReload`: open spec, get diagnostics with custom rule. Modify the rule file on disk. Assert updated diagnostics appear within 3 seconds.
- `TestLSP_ZodOverlay`: workspace with Zod overlay config. Open a spec that violates the Zod schema. Assert Zod-native diagnostics appear.
- `TestLSP_SpectralRuleset`: workspace with Spectral ruleset config. Open a spec. Assert Spectral diagnostics appear. Assert deduplication against built-in rules (no duplicate diagnostics for the same issue).
- `TestLSP_NoBunNeeded`: workspace with no custom rules, Zod overlays, or Spectral rulesets. Assert Bun process is never spawned (verify by checking temp directory for runner binary — it should not exist).

---

## Layer 12: CLI (`cli/`)

### Integration Tests

**File: `cli/commands/lint_test.go`**

- `TestLint_ValidSpec`: `telescope lint testdata/specs/petstore/petstore.yaml`. Assert exit code 0. Assert no error output.
- `TestLint_InvalidSpec`: `telescope lint testdata/broken/missing-info.yaml`. Assert exit code 1. Assert error output contains "missing required field".
- `TestLint_MultiFile`: `telescope lint testdata/specs/multi-file/root.yaml`. Assert cross-file diagnostics appear.
- `TestLint_GlobPattern`: `telescope lint "testdata/specs/**/*.yaml"`. Assert all matching files linted.
- `TestLint_OutputFormat_JSON`: `telescope lint --format json ...`. Assert output is valid JSON. Assert structure matches `AnalysisResult` schema.
- `TestLint_OutputFormat_SARIF`: `telescope lint --format sarif ...`. Assert valid SARIF v2.1.0 output.
- `TestLint_OutputFormat_GitHub`: `telescope lint --format github ...`. Assert `::error file=...` annotation format.
- `TestLint_OutputFormat_Text`: `telescope lint --format text ...`. Assert human-readable output with file paths, line numbers, messages.
- `TestLint_WithConfig`: `telescope lint --config .telescope/config.yaml ...`. Assert config is applied (e.g., include/exclude patterns).
- `TestLint_WithCustomRules`: workspace with custom rules config. Assert custom rule diagnostics in output.
- `TestLint_WithZodOverlay`: workspace with Zod overlay config. Assert Zod diagnostics in output.
- `TestLint_WithSpectralRuleset`: workspace with Spectral config. Assert Spectral diagnostics in output.
- `TestLint_ExitCodes`: exit 0 for clean, exit 1 for errors, exit 2 for warnings-only (configurable).

**File: `cli/commands/ci_test.go`**

- `TestCI_Basic`: `telescope ci testdata/specs/petstore/petstore.yaml`. Assert same behavior as lint but formatted for CI.
- `TestCI_DiffBase`: `telescope ci --diff-base HEAD~1 testdata/specs/petstore/petstore.yaml`. Assert breaking change detection output (requires a git repo fixture).
- `TestCI_DiffBase_NoBreaking`: diff where only non-breaking changes were made. Assert exit code 0.
- `TestCI_DiffBase_Breaking`: diff where a path was removed. Assert breaking change reported. Assert exit code 1.

**File: `cli/commands/bundle_test.go`**

- `TestBundle_SingleFile`: `telescope bundle testdata/specs/petstore/petstore.yaml --output /tmp/bundled.yaml`. Assert output file is valid YAML. Assert no `$ref` values remain (all inlined).
- `TestBundle_MultiFile`: `telescope bundle testdata/specs/multi-file/root.yaml`. Assert all cross-file refs are inlined.
- `TestBundle_Circular`: `telescope bundle testdata/specs/circular/api.yaml`. Assert cycles are broken with inline `$ref` to first occurrence. Assert output is valid and parseable.
- `TestBundle_JSON`: `telescope bundle ... --format json`. Assert output is valid JSON.
- `TestBundle_Stdout`: `telescope bundle ... --output -`. Assert output goes to stdout.

### CLI Benchmark

- `BenchmarkCLI_Lint_Stripe`: `telescope lint` on Stripe spec. Target: <5 seconds total (includes startup, parse, validate).

---

## Layer 13: VS Code Extension End-to-End Tests

These tests run in a real VS Code instance using `@vscode/test-electron`. They verify the full user experience from editor interaction to visual feedback.

### Test Infrastructure

**File: `extension/src/test/runTest.ts`**

```typescript
import { runTests } from "@vscode/test-electron"

async function main() {
    await runTests({
        extensionDevelopmentPath: path.resolve(__dirname, "../../"),
        extensionTestsPath: path.resolve(__dirname, "./suite/index"),
        launchArgs: [
            testWorkspacePath,
            "--disable-extensions",  // disable all other extensions
        ],
    })
}
```

**File: `extension/src/test/suite/helper.ts`**

```typescript
// Wait for diagnostics to appear on a document
async function waitForDiagnostics(
    uri: vscode.Uri,
    timeout: number = 30000
): Promise<vscode.Diagnostic[]>

// Open a file and wait for it to be classified and analyzed
async function openAndWait(
    relativePath: string,
    timeout: number = 30000
): Promise<vscode.TextEditor>

// Trigger completion at a position and return the list
async function triggerCompletion(
    editor: vscode.TextEditor,
    position: vscode.Position
): Promise<vscode.CompletionList>

// Execute a go-to-definition command and return locations
async function goToDefinition(
    editor: vscode.TextEditor,
    position: vscode.Position
): Promise<vscode.Location[]>

// Execute find all references
async function findReferences(
    editor: vscode.TextEditor,
    position: vscode.Position
): Promise<vscode.Location[]>

// Execute rename
async function executeRename(
    editor: vscode.TextEditor,
    position: vscode.Position,
    newName: string
): Promise<vscode.WorkspaceEdit | undefined>

// Get hover content at a position
async function getHover(
    editor: vscode.TextEditor,
    position: vscode.Position
): Promise<vscode.Hover[]>

// Get code actions for a range
async function getCodeActions(
    editor: vscode.TextEditor,
    range: vscode.Range
): Promise<vscode.CodeAction[]>

// Simulate typing text into the editor
async function typeText(
    editor: vscode.TextEditor,
    position: vscode.Position,
    text: string
): Promise<void>

// Wait for the extension to fully activate
async function waitForExtensionActivation(
    timeout: number = 15000
): Promise<void>

// Assert diagnostic at a specific line with message pattern
function assertDiagnosticAtLine(
    diagnostics: vscode.Diagnostic[],
    line: number,
    messagePattern: RegExp,
    severity?: vscode.DiagnosticSeverity
): void
```

### Test Suite

**File: `extension/src/test/suite/activation.test.ts`**

- `test("extension activates when YAML file opened")`: open a `.yaml` file. Assert the Telescope extension activates (check `vscode.extensions.getExtension("telescope").isActive`).
- `test("extension activates when JSON file opened")`: same for `.json`.
- `test("extension does not activate for unrelated files")`: open a `.py` file. Assert extension does not activate.
- `test("LSP server starts within 5 seconds")`: open an OpenAPI file. Assert diagnostics arrive within 5 seconds (proves the LSP server started and completed analysis).
- `test("status bar shows Telescope info")`: assert status bar item shows OpenAPI version and file classification.

**File: `extension/src/test/suite/classification.test.ts`**

- `test("OpenAPI file gets openapi-yaml language mode")`: open a file with `openapi: "3.1.0"`. Assert `editor.document.languageId === "openapi-yaml"`.
- `test("non-OpenAPI YAML keeps yaml language mode")`: open a Docker Compose file. Assert `editor.document.languageId === "yaml"`.
- `test("JSON OpenAPI file gets openapi-json language mode")`: open a JSON OAS file. Assert `editor.document.languageId === "openapi-json"`.
- `test("fragment file gets correct language mode")`: open a file referenced via $ref from a root. Assert classified correctly (may require opening root first).

**File: `extension/src/test/suite/diagnostics.test.ts`**

- `test("valid spec shows no errors")`: open petstore. Wait for diagnostics. Assert zero error-level diagnostics.
- `test("invalid spec shows errors at correct lines")`: open a broken spec. Assert error diagnostic at the expected line with expected message pattern.
- `test("diagnostics update on edit")`: open valid spec, type an invalid value, wait for diagnostics. Assert new error appears. Fix the value, wait. Assert error clears.
- `test("diagnostics clear on file close")`: open file, get diagnostics, close file. Assert diagnostics cleared for that URI.
- `test("cross-file diagnostics appear")`: open multi-file workspace, introduce an error in a fragment. Assert diagnostic appears in the fragment file. Assert related info appears in the root file.
- `test("custom rule diagnostics appear")`: workspace with custom rules configured. Open spec. Assert custom rule diagnostics appear alongside built-in diagnostics. Assert custom rule diagnostics have the correct source label.
- `test("Zod overlay diagnostics appear")`: workspace with Zod overlay. Open spec violating the schema. Assert Zod error messages appear.
- `test("Spectral ruleset diagnostics appear")`: workspace with Spectral config. Open spec. Assert Spectral diagnostics appear.
- `test("rapid editing does not produce stale diagnostics")`: type 10 characters rapidly. Wait for diagnostics to settle. Assert final diagnostics match the final document state, not an intermediate state.

**File: `extension/src/test/suite/hover.test.ts`**

- `test("hover on $ref shows resolved schema")`: hover on a `$ref` value. Assert hover content contains the target schema's properties.
- `test("hover on description shows rendered markdown")`: hover on a description field. Assert hover content is rendered markdown (not raw text).
- `test("hover on deprecated operation shows warning")`: hover on an operation with `deprecated: true`. Assert hover includes deprecation notice.
- `test("hover on cross-file $ref shows target content")`: hover on a `$ref` pointing to another file. Assert hover shows the target's content.

**File: `extension/src/test/suite/completion.test.ts`**

- `test("$ref completion offers component names")`: place cursor inside a `$ref: "#/components/schemas/"`, trigger completion. Assert completion list includes schema component names.
- `test("$ref completion filters by context")`: cursor in a parameter `$ref`. Assert only parameter components offered.
- `test("HTTP method completion on path item")`: cursor on a new key inside a path item. Assert HTTP methods offered.
- `test("HTTP method completion excludes existing methods")`: path item already has `get`. Assert `get` is not in the completion list.
- `test("completion inside description offers markdown")`: cursor inside a description value. Assert completions are markdown-appropriate, not OpenAPI keywords.

**File: `extension/src/test/suite/definition.test.ts`**

- `test("go to definition on local $ref")`: go to definition on `$ref: "#/components/schemas/User"`. Assert editor navigates to the User schema definition in the same file.
- `test("go to definition on cross-file $ref")`: go to definition on `$ref: "./schemas/user.yaml"`. Assert a new editor tab opens for the target file at the correct position.
- `test("go to definition on operationId")`: go to definition on an operationId reference. Assert navigation to the operation.

**File: `extension/src/test/suite/references.test.ts`**

- `test("find references on component shows all usages")`: place cursor on a component name. Find all references. Assert all `$ref` usage locations are listed in the results panel.
- `test("find references across files")`: component referenced from multiple files. Assert all files appear in results.

**File: `extension/src/test/suite/rename.test.ts`**

- `test("rename component updates all references")`: rename a schema component. Assert all `$ref` strings in the workspace are updated.
- `test("rename preview shows affected files")`: initiate rename, check the preview. Assert all affected locations listed.

**File: `extension/src/test/suite/codeactions.test.ts`**

- `test("quick fix for typo replaces value")`: cursor on a typo diagnostic. Assert quick fix offered. Apply it. Assert value is corrected.
- `test("quick fix for missing field inserts it")`: cursor on a missing-field diagnostic. Assert quick fix offered. Apply it. Assert field is inserted with correct indentation.
- `test("extract to component creates $ref")`: select an inline schema. Assert "Extract to component" action offered. Apply it. Assert a new component is created and inline schema is replaced with `$ref`.

**File: `extension/src/test/suite/formatting.test.ts`**

- `test("format document fixes indentation")`: open a poorly-indented spec. Execute format document. Assert indentation is normalized.

**File: `extension/src/test/suite/codelens.test.ts`**

- `test("code lens shows reference count on components")`: open spec with components. Assert code lens items appear above component definitions showing reference counts.

**File: `extension/src/test/suite/commands.test.ts`**

- `test("Telescope: Show Graph Info command works")`: execute the command. Assert a panel opens displaying graph stats.
- `test("Telescope: Preview Bundled Spec command works")`: cursor in a root spec. Execute the command. Assert a new read-only tab opens with the bundled content.

**File: `extension/src/test/suite/multiroot.test.ts`**

- `test("multi-root workspace handles both roots")`: open VS Code workspace with 2 root specs. Assert both are analyzed. Assert cross-root shared fragments work correctly.
- `test("editing shared fragment updates both roots' diagnostics")`: edit a shared fragment. Assert diagnostics update for both root specs.

**File: `extension/src/test/suite/performance.test.ts`**

- `test("large spec loads within 10 seconds")`: open Stripe spec. Assert diagnostics arrive within 10 seconds.
- `test("hover responds within 200ms")`: open Stripe spec, wait for analysis. Measure hover latency at 10 positions. Assert all < 200ms.
- `test("completion responds within 300ms")`: measure completion latency. Assert all < 300ms.
- `test("incremental edit diagnostics within 2 seconds")`: edit one field, measure time to new diagnostics. Assert < 2 seconds.

### Running VS Code Tests

```bash
# Run all extension tests headlessly (CI-compatible)
cd extension
npm run test

# Run with visible VS Code window (debugging)
npm run test:visible

# Run a specific test file
npm run test -- --grep "diagnostics"
```

CI runs extension tests on Linux (xvfb), macOS, and Windows matrix.

---

## Layer 14: Cross-Cutting Concerns

### Race Condition Tests

Every package's integration tests run with `-race`. Additionally:

**File: `internal/racetest/race_test.go`**

- `TestRace_FullPipeline`: spawn 10 goroutines: 5 editing documents, 3 requesting hover/completion, 2 adding/removing sources. Run for 5 seconds. Assert no data races.
- `TestRace_SnapshotSwap`: one goroutine building new snapshots in a loop, 10 goroutines reading `Current()`. Run for 5 seconds. Assert readers never see a partially-built snapshot.
- `TestRace_GraphMutation`: concurrent AddEdge, RemoveEdgesFrom, Invalidate, Dependents. Run for 5 seconds. Assert consistent state after all goroutines complete.

### Memory Leak Tests

**File: `internal/leaktest/leak_test.go`**

- `TestLeak_WorkspaceClose`: create a workspace, add 100 sources, analyze, close. Assert goroutine count returns to baseline within 5 seconds.
- `TestLeak_BunManagerShutdown`: start Bun manager, run 100 requests, shutdown. Assert no orphan processes. Assert temp directory cleaned up.
- `TestLeak_RepeatedAnalysis`: analyze 1000 times in a loop on the same workspace. Monitor heap allocations. Assert no unbounded growth (allow GC to stabilize).
- `TestLeak_LargeWorkspaceClose`: load Stripe spec, analyze, close. Assert all file watchers released. Assert all goroutines stopped.

### Snapshot/Golden Test Maintenance

**File: `internal/testutil/golden.go`**

```go
// UpdateGolden controls whether tests update golden files or compare against them.
// Set via -update flag: go test ./... -update
var UpdateGolden = flag.Bool("update", false, "update golden test files")

// AssertGolden compares actual output against a golden file.
// If -update is set, writes actual to the golden file instead.
func AssertGolden(t *testing.T, goldenPath string, actual []byte)
```

All golden/snapshot tests support the `-update` flag for easy maintenance when intentional output changes occur.

---

## CI Pipeline

### GitHub Actions Workflow

```yaml
name: Test
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.23" }
      - run: go test -race -count=1 -timeout=300s ./core/... ./sdk/...
      - run: go test -race -count=1 -timeout=300s ./lsp/adapt/...

  integration:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: "1.23" }
      - uses: oven-sh/setup-bun@v2
      - name: Build Bun runner
        run: cd lsp/bun/runner && bun install && bun run build
      - run: go test -race -tags=integration -count=1 -timeout=600s ./...

  lsp-protocol:
    runs-on: ubuntu-latest
    needs: integration
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
      - uses: oven-sh/setup-bun@v2
      - name: Build Bun runner
        run: cd lsp/bun/runner && bun install && bun run build
      - name: Build telescope binary
        run: go build -o telescope ./cli
      - run: go test -race -tags=integration -count=1 -timeout=600s ./lsp/...

  extension:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    needs: integration
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - name: Build telescope binary
        run: make build
      - name: Install extension deps
        run: cd extension && npm ci
      - name: Run extension tests
        run: cd extension && xvfb-run -a npm test  # Linux
        if: runner.os == 'Linux'
      - name: Run extension tests
        run: cd extension && npm test
        if: runner.os != 'Linux'

  benchmarks:
    runs-on: ubuntu-latest
    needs: unit
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-go@v5
      - uses: oven-sh/setup-bun@v2
      - name: Build Bun runner
        run: cd lsp/bun/runner && bun install && bun run build
      - name: Run benchmarks
        run: go test -tags=integration -bench=. -benchmem -count=5 -timeout=600s ./... | tee bench-current.txt
      - name: Compare with baseline
        run: |
          git checkout main -- bench-baseline.txt 2>/dev/null || echo "No baseline"
          if [ -f bench-baseline.txt ]; then
            go install golang.org/x/perf/cmd/benchstat@latest
            benchstat bench-baseline.txt bench-current.txt | tee bench-comparison.txt
            # Fail if any benchmark regressed >20%
            python3 scripts/check-regression.py bench-comparison.txt --threshold 20
          fi

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
      - name: No LSP deps in core/sdk
        run: |
          deps=$(go list -deps ./core/... ./sdk/... | grep -E "(protocol|jsonrpc2)" || true)
          if [ -n "$deps" ]; then
            echo "ERROR: core/ or sdk/ has LSP protocol dependencies:"
            echo "$deps"
            exit 1
          fi
      - name: golangci-lint
        uses: golangci/golangci-lint-action@v4
      - name: Vet
        run: go vet ./...
```

### Test Tags

- No tag: unit tests. Run everywhere, fast, no external dependencies.
- `//go:build integration`: requires Bun runner binary, filesystem access, longer timeouts.
- Extension tests: separate npm test runner, requires VS Code/Electron.

### Coverage Targets

- `core/`: 90% line coverage minimum.
- `sdk/`: 85% line coverage minimum.
- `lsp/handlers/`: 80% line coverage minimum.
- `lsp/bun/`: 75% line coverage minimum (hard to unit-test IPC; integration tests cover the gap).
- `cli/`: 70% line coverage minimum (mostly integration-tested).

Coverage is tracked per-package in CI and reported on PRs. Coverage drops are flagged but not blocking (to avoid gaming the metric).

---

## Test Execution Summary

| Layer                      | Test Count (est.) | Runtime Target         | Requires                  |
| -------------------------- | ----------------- | ---------------------- | ------------------------- |
| Core types                 | ~15               | <1s                    | Nothing                   |
| Parser                     | ~60               | <5s                    | Nothing                   |
| Classification             | ~20               | <2s                    | Nothing                   |
| Graph                      | ~40               | <3s                    | Nothing                   |
| Pipeline                   | ~15               | <3s                    | Nothing                   |
| Validation                 | ~30               | <5s                    | Nothing                   |
| SDK                        | ~15               | <10s                   | Nothing                   |
| Bun (Go unit)              | ~10               | <2s                    | Nothing                   |
| Bun (integration)          | ~25               | <60s                   | Bun runner binary         |
| LSP adapters               | ~10               | <1s                    | Nothing                   |
| LSP handlers (unit)        | ~60               | <10s                   | Nothing                   |
| LSP protocol (integration) | ~40               | <120s                  | Telescope binary          |
| CLI                        | ~20               | <60s                   | Telescope binary          |
| VS Code extension          | ~40               | <180s                  | VS Code, Telescope binary |
| Race/leak tests            | ~10               | <30s                   | Nothing                   |
| Benchmarks                 | ~20               | <300s                  | Bun runner binary         |
| **Total**                  | **~430**          | **<15 min full suite** |                           |