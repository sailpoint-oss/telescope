This is a really solid foundation. The visitor pattern is clean, the `defineRule`/`defineGenericRule`/`defineSchema` split is well thought out, and the typed ref accessors (`info.hasContact()`, `op.operationId()`) are exactly the right DX. Let me design how this maps into the new Go architecture.

---

## The Overall Boundary

```
Go LSP Core
│
│  spawns on first custom rule load
▼
Bun Sidecar Process  ←→  .telescope/ directory
│
├── loads user rules via dynamic import
├── runs visitor engine
└── returns diagnostics over IPC
```

The Go side owns the **graph, snapshots, and document model**. The Bun side owns **rule loading, visitor dispatch, and TypeScript execution**. The critical design decision is what you serialize across the boundary and when.

---

## IPC Design

Unix socket for everything except Windows, named pipe on Windows. MessagePack over the wire — faster than JSON for the nested structures you're sending, and Bun handles it natively via a small adapter.

```go
// internal/bun/protocol.go

type MessageType string

const (
    MsgLoadRules    MessageType = "loadRules"
    MsgUnloadRules  MessageType = "unloadRules"
    MsgRunRules     MessageType = "runRules"
    MsgRuleResult   MessageType = "ruleResult"
    MsgRuleError    MessageType = "ruleError"
    MsgReady        MessageType = "ready"
    MsgPing         MessageType = "ping"
    MsgPong         MessageType = "pong"
)

type Envelope struct {
    ID      string          `msgpack:"id"`
    Type    MessageType     `msgpack:"type"`
    Payload msgpack.RawMessage `msgpack:"payload"`
}

// Sent once per workspace, or when config changes
type LoadRulesRequest struct {
    Rules   []RuleConfig `msgpack:"rules"`
    WorkDir string       `msgpack:"workDir"`
}

type RuleConfig struct {
    ID       string            `msgpack:"id"`
    Path     string            `msgpack:"path"`    // absolute path
    Kind     string            `msgpack:"kind"`    // "openapi" | "generic" | "schema"
    Severity string            `msgpack:"severity"` // override
    Patterns []string          `msgpack:"patterns"`
    Options  map[string]any    `msgpack:"options"`
}

// Sent per analysis cycle (batched per document)
type RunRulesRequest struct {
    DocumentURI  string         `msgpack:"documentURI"`
    RuleIDs      []string       `msgpack:"ruleIDs"`
    Document     SerializedDoc  `msgpack:"document"`
    Project      SerializedProjectIndex `msgpack:"project"`
}

type RunRulesResponse struct {
    DocumentURI string              `msgpack:"documentURI"`
    Diagnostics []SerializedDiagnostic `msgpack:"diagnostics"`
    Fixes       []SerializedFix     `msgpack:"fixes"`
    RuleTimings map[string]float64  `msgpack:"ruleTimings"`
    Errors      []RuleRunError      `msgpack:"errors"`
}
```

---

## What Gets Serialized

This is the most important design decision. You don't want to serialize your full internal graph — that's expensive and exposes implementation details. You serialize a **read-only projection** of your semantic AST that matches exactly what the TypeScript SDK types describe.

```go
// internal/bun/serialize.go

// SerializedDoc is what the Bun side sees as ctx.project.docs.get(uri)
type SerializedDoc struct {
    URI      string         `msgpack:"uri"`
    AST      map[string]any `msgpack:"ast"`      // raw resolved value tree
    RawText  string         `msgpack:"rawText"`
    Format   string         `msgpack:"format"`   // "yaml" | "json"
    Version  string         `msgpack:"version"`  // "3.0" | "3.1" | "2.0"
    Pointers PointerIndex   `msgpack:"pointers"` // JSON pointer → source range
}

// PointerIndex lets the Bun side call ctx.locate(uri, pointer)
// without needing the full AST traversal
type PointerIndex map[string]SerializedRange

type SerializedRange struct {
    StartLine   int `msgpack:"startLine"`
    StartChar   int `msgpack:"startChar"`
    EndLine     int `msgpack:"endLine"`
    EndChar     int `msgpack:"endChar"`
}

// SerializedProjectIndex is the cross-file index
// Only send what rules actually need
type SerializedProjectIndex struct {
    OperationIDs  map[string][]string `msgpack:"operationIds"`  // id → []uri
    ComponentRefs map[string][]string `msgpack:"componentRefs"` // ref → []uri
    Tags          map[string][]string `msgpack:"tags"`
}
```

