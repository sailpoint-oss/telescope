This changes the architecture in one very important foundational way that ripples through everything: **the core engine cannot have any coupling to the LSP protocol layer**. Right now that boundary is implicit. It needs to become explicit and enforced.

Let me map the full picture before updating the roadmap.

---

## The Three Consumers

```
┌─────────────────────────────────────────────────────┐
│                   telescope/core                    │
│  graph · parser · classify · validate · analyze     │
│  zero LSP deps · zero CLI deps · importable         │
└──────────┬──────────────────┬───────────────────────┘
           │                  │                  │
    ┌──────▼──────┐   ┌───────▼──────┐   ┌──────▼────────────┐
    │ telescope/  │   │ telescope/   │   │ your generator    │
    │    lsp      │   │    cli       │   │    tool           │
    │             │   │              │   │                   │
    │ gossip      │   │ cobra cmds   │   │ imports core      │
    │ JSON-RPC    │   │ lint/ci/     │   │ directly as a     │
    │ protocol    │   │ bundle/serve │   │ Go package        │
    └─────────────┘   └──────────────┘   └───────────────────┘
```

The critical constraint: `telescope/core` must compile and be fully functional with zero knowledge that LSP, VS Code, or stdio exists. `protocol.Range`, `protocol.Diagnostic`, `protocol.Position` — none of these can appear in core types. The LSP layer adapts core types to protocol types. The CLI adapts core types to text/JSON/SARIF output. Your generator tool gets native Go types with no translation needed.

---

## The Key New Concept: DocumentSource

The generator tool needs to inject **synthetic documents** — OpenAPI specs that don't exist on disk, produced programmatically from parsing a codebase. The graph engine needs a clean interface for this:

```go
// core/graph/source.go

// DocumentSource is how documents enter the graph.
// Implementations: FilesystemSource, LSPSource, SyntheticSource
type DocumentSource interface {
    // URI returns the canonical identifier for this document.
    // Synthetic docs use a scheme like: synthetic://myapp/users.yaml
    URI() string
    
    // Read returns current content and a version token.
    // Version must change whenever content changes.
    Read(ctx context.Context) (content []byte, version int64, err error)
    
    // Watch calls onChange whenever the document changes.
    // Returns a cancel func. If Watch is not supported, returns nil.
    Watch(ctx context.Context, onChange func()) (cancel func())
    
    // Hint provides optional pre-classification to skip heuristics.
    Hint() ClassificationHint
}

type ClassificationHint struct {
    IsOpenAPI      bool
    OpenAPIVersion string   // "3.1", "3.0", "2.0" — empty means unknown
    IsFragment     bool
    Skip           bool     // explicitly not OpenAPI, don't classify
}

// SyntheticSource is what your generator tool uses
type SyntheticSource struct {
    uri     string
    mu      sync.RWMutex
    content []byte
    version int64
    hint    ClassificationHint
    onChange []func()
}

func NewSyntheticSource(uri string, content []byte, hint ClassificationHint) *SyntheticSource {
    return &SyntheticSource{uri: uri, content: content, version: 1, hint: hint}
}

func (s *SyntheticSource) Update(content []byte) {
    s.mu.Lock()
    s.content = content
    s.version++
    cbs := s.onChange
    s.mu.Unlock()
    for _, cb := range cbs {
        cb()
    }
}
```

Your generator tool creates `SyntheticSource` instances, injects them into a `Workspace`, and gets analysis results back. It never touches a file, never speaks JSON-RPC.

---

## The Public Go API (telescope/sdk)

This is what your generator tool imports. It needs to feel like a proper Go library, not an LSP server you happen to be calling internally:

