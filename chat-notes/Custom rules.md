This is one of the hardest DX problems in LSP design — you want the extensibility of a scripting runtime without blowing up your performance guarantees. Let me lay out the real options honestly.

---

## The Core Problem

Your Go LSP is a long-running server with a carefully managed snapshot model and concurrency guarantees. Custom rules need to:

- Run arbitrary user code safely
- Not block the analysis pipeline
- Not crash the LSP server if they throw
- Have access to enough context to be useful
- Feel good to write

These constraints pull in different directions depending on the runtime you choose.

---

## Option 1: Goja (JS Runtime Embedded in Go)

**Goja** is a pure Go ES2015+ JavaScript runtime — no CGo, no subprocess, just import and run.

```go
import "github.com/dop251/goja"

type JSRuleRunner struct {
    pool    *GojaPool    // pool of pre-warmed VMs, one per goroutine
    timeout time.Duration
}
```

**What you expose to rules:**

```javascript
// user's rule file
export default {
  name: "require-operation-id",
  description: "All operations must have an operationId",
  severity: "error",
  
  run({ node, context, report }) {
    if (node.type === "operation" && !node.operationId) {
      report({
        message: "Operation is missing operationId",
        range: node.range,
        fix: {
          description: "Add operationId",
          edit: { insert: node.range.start, text: "operationId: todo\n" }
        }
      })
    }
  }
}
```

**What you give them in context:**

```javascript
context = {
  document,        // the full parsed spec as a plain JS object
  graph,           // resolved $ref graph, read-only
  ancestors,       // path from root to current node
  siblingKeys,     // other keys in the same mapping
  resolveRef,      // function to follow a $ref and return target node
  options,         // rule config from their config file
}
```

**The VM pool is critical.** Goja VMs are not goroutine-safe, so you maintain a pool:

```go
type GojaPool struct {
    mu      sync.Mutex
    vms     []*GojaVM
    maxSize int
}

type GojaVM struct {
    runtime  *goja.Runtime
    compiled map[string]*goja.Program // pre-compiled rule programs
}

func (p *GojaPool) Run(rule *CompiledRule, node *SemanticNode) (*RuleResult, error) {
    vm := p.acquire()
    defer p.release(vm)
    
    // timeout via context + goja's interrupt mechanism
    done := make(chan struct{})
    go func() {
        select {
        case <-time.After(p.timeout):
            vm.runtime.Interrupt("rule timeout")
        case <-done:
        }
    }()
    defer close(done)
    
    return vm.run(rule, node)
}
```

**Honest limitations of Goja:**
- ES2015+, not full ESNext — no top-level await, limited modern syntax
- No TypeScript support natively — you'd need to transpile first
- Single-threaded per VM — parallelism comes from the pool, not from within a rule
- Performance is roughly 10-20x slower than V8 for CPU-heavy rule logic
- No npm ecosystem access — rules are self-contained

**When Goja is the right choice:** your rules are relatively simple node visitors, you want zero external dependencies, and you don't need TypeScript authoring.

---

## Option 2: Subprocess Runtime with Bun/Node

Since you already know Bun works well for this, the architecture is a **sidecar process** that your Go LSP spawns and communicates with over a local socket or stdio pipe.

```
Go LSP Server
    │
    │  spawn on startup if rules exist
    ▼
Bun Rule Runner (subprocess)
    │  JSON-RPC or msgpack over unix socket
    ├─ loadRules(paths[])
    ├─ runRule(ruleId, nodeContext) → []Diagnostic
    └─ reloadRule(path)            → ok
```

**The protocol between them:**

```go
type RuleRequest struct {
    ID       string          `json:"id"`
    RuleID   string          `json:"ruleId"`
    Node     SerializedNode  `json:"node"`
    Document SerializedDoc   `json:"document"`
    Options  json.RawMessage `json:"options"`
}

type RuleResponse struct {
    ID          string           `json:"id"`
    Diagnostics []RuleDiagnostic `json:"diagnostics"`
    Error       *string          `json:"error,omitempty"`
    DurationMs  float64          `json:"durationMs"`
}
```

**The Bun side:**

```typescript
// rule-runner.ts - the sidecar
import { serve } from "bun"

const rules = new Map<string, Rule>()

async function loadRule(path: string) {
  const mod = await import(path)
  rules.set(mod.default.name, mod.default)
}

async function runRule(req: RuleRequest): Promise<RuleResponse> {
  const rule = rules.get(req.ruleId)
  if (!rule) throw new Error(`Unknown rule: ${req.ruleId}`)
  
  const diagnostics: RuleDiagnostic[] = []
  const start = performance.now()
  
  try {
    await rule.run({
      node: req.node,
      document: req.document,
      options: req.options,
      report: (d) => diagnostics.push(d)
    })
  } catch (err) {
    // rule crashed — isolated, doesn't affect LSP
    return { id: req.id, diagnostics: [], error: String(err), durationMs: 0 }
  }
  
  return {
    id: req.id,
    diagnostics,
    durationMs: performance.now() - start
  }
}
```

