Great catch — yes, but you need a clear boundary between what tree-sitter owns and what the validator owns, because they operate on fundamentally different representations.

---

## The Core Tension

Tree-sitter gives you a **syntax tree** — it knows about YAML mappings, sequences, scalars, anchors, and aliases. It has no concept of what the values *mean* in OpenAPI terms.

Your validation pipeline needs a **semantic instance** — a Go value (`map[string]any` or a typed AST) that the JSON Schema validator can walk and annotate with source positions.

These are two different things, and you need both. The question is just where the boundary sits and how you cross it efficiently.

---

## The Clean Architecture

```
tree-sitter parse
      │
      ▼
tree-sitter CST (concrete syntax tree)
      │
      │  CST → Semantic AST transform
      ▼
Positional Semantic AST        ←─── this is YOUR representation
      │              │
      │              └──── JSON Schema validator input
      │                    (AnnotatedInstance wrapping your AST)
      ▼
Graph binding, $ref resolution,
hover, completion, etc.
```

Tree-sitter is your **parser**. Your positional semantic AST is your **IR**. The validator consumes the IR, not the tree-sitter CST directly.

---

## The Transform Layer

You write a single CST → semantic AST transform. This runs once per file version, same as any other parse stage output:

```go
type ASTBuilder struct {
    source []byte
}

func (b *ASTBuilder) BuildFromCST(root *sitter.Node) (*SemanticNode, error) {
    return b.visitNode(root)
}

func (b *ASTBuilder) visitNode(n *sitter.Node) (*SemanticNode, error) {
    switch n.Type() {
    case "block_mapping":
        return b.visitMapping(n)
    case "block_sequence":
        return b.visitSequence(n)
    case "plain_scalar", "double_quoted_scalar", "single_quoted_scalar":
        return b.visitScalar(n)
    case "block_scalar": // | and > styles
        return b.visitBlockScalar(n)
    case "alias":
        return b.visitAlias(n) // YAML anchors/aliases
    }
    // ...
}

type SemanticNode struct {
    Kind     NodeKind        // Mapping, Sequence, Scalar, Null
    Value    any             // Go native value
    Range    protocol.Range  // from tree-sitter node positions
    Children map[string]*SemanticNode // for mappings
    Items    []*SemanticNode           // for sequences
    
    // tree-sitter node kept for cheap re-queries
    CST      *sitter.Node
}
```

This transform is very fast — it's a straight tree walk, no I/O, no resolution. The output is your canonical IR that everything else consumes.

---

## What Tree-sitter Still Owns

Tree-sitter remains responsible for everything syntax-level:

- **Incremental reparsing** on keystroke — this is tree-sitter's killer feature, don't give it up
- **Error recovery** — tree-sitter keeps parsing through syntax errors, giving you a partial CST even on broken documents
- **Syntax highlighting** via queries (`.scm` files)
- **Folding ranges** via queries
- **Indentation** logic
- **Comment detection**
- **Embedded language injection** — tree-sitter has a native injection mechanism for markdown inside strings, which is directly relevant to your description fields problem

The last point is significant. Tree-sitter's injection queries let you declare "the content of nodes matching this pattern should be parsed as markdown" and the editor handles the rest. For syntax highlighting of markdown in descriptions, this is the right mechanism, not virtual documents. Virtual documents are for LSP *features* (diagnostics, completions) inside embedded content — tree-sitter injections are for *highlighting*.

---

## Where the Boundary Lives in Practice

```
Keystroke
    │
    ├─► tree-sitter incremental reparse → new CST (microseconds)
    │       │
    │       ├─► syntax highlighting query (tree-sitter, stays in CST)
    │       ├─► folding ranges query (tree-sitter, stays in CST)
    │       └─► markdown injection (tree-sitter, stays in CST)
    │
    └─► CST → SemanticNode transform (fast, on changed subtree only)
            │
            ├─► $ref extraction → graph edge updates
            ├─► Virtual document extraction (for LSP markdown features)
            └─► Validation pipeline → LSP diagnostics
                    │
                    ├─► santhosh-tekuri/jsonschema (core OpenAPI schema)
                    ├─► Your Zod-exported overlays
                    └─► Error enrichment → source-mapped diagnostics
```

The key insight is that the CST → SemanticNode transform can be **incremental too** — tree-sitter tells you exactly which nodes changed in its edit result. You only need to re-transform the changed subtrees and patch your semantic AST, not rebuild it from scratch. This keeps the full pipeline fast even on large files.

---

## The One Gotcha

Tree-sitter's YAML grammar and YAML anchor/alias handling requires care. YAML aliases (`*anchorName`) are syntactically represented in the CST but semantically need to be dereferenced during your transform. This is separate from `$ref` — it's a YAML-level concern, not an OpenAPI-level concern. Handle it in the transform layer so everything above it sees already-resolved values. If you don't, your validator will see alias nodes it doesn't understand and fail in confusing ways.

Other than that, the pipeline composes cleanly. Tree-sitter and `santhosh-tekuri/jsonschema` never need to know about each other — your SemanticNode IR is the clean interface between them.