```go
// sdk/workspace.go

package sdk

// Workspace is the primary entry point for programmatic use.
// Create one per project/analysis context.
type Workspace struct {
    graph    *graph.WorkspaceGraph
    pipeline *analysis.Pipeline
    config   *Config
}

func New(opts ...Option) (*Workspace, error)

// AddSource registers a document source with the workspace.
// Call this for each file or synthetic document you want analyzed.
func (w *Workspace) AddSource(src graph.DocumentSource) error

// RemoveSource removes a source and all its dependents from the graph.
func (w *Workspace) RemoveSource(uri string) error

// Analyze runs the full analysis pipeline against all sources.
// Blocks until analysis is complete or ctx is cancelled.
// For incremental use, prefer Watch().
func (w *Workspace) Analyze(ctx context.Context) (*AnalysisResult, error)

// AnalyzeURI runs analysis for a single URI and its dependents.
func (w *Workspace) AnalyzeURI(ctx context.Context, uri string) (*AnalysisResult, error)

// Watch registers a callback that fires whenever analysis results change.
// Returns a cancel func. Starts background processing.
func (w *Workspace) Watch(ctx context.Context, onChange func(*AnalysisResult)) (cancel func(), err error)

// Index returns the current resolved OpenAPI index for a URI.
// Returns nil if the URI is not known or not yet analyzed.
func (w *Workspace) Index(uri string) *openapi.Index

// Graph returns read-only access to the workspace graph.
func (w *Workspace) Graph() graph.ReadOnlyGraph

// Close shuts down the workspace cleanly.
func (w *Workspace) Close() error
```

The result types are pure Go, no protocol dependency:

```go
// sdk/results.go

type AnalysisResult struct {
    // Diagnostics keyed by URI
    Diagnostics map[string][]Diagnostic
    
    // Graph stats
    NodeCount     int
    EdgeCount     int
    RootDocuments []string
    
    // Timing per stage
    StageDurations map[string]time.Duration
    
    // Rule timings (for slow rule detection)
    RuleDurations map[string]time.Duration
}

type Diagnostic struct {
    URI      string
    Range    Range         // core/types.Range, not protocol.Range
    Severity Severity
    Message  string
    Code     string
    Source   string        // "telescope", "bun-rules", "schema", etc.
    Related  []RelatedInfo
    Fixes    []Fix
}

type Range struct {
    Start Position
    End   Position
}

type Position struct {
    Line      int  // 0-indexed
    Character int  // 0-indexed
}

// Severity is a standalone type, not LSP-coupled
type Severity int
const (
    SeverityError   Severity = 1
    SeverityWarning Severity = 2
    SeverityInfo    Severity = 3
    SeverityHint    Severity = 4
)
```

The LSP layer then has thin adapters:

```go
// lsp/adapt/diagnostics.go

func DiagnosticToProtocol(d sdk.Diagnostic) protocol.Diagnostic {
    return protocol.Diagnostic{
        Range:    RangeToProtocol(d.Range),
        Severity: &[]protocol.DiagnosticSeverity{protocol.DiagnosticSeverity(d.Severity)}[0],
        Message:  d.Message,
        Code:     &protocol.IntegerOrString{Value: d.Code},
        Source:   &d.Source,
    }
}

func RangeToProtocol(r sdk.Range) protocol.Range {
    return protocol.Range{
        Start: protocol.Position{Line: uint32(r.Start.Line), Character: uint32(r.Start.Character)},
        End:   protocol.Position{Line: uint32(r.End.Line), Character: uint32(r.End.Character)},
    }
}
```

---

## How Your Generator Tool Uses This

```go
// In your generator LSP tool

import "github.com/your-org/telescope/sdk"

type GeneratorAnalyzer struct {
    workspace *sdk.Workspace
    sources   map[string]*graph.SyntheticSource
}

func NewGeneratorAnalyzer(cfg *sdk.Config) (*GeneratorAnalyzer, error) {
    ws, err := sdk.New(
        sdk.WithConfig(cfg),
        sdk.WithBuiltinRules(true),
        sdk.WithBunRules(false),  // likely not needed in generator context
    )
    if err != nil {
        return nil, err
    }
    return &GeneratorAnalyzer{workspace: ws, sources: make(map[string]*graph.SyntheticSource)}, nil
}

// Called when your generator produces a new spec for a file
func (g *GeneratorAnalyzer) UpdateGeneratedSpec(fileURI string, spec []byte) (*sdk.AnalysisResult, error) {
    src, exists := g.sources[fileURI]
    if !exists {
        src = graph.NewSyntheticSource(
            "synthetic://"+fileURI,
            spec,
            graph.ClassificationHint{IsOpenAPI: true, OpenAPIVersion: "3.1"},
        )
        g.sources[fileURI] = src
        g.workspace.AddSource(src)
    } else {
        src.Update(spec)
    }
    return g.workspace.AnalyzeURI(context.Background(), src.URI())
}

// Convert sdk diagnostics back to LSP protocol for your generator LSP
func (g *GeneratorAnalyzer) DiagnosticsForLSP(uri string, result *sdk.AnalysisResult) []protocol.Diagnostic {
    diags := result.Diagnostics[uri]
    out := make([]protocol.Diagnostic, len(diags))
    for i, d := range diags {
        out[i] = adapt.DiagnosticToProtocol(d)
    }
    return out
}
```