**This unlocks full TypeScript rules with real types:**

```typescript
import type { RuleContext, Operation } from "@your-lsp/rules-sdk"

export default defineRule({
  name: "require-error-responses",
  severity: "warning",
  
  run({ node, report }: RuleContext<Operation>) {
    if (node.type !== "operation") return
    
    const hasErrorResponse = Object.keys(node.responses ?? {})
      .some(code => parseInt(code) >= 400)
    
    if (!hasErrorResponse) {
      report({
        message: "Operation has no error responses defined",
        range: node.range,
      })
    }
  }
})
```

**Serialization is your main cost.** You're not sending the whole document on every rule invocation — you batch:

```go
// Batch all rule runs for a file into one round trip
type BatchRuleRequest struct {
    DocumentURI string
    Document    SerializedDoc   // sent once
    Invocations []RuleInvocation // [{ruleId, nodeContext}...]
}
```

For a typical spec file, one round trip per analysis cycle, all rules run in the Bun process against the already-deserialized document.

**Honest limitations:**
- Bun must be installed — adds a runtime dependency
- Process startup latency on first use (~50-100ms, mitigated by keeping it alive)
- Serialization overhead for large documents
- More moving parts to manage (process lifecycle, crash recovery, restart)

---

## Option 3: Wazero (WASM Runtime in Go)

Rules compiled to WASM — maximum isolation, no external runtime dependency, any language that compiles to WASM.

```go
import "github.com/tetratelabs/wazero"

type WASMRuleRunner struct {
    runtime  wazero.Runtime
    modules  map[string]api.Module
}
```

This is genuinely future-proof and elegant but the DX for rule authors is currently poor — nobody wants to compile their lint rule to WASM. Worth keeping in mind as the ecosystem matures, but not the right choice today for developer-facing extensibility.

---

## The Hybrid Architecture (What I'd Actually Build)

Don't pick one. Layer them by use case:

```
Rule Sources
    │
    ├─ Built-in Go rules          → run in-process, full speed, no overhead
    │   (your core OpenAPI rules,      written by you, ship with the LSP
    │    Zod schema overlays)
    │
    ├─ Goja JS rules              → in-process, no dependencies required
    │   (simple custom rules,          good for teams without Bun
    │    config-driven conventions)    ES2015, self-contained
    │
    └─ Bun/Node TS rules          → subprocess, full TypeScript
        (complex rules,                full npm ecosystem
         rules with dependencies,      best authoring DX
         rules needing async)          requires Bun installed
```

The config file declares which runner to use, or you auto-detect:

```yaml
# .openapi-lsp.yaml
rules:
  - path: ./rules/require-examples.ts
    runner: bun          # explicit
    severity: warning
    
  - path: ./rules/naming-convention.js
    runner: goja         # no bun needed
    
  - path: ./rules/internal/*.ts
    runner: auto         # use bun if available, goja otherwise
    options:
      prefix: "x-acme-"
```

**Auto-detection logic:**

```go
func (r *RuleLoader) selectRunner(rule *RuleConfig) Runner {
    if rule.Runner != "auto" {
        return r.runners[rule.Runner]
    }
    if rule.Path ends with ".ts" && r.bunAvailable {
        return r.runners["bun"]
    }
    return r.runners["goja"] // always available
}
```

---

## The Rule SDK

Whichever runner is used, you ship a types package that makes rules feel great to write:

```typescript
// @your-lsp/rules-sdk  (published to npm)

export interface RuleContext<T = AnyNode> {
  node: T
  document: ResolvedDocument
  ancestors: AnyNode[]
  options: Record<string, unknown>
  report(diagnostic: ReportedDiagnostic): void
  resolveRef(ref: string): AnyNode | null
}

export interface ReportedDiagnostic {
  message: string
  range?: Range           // defaults to current node range
  severity?: Severity     // defaults to rule severity
  code?: string
  fixes?: Fix[]
  relatedInformation?: RelatedInfo[]
}

export function defineRule<T = AnyNode>(rule: RuleDefinition<T>): RuleDefinition<T>
```

The SDK is the interface contract between your Go LSP and user rules. Version it carefully — breaking it means breaking everyone's custom rules.

---

## Isolation and Safety

Regardless of runner, rules must be isolated from each other and from the LSP:

- **Timeouts** — every rule invocation has a hard deadline (default 500ms, configurable)
- **No filesystem access in Goja** — the VM context doesn't expose `fs` or `process`
- **Crash containment** — a rule panic/throw produces a diagnostic about the rule itself, never crashes the LSP
- **Per-rule performance tracking** — log slow rules, surface them in a `$/openapi/rulePerf` notification so users know when their rule is the bottleneck
- **Sandboxed document access** — rules get a read-only serialized view, never a pointer into your live graph

This architecture gives you Spectral-level extensibility with dramatically better performance characteristics, proper TypeScript authoring when you want it, and a graceful fallback when you don't.