The pointer index is the key piece. When you build the semantic AST from the tree-sitter CST, you emit a flat map of every JSON pointer to its source range. This means `ctx.locate(uri, pointer)` on the Bun side is an O(1) map lookup — no traversal, no search.

```go
func BuildPointerIndex(node *SemanticNode, prefix string, idx PointerIndex) {
    idx[prefix] = SerializedRange{
        StartLine: node.Range.Start.Line,
        StartChar: node.Range.Start.Character,
        EndLine:   node.Range.End.Line,
        EndChar:   node.Range.End.Character,
    }
    switch node.Kind {
    case NodeMapping:
        for k, child := range node.Children {
            escaped := escapeJSONPointer(k)
            BuildPointerIndex(child, prefix+"/"+escaped, idx)
        }
    case NodeSequence:
        for i, child := range node.Items {
            BuildPointerIndex(child, fmt.Sprintf("%s/%d", prefix, i), idx)
        }
    }
}
```

---

## The Go Sidecar Manager

```go
// internal/bun/manager.go

type Manager struct {
    mu          sync.RWMutex
    proc        *os.Process
    conn        net.Conn
    pending     map[string]chan *Envelope
    pendingMu   sync.Mutex
    ready       chan struct{}
    workDir     string
    bunPath     string
    scriptPath  string  // path to embedded runner script
    logger      *slog.Logger
}

func NewManager(workDir string, logger *slog.Logger) (*Manager, error) {
    bunPath, err := exec.LookPath("bun")
    if err != nil {
        // Bun not installed — not an error, custom rules just won't run
        return nil, nil
    }
    return &Manager{
        workDir:    workDir,
        bunPath:    bunPath,
        pending:    make(map[string]chan *Envelope),
        ready:      make(chan struct{}),
        logger:     logger,
    }, nil
}

func (m *Manager) Available() bool {
    return m != nil
}

func (m *Manager) Start(ctx context.Context) error {
    // Extract embedded runner script to temp dir
    scriptPath, err := m.extractRunner()
    if err != nil {
        return fmt.Errorf("extracting bun runner: %w", err)
    }
    m.scriptPath = scriptPath

    // Create unix socket
    socketPath := filepath.Join(os.TempDir(), fmt.Sprintf("telescope-%d.sock", os.Getpid()))
    listener, err := net.Listen("unix", socketPath)
    if err != nil {
        return err
    }

    // Spawn Bun
    cmd := exec.CommandContext(ctx, m.bunPath, "run", m.scriptPath)
    cmd.Env = append(os.Environ(), "TELESCOPE_SOCKET="+socketPath)
    cmd.Dir = m.workDir
    cmd.Stderr = &logWriter{logger: m.logger, level: slog.LevelWarn}
    
    if err := cmd.Start(); err != nil {
        return fmt.Errorf("starting bun: %w", err)
    }
    m.proc = cmd.Process

    // Accept connection with timeout
    listener.(*net.UnixListener).SetDeadline(time.Now().Add(10 * time.Second))
    conn, err := listener.Accept()
    if err != nil {
        m.proc.Kill()
        return fmt.Errorf("bun did not connect: %w", err)
    }
    m.conn = conn

    // Wait for ready signal
    go m.readLoop(ctx)
    select {
    case <-m.ready:
        m.logger.Info("bun rule runner ready")
    case <-time.After(10 * time.Second):
        return fmt.Errorf("bun runner timeout waiting for ready")
    case <-ctx.Done():
        return ctx.Err()
    }

    return nil
}

func (m *Manager) RunRules(ctx context.Context, req *RunRulesRequest) (*RunRulesResponse, error) {
    if !m.Available() {
        return &RunRulesResponse{}, nil
    }

    payload, err := msgpack.Marshal(req)
    if err != nil {
        return nil, err
    }

    id := newRequestID()
    ch := make(chan *Envelope, 1)
    
    m.pendingMu.Lock()
    m.pending[id] = ch
    m.pendingMu.Unlock()
    defer func() {
        m.pendingMu.Lock()
        delete(m.pending, id)
        m.pendingMu.Unlock()
    }()

    if err := m.send(&Envelope{ID: id, Type: MsgRunRules, Payload: payload}); err != nil {
        return nil, err
    }

    select {
    case resp := <-ch:
        var result RunRulesResponse
        if err := msgpack.Unmarshal(resp.Payload, &result); err != nil {
            return nil, err
        }
        return &result, nil
    case <-ctx.Done():
        return nil, ctx.Err()
    case <-time.After(30 * time.Second):
        return nil, fmt.Errorf("rule runner timeout")
    }
}
```