Clean, no ceremony, no IPC, no socket, no subprocess. Your generator tool is just using a Go library.

---

## Module Structure

This needs to be reflected in the Go module layout:

```
telescope/
├── go.mod                    # module: github.com/your-org/telescope
│
├── core/
│   ├── graph/                # workspace graph, DocumentSource, invalidation
│   ├── parser/               # tree-sitter wrapper, SemanticNode, OffsetMapper
│   ├── classify/             # FileClassifier, scored heuristics
│   ├── validate/             # ValidationPipeline, ErrorEnricher, overlays
│   ├── analyze/              # rule engine, visitor dispatch, RuleBuilder
│   ├── index/                # OpenAPI typed model, IndexCache
│   └── types/                # Range, Position, Severity, Diagnostic — NO LSP DEPS
│
├── sdk/                      # stable public API, wraps core
│   ├── workspace.go
│   ├── options.go
│   ├── results.go
│   └── doc.go                # package-level documentation
│
├── lsp/
│   ├── server.go             # gossip wiring
│   ├── adapt/                # core types → protocol types
│   ├── handlers/             # all 24 feature handlers
│   └── bun/                  # Bun sidecar manager
│
├── cli/
│   ├── main.go
│   └── commands/             # lint, ci, bundle, serve
│
├── rules/
│   ├── builtin/              # all 88 built-in rules
│   ├── spectral/             # Spectral-compatible YAML rulesets
│   └── plugin/               # hashicorp/go-plugin host (legacy)
│
└── packages/
    └── telescope-server/     # npm package for Bun rules SDK
```

The `core/` and `sdk/` packages have a strict rule enforced via linting: **zero imports from `lsp/`, `cli/`, or any LSP protocol package**. This is checkable with `depguard` or a simple `go list` check in CI.

---

## CLI as a First-Class Consumer of sdk

The CLI already exists but currently reaches into server internals. In V2 it uses `sdk` exclusively:

```go
// cli/commands/lint.go

func runLint(cmd *cobra.Command, args []string) error {
    ws, err := sdk.New(
        sdk.WithConfigFile(configPath),
        sdk.WithBuiltinRules(true),
    )
    if err != nil {
        return err
    }
    defer ws.Close()

    // Add filesystem sources for each path argument
    for _, path := range args {
        sources, err := filesystem.DiscoverSources(path, ws.Config().Include, ws.Config().Exclude)
        if err != nil {
            return err
        }
        for _, src := range sources {
            ws.AddSource(src)
        }
    }

    result, err := ws.Analyze(cmd.Context())
    if err != nil {
        return err
    }

    return outputFormat.Write(result) // text, json, sarif, github
}
```

This means the CLI and the LSP are provably running the same analysis logic — not two implementations that happen to share some code, but literally the same `sdk.Workspace`.

---

## Roadmap Changes

The roadmap needs two additions and one modification:

**Add to Phase 0:**
- `core/types` package — `Range`, `Position`, `Severity`, `Diagnostic`, `Fix` as protocol-independent types
- `DocumentSource` interface and `SyntheticSource` implementation
- `FilesystemSource` and `LSPSource` implementations
- CI lint rule: no LSP protocol imports in `core/` or `sdk/`

**Add as Phase 0.5 (before Phase 1):**
- `sdk/` package with `Workspace`, `AnalysisResult`, and options
- `sdk_test.go` integration test: create a workspace, add a synthetic source, run analysis, assert diagnostics — this test proves the package boundary is clean and remains the primary integration test for your generator tool

**Modify Phase 7.4 (Documentation):**
- Add `sdk/doc.go` with full package-level godoc
- Add `docs/SDK.md`: guide specifically for the generator tool use case — how to inject synthetic documents, how to watch for changes, how to map results back to source positions in the original codebase
- Add `docs/GENERATOR-INTEGRATION.md`: the specific integration pattern between the generator LSP and telescope

The rest of the roadmap stands as written — these changes slot cleanly into Phase 0 without disrupting the phase ordering, because `DocumentSource` and `core/types` are foundational enough that everything else in the roadmap is already implicitly built on them.