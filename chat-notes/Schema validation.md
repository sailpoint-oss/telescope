Great question. The short answer is: Go's JSON Schema ecosystem is behind JS/AJV, but there's one library that stands out, and for an LSP you actually want to go beyond what any off-the-shelf validator gives you anyway.

---

## The Go JSON Schema Landscape

**`santhosh-tekuri/jsonschema`** is the clear winner. It's the most complete, actively maintained, and spec-compliant JSON Schema library in Go.

- Draft 4, 6, 7, 2019-09, 2020-12 support
- OpenAPI 3.1 dialect support (which is JSON Schema 2020-12 with a vocabulary)
- Custom vocabularies and format validators
- Annotation collection (this is critical — more on this below)
- `$ref`, `$dynamicRef`, `$anchor` all handled correctly
- Returns structured validation errors, not just strings

```go
import "github.com/santhosh-tekuri/jsonschema/v6"

c := jsonschema.NewCompiler()
c.UseLoader(myCustomLoader) // hook in your virtual file system
schema, err := c.Compile("https://spec.openapis.org/oas/3.1/schema")
err = schema.Validate(instance)
```

It won't feel alien — the API is clean and composable. That said, it's not AJV. AJV's error output and customization depth are still ahead. But it's close enough, and the gap is bridgeable.

---

## The Real Answer: Don't Use It as a Black Box

For an LSP, raw schema validation output is not good enough regardless of library. AJV included. The problem is that validators return errors in terms of the **schema's** perspective, not the **user's document's** perspective. You need to invert that.

What a raw validator gives you:
```
/paths/~1users/get/responses/200/content/application~1json/schema/properties/id/type
must be one of: string, number, boolean, array, object, null
```

What your LSP should show:
```
Line 47, column 12: 'type' must be a valid JSON Schema type.
Did you mean "integer"? Valid types are: string, number, integer, boolean, array, object, null
```

To get there you need three things working together.

---

## Layer 1: Source-Mapped Validation

Your positional AST from the parse stage gives every node a source location. The validator walks the instance — you need to intercept that walk and attach source ranges to every error path.

```go
type AnnotatedInstance struct {
    // Wraps your parsed AST node
    // Implements jsonschema's instance interface
    // Carries source range at every node
    Node      *ASTNode
    SourceMap *SourceMap
}

type LSPValidationError struct {
    // From the validator
    SchemaPath   string
    InstancePath string
    Message      string
    
    // Enriched by you
    Range        protocol.Range  // exact source location
    Severity     protocol.DiagnosticSeverity
    Code         string          // machine-readable error code
    Related      []protocol.DiagnosticRelatedInformation
    Fixes        []CodeFix       // suggested quick fixes
}
```

The instance path from the validator (`/paths/~1users/get/...`) maps directly to your AST via your positional node store. This gives you the exact line and column for free.

---

## Layer 2: Error Enrichment Pipeline

Raw validator errors go through an enrichment pipeline before becoming LSP diagnostics:

```go
type ErrorEnricher interface {
    // Can this enricher improve this error?
    Matches(err *RawValidationError) bool
    Enrich(err *RawValidationError, ctx *EnrichmentContext) *LSPValidationError
}
```

You register enrichers for known patterns:

**Typo/fuzzy match enricher** — when a key fails `enum` or `const` validation, run Levenshtein against valid values and suggest the closest match. This is where "did you mean `integer`?" comes from.

**Discriminator enricher** — OpenAPI `discriminator` failures are notoriously cryptic from a raw validator. Detect them by schema path pattern and emit a human-readable message explaining which discriminator mapping failed and why.

**`$ref` context enricher** — when an error occurs inside a `$ref`-resolved schema, add a `RelatedInformation` entry pointing to the `$ref` definition site. The user sees both where the error is and where the schema that caused it came from.

**Missing required key enricher** — instead of "required property 'x' missing", point the diagnostic at the parent object's opening brace and offer a code action that inserts the missing key with a placeholder value.

**Type mismatch enricher** — when `type` fails, inspect the actual value and give a targeted message. Got a string where a number is expected? Say so explicitly and include the value.

---

## Layer 3: Your Zod-Exported Schemas as First-Class Validators

This is actually a really clean fit. Since you already have JSON Schema files exported from Zod, you can load them directly into the compiler as custom vocabularies or overlay validators:

```go
func (c *Compiler) LoadCustomSchemas(paths []string) error {
    for _, p := range paths {
        raw, err := os.ReadFile(p)
        // ...
        schema, err := c.CompileBytes(raw)
        c.RegisterOverlay(schema)
    }
}
```

**Overlay validation** means: after the core OpenAPI schema validates a node, run your custom schema against the same node and merge the results. This lets you enforce org-specific rules (required `x-` extensions, naming conventions, mandatory description fields, allowed formats) without forking the core OpenAPI schema.

```go
type ValidationPipeline struct {
    Core      *jsonschema.Schema  // OpenAPI 3.1 spec schema
    Overlays  []*jsonschema.Schema // your Zod-exported schemas
    Enrichers []ErrorEnricher
}

func (p *ValidationPipeline) Validate(node *AnnotatedInstance) []LSPValidationError {
    var raw []RawValidationError
    raw = append(raw, p.Core.Validate(node)...)
    for _, overlay := range p.Overlays {
        raw = append(raw, overlay.Validate(node)...)
    }
    return p.enrich(raw, node)
}
```

This is significantly better than what most teams get — your institutional schema rules become LSP diagnostics automatically, and when you update a Zod schema and re-export, the LSP picks it up on next restart with zero other changes.

---

## Annotation Collection for Hover

One underused feature of `santhosh-tekuri/jsonschema` is annotation collection. During validation, the schema emits annotations (`title`, `description`, `default`, `examples`, `deprecated`) alongside errors. You can harvest these to power hover content:

```go
// When user hovers over a field, you have:
// 1. The field's value (from AST)
// 2. The schema annotations collected during validation for that instance path
// → Render title + description as hover markdown
// → Show default value
// → Show examples
// → Show deprecation warning with migration note if deprecated: true
```

This means hover content is essentially free once validation is running — you're not doing extra work, just surfacing what the validator already computed.

---

## What the Full Output Looks Like

With all of this in place, a single mistyped field gets you:

- Squiggly at the exact token, not the whole line
- Message: `"strnig" is not a valid JSON Schema type. Did you mean "string"?`
- Related info pointing to the schema definition if it came through a `$ref`
- Code action: "Replace with 'string'"
- Hover on the error: shows the full `type` keyword documentation from the JSON Schema spec

That's a genuinely great developer experience, and it's all built on `santhosh-tekuri/jsonschema` + your enrichment layer + your positional AST. No magic, just careful composition.