---

## The Embedded Runner Script

The runner is embedded into your Go binary via `//go:embed`. Users don't install it — it ships with the LSP:

```go
// internal/bun/runner.go

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

The runner itself is a TypeScript file you build with Bun into a single bundled `runner.js` as part of your release process:

```typescript
// internal/bun/runner/src/runner.ts

import { connect } from "net"
import { pack, unpack } from "msgpackr"

const socketPath = process.env.TELESCOPE_SOCKET!
const socket = connect(socketPath)

// Rule registry
const loadedRules = new Map<string, LoadedRule>()

socket.on("connect", async () => {
    await send({ id: "init", type: "ready", payload: {} })
})

socket.on("data", async (data) => {
    const envelope = unpack(data) as Envelope
    
    switch (envelope.type) {
        case "loadRules":
            await handleLoadRules(envelope)
            break
        case "runRules":
            await handleRunRules(envelope)
            break
        case "ping":
            await send({ id: envelope.id, type: "pong", payload: {} })
            break
    }
})

async function handleLoadRules(envelope: Envelope) {
    const req = envelope.payload as LoadRulesRequest
    
    for (const ruleConfig of req.rules) {
        try {
            const mod = await import(ruleConfig.path)
            const rule = mod.default
            
            loadedRules.set(ruleConfig.id, {
                config: ruleConfig,
                rule,
                kind: ruleConfig.kind,
            })
        } catch (err) {
            // Report load error but don't crash
            await send({
                id: envelope.id,
                type: "ruleError",
                payload: {
                    ruleID: ruleConfig.id,
                    error: String(err),
                    phase: "load",
                }
            })
        }
    }
    
    await send({ id: envelope.id, type: "ready", payload: {} })
}

async function handleRunRules(envelope: Envelope) {
    const req = envelope.payload as RunRulesRequest
    const diagnostics: SerializedDiagnostic[] = []
    const fixes: SerializedFix[] = []
    const timings: Record<string, number> = {}
    const errors: RuleRunError[] = []

    // Build ctx once per document, shared across rules
    const ctx = buildContext(req)

    for (const ruleID of req.ruleIDs) {
        const loaded = loadedRules.get(ruleID)
        if (!loaded) continue

        const start = performance.now()
        try {
            await runSingleRule(loaded, ctx, req)
            timings[ruleID] = performance.now() - start
        } catch (err) {
            errors.push({ ruleID, error: String(err), phase: "run" })
            timings[ruleID] = performance.now() - start
        }
    }

    // Collect from ctx after all rules run
    diagnostics.push(...ctx._diagnostics)
    fixes.push(...ctx._fixes)

    await send({
        id: envelope.id,
        type: "ruleResult",
        payload: { 
            documentURI: req.documentURI,
            diagnostics, 
            fixes, 
            ruleTimings: timings,
            errors,
        }
    })
}
```

---

## The Visitor Engine (Bun Side)

This is where your existing visitor pattern lives, now cleanly separated from the IPC layer:

```typescript
// internal/bun/runner/src/engine.ts

