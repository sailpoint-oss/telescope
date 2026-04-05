These are actually two really well-defined problems once you break them down. Neither is as impossible as it feels.

---

## Problem 1: File Detection Without a Dedicated Extension

This is a solved problem in the LSP ecosystem — you layer multiple heuristics and build a confidence scoring system. No single signal is reliable, but combined they're very accurate.

### Detection Strategy: Scored Heuristics

```go
type DetectionSignal int

const (
    SignalFileExtension     DetectionSignal = iota
    SignalRootKeys
    SignalOpenAPIField
    SignalInfoBlock
    SignalPathsOrComponents
    SignalWorkspaceContext  // neighboring files, known root docs
    SignalExplicitOverride  // user config, .openapi-lsp config file
)

type FileClassification struct {
    IsOpenAPI       bool
    Confidence      float64
    OpenAPIVersion  string // "2.0", "3.0.x", "3.1.x"
    IsFragment      bool   // no openapi: field but referenced by a known root
    Signals         []DetectionSignal
}
```

**The heuristics, in order of weight:**

**1. Explicit `openapi:` or `swagger:` field** — near-certain. A file with `openapi: "3.1.0"` at root is a root spec document. Weight this at ~0.95 alone.

**2. Root key fingerprinting** — OpenAPI has a very constrained set of valid root keys:
```go
var knownRootKeys = map[string]float64{
    "openapi":    0.95,
    "swagger":    0.95,
    "info":       0.30, // weak alone
    "paths":      0.60,
    "components": 0.60,
    "webhooks":   0.50,
    "tags":       0.20,
    // fragment-level keys
    "schema":     0.40,
    "properties": 0.30,
    "allOf":      0.50,
    "oneOf":      0.50,
    "$ref":       0.40,
    "summary":    0.10,
    "parameters": 0.40,
    "responses":  0.40,
}
```
Sum the weights of present root keys. If score > threshold, classify as OpenAPI.

**3. Graph membership** — if the file is already referenced by a `$ref` from a known OpenAPI document, it's definitionally an OpenAPI fragment regardless of its content. This is your most reliable fragment detector. The reverse edge index you built gives you this for free.

**4. Workspace proximity** — if the file lives in a directory tree that contains known root specs, it gets a prior bump. An `openapi/` or `schemas/` directory next to a `petstore.yaml` is almost certainly full of fragments.

**5. File extension as a weak prior** — `.yaml`/`.yml`/`.json` raises the baseline probability, but `.yaml` alone means nothing. You can also support `.openapi.yaml`, `.oas.yaml` conventions as stronger signals.

**6. User/workspace config** — always allow explicit override:
```json
// .openapi-lsp.json or via initializationOptions
{
  "roots": ["./specs/petstore.yaml"],
  "include": ["./schemas/**/*.yaml"],
  "exclude": ["./config/**"]
}
```

### The Classification Flow

```
File opened
    │
    ├─ Already in graph as a $ref target? → Fragment, confidence 1.0
    │
    ├─ Has openapi:/swagger: root key? → Root spec, confidence 0.95
    │
    ├─ Score root keys → above threshold?
    │       ├─ Yes + workspace context → OpenAPI file
    │       └─ Borderline → "possible OpenAPI", reduced feature set
    │
    └─ Below threshold → not our file, do nothing
```

When confidence is borderline, you can still offer a lightweight experience — don't emit diagnostics that would be noise on a non-OpenAPI file, but do offer to activate if the user confirms.

### LSP Registration

You register for broad file types and filter internally — don't rely on the client to do this for you:

```go
// During initialize, register for yaml + json
// Then internally gate all handlers on classification result
DocumentSelector: []protocol.DocumentFilter{
    {Language: "yaml"},
    {Language: "json"},
    {Language: "jsonc"},
}
```

The classification result is cached per file version in your snapshot. Re-classification only happens on content change, and only the root-key check needs to re-run (graph membership is maintained by the edge index).

---

## Problem 2: Embedded Markdown in Descriptions

This is the more interesting problem. The key insight is that you don't need to treat this as "impossible embedded language" — you treat it as **a virtual document projection**.

### The Virtual Document Model

Every `description` field in an OpenAPI document that contains markdown is a **virtual markdown document** with a synthetic URI and a precise source mapping back to the YAML:

```go
type VirtualDocument struct {
    URI           string          // "openapi-md://real-file.yaml#/paths/~1users/get/description"
    Content       string          // the raw markdown string value
    Language      string          // "markdown"
    ParentURI     string          // the real file URI
    JSONPointer   string          // RFC 6901 pointer to the field
    SourceRange   protocol.Range  // where in the parent file this value lives
    ValueOffset   int             // byte offset of the string value start (after quote/|)
    IsBlockScalar bool            // YAML | or > scalar vs quoted string
}
```

The JSON Pointer in the URI is your source map. Given any position in the virtual document, you can map it back to the real file position precisely.

### Position Mapping

This is the fiddly but critical part. YAML strings can be represented multiple ways, and each has different offset arithmetic:

```go
type OffsetMapper interface {
    // Virtual position → real file position
    ToReal(virtualPos protocol.Position) protocol.Position
    // Real file position → virtual position  
    ToVirtual(realPos protocol.Position) protocol.Position
}

// Implementations:
// - QuotedStringMapper    (accounts for leading quote, escape sequences)
// - LiteralBlockMapper    (YAML |, accounts for indent stripping, chomping)
// - FoldedBlockMapper     (YAML >, accounts for line folding)
```

Block scalars (the `|` style most people use for long descriptions) are the most common in OpenAPI and actually the easiest to map — lines correspond directly once you account for the indentation level.

### What You Actually Do With Virtual Documents

**Diagnostics** — run a markdown linter against the virtual document, map positions back to real file, emit as real-file diagnostics. The user sees markdown warnings in their YAML file at the right location.

**Hover** — when hovering over a `description` field *value*, render the markdown as HTML in the hover popup. This is just `description` → markdown render → VS Code hover markdown support. Already works, no virtual doc needed here.

**Completions inside descriptions** — if cursor is inside a description value, delegate completions to a markdown completion provider. Things like CommonMark link syntax, fenced code block language IDs, etc.

**Embedded `$ref`-style links in descriptions** — OpenAPI 3.1 allows markdown links that reference operation IDs (`[Get Users](#/paths/~1users/get)`). These are cross-document references *inside markdown inside YAML*. Your virtual doc model handles this naturally — the markdown provider sees a link, the link resolver knows it's in an OpenAPI context.

**Code block language detection inside descriptions** — people put example payloads in fenced code blocks in descriptions. You can offer JSON schema validation inside those blocks if the language is `json` or `yaml` and the surrounding context implies a schema example. This is a third level of nesting and genuinely hard — treat it as a stretch goal.

### The Embedded Language Registry

```go
type EmbeddedLanguageProvider interface {
    // Can this provider handle content at this JSON pointer location?
    Matches(pointer string, language string) bool
    
    // Extract all virtual documents from a parsed node
    Extract(node *ParsedNode) []VirtualDocument
    
    // Handle LSP requests for a virtual document
    Hover(vdoc VirtualDocument, pos protocol.Position) (*protocol.Hover, error)
    Complete(vdoc VirtualDocument, pos protocol.Position) ([]protocol.CompletionItem, error)
    Diagnostics(vdoc VirtualDocument) ([]protocol.Diagnostic, error)
}
```

You register providers for known embedded content locations:
- `**/description` → markdown
- `**/example` → JSON/YAML (schema-validated)
- `**/x-codeSamples/*/source` → language from `x-codeSamples/*/lang` field (common extension)

### Performance Characteristics

This is not expensive if structured correctly:

- Virtual document extraction is **O(description fields)** during the parse stage, not during requests
- Markdown parsing with goldmark is extremely fast, well under 1ms for typical description lengths
- Virtual docs are cached in the snapshot alongside the parsed node
- Position mapping is arithmetic, not search
- You only re-extract virtual docs for a node when that node's content version changes

The expensive case is a file with hundreds of description fields all changing simultaneously — which doesn't happen in practice. Normal editing touches one description at a time.

---

## Putting It Together

The file detection and virtual document systems compose cleanly:

```
File content arrives
    │
    ├─ Classify: is this OpenAPI?
    │       └─ No → drop, do nothing
    │
    ├─ Parse → positional AST
    │
    ├─ Extract virtual documents (descriptions, examples, etc.)
    │       └─ Cache in snapshot keyed by (file URI, field pointer)
    │
    ├─ Bind $refs → update graph edges
    │
    └─ Validate → diagnostics from:
            ├─ OpenAPI structural validation
            ├─ Markdown linter (via virtual docs)
            └─ Schema validation on examples (via virtual docs)
```

The "impossible" question resolves to: **classify aggressively using the graph, project embedded content into virtual documents with precise source maps, and delegate to the right provider per content type.** None of it is magic — it's just careful bookkeeping.