export function runOpenAPIRule(
    rule: OpenAPIRule,
    ctx: RuleContext,
    doc: SerializedDoc,
    project: SerializedProjectIndex
) {
    const visitors = rule.check(ctx)
    if (!visitors) return

    const ast = doc.ast as OpenAPIDocument
    
    // Walk the semantic structure, not the raw AST
    // Order matters — Root before PathItem before Operation etc.
    
    if (visitors.Root && isRootDocument(ast)) {
        visitors.Root(buildRootRef(doc, ast))
    }
    
    if (visitors.Info && ast.info) {
        visitors.Info(buildInfoRef(doc, ast.info, "/info"))
    }
    
    if (visitors.PathItem || visitors.Operation || visitors.Parameter || visitors.Response) {
        walkPaths(ast, doc, visitors)
    }
    
    if (visitors.Component || visitors.Schema) {
        walkComponents(ast, doc, visitors)
    }
    
    // Project visitor runs after all documents — handled at batch level
}

function walkPaths(ast: OpenAPIDocument, doc: SerializedDoc, visitors: Visitors) {
    for (const [path, pathItem] of Object.entries(ast.paths ?? {})) {
        const pathPointer = `/paths/${escapePointer(path)}`
        
        if (visitors.PathItem) {
            visitors.PathItem(buildPathItemRef(doc, pathItem, pathPointer, path))
        }
        
        if (visitors.Operation) {
            for (const method of HTTP_METHODS) {
                const op = pathItem[method]
                if (!op) continue
                const opPointer = `${pathPointer}/${method}`
                visitors.Operation(buildOperationRef(doc, op, opPointer, method, path))
            }
        }
    }
}
```

---

## The Typed Ref Builders

This is what makes rule authoring feel great. Each ref builder wraps the raw AST node with typed accessor methods, exactly like your existing design:

```typescript
// internal/bun/runner/src/refs.ts

export function buildInfoRef(doc: SerializedDoc, node: any, pointer: string): InfoRef {
    return {
        uri: doc.uri,
        pointer,
        node,
        
        title: () => node.title as string,
        version: () => node.version as string,
        description: () => node.description as string | undefined,
        contact: () => node.contact,
        license: () => node.license,
        hasContact: () => Boolean(node.contact),
        hasLicense: () => Boolean(node.license),
    }
}

export function buildOperationRef(
    doc: SerializedDoc,
    node: any,
    pointer: string,
    method: string,
    path: string,
): OperationRef {
    return {
        uri: doc.uri,
        pointer,
        node,
        method,
        path,
        
        operationId: () => node.operationId as string | undefined,
        summary: () => node.summary as string | undefined,
        description: () => node.description as string | undefined,
        tags: () => (node.tags ?? []) as string[],
        deprecated: () => Boolean(node.deprecated),
        
        eachParameter: (fn) => {
            for (const [i, param] of (node.parameters ?? []).entries()) {
                fn(buildParameterRef(doc, param, `${pointer}/parameters/${i}`))
            }
        },
        eachResponse: (fn) => {
            for (const [code, resp] of Object.entries(node.responses ?? {})) {
                fn(buildResponseRef(doc, resp, `${pointer}/responses/${code}`, code))
            }
        },
    }
}
```

---

## The Context Object

```typescript
// internal/bun/runner/src/context.ts

export function buildContext(req: RunRulesRequest): RuleContext & ContextInternal {
    const diagnostics: SerializedDiagnostic[] = []
    const fixes: SerializedFix[] = []
    
    const ctx = {
        _diagnostics: diagnostics,
        _fixes: fixes,
        
        project: {
            docs: new Map(Object.entries(req.project.docs ?? {})),
            index: req.project,
        },
        
        locate(uri: string, pointer: string): Range | undefined {
            const doc = req.document // single doc per request
            return doc.pointers[pointer]
                ? rangeFromSerialized(doc.pointers[pointer])
                : undefined
        },
        
        // reportAt is the ergonomic shorthand from your existing design
        reportAt(ref: AnyRef, field: string, opts: ReportOptions) {
            const pointer = field 
                ? `${ref.pointer}/${field}` 
                : ref.pointer
            const range = ctx.locate(ref.uri, pointer) 
                ?? ctx.locate(ref.uri, ref.pointer)
            
            diagnostics.push({
                message: opts.message,
                severity: opts.severity ?? "warning",
                uri: ref.uri,
                range: range ?? fallbackRange(),
                ruleID: opts.ruleID,
                code: opts.code,
            })
        },
        
        report(opts: FullReportOptions) {
            diagnostics.push({
                message: opts.message,
                severity: opts.severity ?? "warning",
                uri: opts.uri,
                range: opts.range ?? fallbackRange(),
                ruleID: opts.ruleID,
            })
        },
        
        fix(opts: FixOptions) {
            fixes.push(opts)
        },
        
        offsetToRange(start: number, end: number): Range | undefined {
            // Use rawText from doc to convert offsets
            return offsetToRange(req.document.rawText, start, end)
        },
    }
    
    return ctx
}
```

---

## Integration Into the Go Analysis Pipeline

```go
// internal/analysis/pipeline.go

func (p *Pipeline) AnalyzeDocument(ctx context.Context, snap *Snapshot, uri string) (*AnalysisResult, error) {
    result := &AnalysisResult{URI: uri}
    
    // Stage 1-4: Go-native, always run
    node := snap.GetNode(uri)
    result.Add(p.structuralValidator.Validate(node))
    result.Add(p.schemaValidator.Validate(node))
    result.Add(p.builtinRules.Run(node, snap))
    
    // Stage 5: Custom rules via Bun — only if available and rules registered
    if p.bunManager.Available() && p.hasCustomRulesFor(uri) {
        serialized := p.serializer.SerializeDoc(node, snap)
        ruleIDs := p.matchingRuleIDs(uri)
        
        bunCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
        defer cancel()
        
        bunResult, err := p.bunManager.RunRules(bunCtx, &bun.RunRulesRequest{
            DocumentURI: uri,
            RuleIDs:     ruleIDs,
            Document:    serialized,
            Project:     p.serializer.SerializeIndex(snap),
        })
        if err != nil {
            // Log but don't fail the analysis — custom rules are opt-in
            p.logger.Warn("bun rule runner error", "err", err, "uri", uri)
        } else {
            result.Add(p.deserializeDiagnostics(bunResult))
            p.reportSlowRules(bunResult.RuleTimings)
        }
    }
    
    return result, nil
}
```

---

## The SDK Package

Publish this to npm as `telescope-server` — it's the contract between your LSP and rule authors. The types need to be stable and versioned carefully:

```typescript
// packages/telescope-server/src/index.ts

export { defineRule } from "./define-rule"
export { defineGenericRule } from "./define-generic-rule"  
export { defineSchema } from "./define-schema"
export { getValueAtPointer, joinPointer, splitPointer, getParentPointer } from "./pointers"
export type { 
    RuleContext,
    InfoRef, RootRef, OperationRef, PathItemRef,
    SchemaRef, ParameterRef, ResponseRef, RequestBodyRef,
    ComponentRef, TagRef, ExampleRef, HeaderRef,
    MediaTypeRef, LinkRef, CallbackRef, ReferenceRef,
    SecurityRequirementRef,
    ReportOptions, FixOptions, Range, Severity,
} from "./types"
```

The `defineRule` wrapper is thin but important — it validates the rule shape at load time and gives you a hook to attach metadata:

```typescript
export function defineRule(def: RuleDefinition): RuleDefinition {
    if (!def.meta?.id) throw new Error("Rule must have meta.id")
    if (!def.meta?.number) throw new Error("Rule must have meta.number")
    if (typeof def.check !== "function") throw new Error("Rule must have check()")
    return def
}
```

---

## Hot Reload

Since the Bun side uses dynamic `import()`, hot reloading a changed rule is a `loadRules` message with the updated path. The Go side watches `.telescope/` via `fsnotify` and triggers a reload:

```go
func (m *Manager) WatchRules(ctx context.Context, telescopeDir string) {
    watcher, _ := fsnotify.NewWatcher()
    watcher.Add(filepath.Join(telescopeDir, "rules"))
    watcher.Add(filepath.Join(telescopeDir, "schemas"))
    
    for {
        select {
        case event := <-watcher.Events:
            if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) {
                m.reloadRule(ctx, event.Name)
            }
        case <-ctx.Done():
            return
        }
    }
}
```

The rule reload invalidates the analysis cache for all documents that matched that rule's patterns and triggers a re-analysis — the user sees updated diagnostics within a second or two of saving their rule file, which is a genuinely great authoring experience.