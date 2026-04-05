# LSP Core Features Bug Review

Review of all core LSP handlers in `server/lsp/` for bugs, edge cases, and inconsistencies.

---

## Critical Bugs

### 1. `componentDefinitionLoc` missing requestBodies, headers, links, examples

**File:** `server/lsp/rename.go` (shared by references, document_highlights, call_hierarchy)

**Problem:** `componentDefinitionLoc` only handles `schemas`, `parameters`, `responses`, `securitySchemes`. The handlers iterate `componentKinds` which includes `requestBodies`, `headers`, `links`, and `examples`, but `componentDefinitionLoc` returns an empty range for these.

**Impact:**
- **Find References** with `IncludeDeclaration`: definition location is never added for requestBodies/headers/links/examples
- **Rename**: the component name key in `components/requestBodies/Foo` (etc.) is never renamed—only `$ref` usages are updated
- **Document Highlight**: definition is never highlighted
- **Prepare Call Hierarchy**: returns empty definition range

**Fix:** Add cases to `componentDefinitionLoc` that read from `idx.Document.Components`:

```go
case "requestBodies":
    if rb, ok := idx.Document.Components.RequestBodies[name]; ok {
        return rb.NameLoc.Range
    }
case "headers":
    if h, ok := idx.Document.Components.Headers[name]; ok {
        return h.NameLoc.Range
    }
case "links":
    if l, ok := idx.Document.Components.Links[name]; ok {
        return l.NameLoc.Range
    }
case "examples":
    if ex, ok := idx.Document.Components.Examples[name]; ok {
        return ex.NameLoc.Range
    }
```

---

### 2. `componentDefinitionLoc` uses wrong Loc for responses and securitySchemes

**File:** `server/lsp/rename.go`

**Problem:** For consistency with schemas/parameters (which use `NameLoc` for the component key), `responses` and `securitySchemes` should use `NameLoc` when available. Currently:
- `responses`: uses `r.Loc.Range` (whole response object)
- `securitySchemes`: uses `ss.Loc.Range` (whole scheme object)

**Impact:** Definition/rename/highlight ranges may span the entire component block instead of just the name key.

**Fix:** Use `LocOrFallback(r.NameLoc, r.Loc)` for responses and `LocOrFallback(ss.NameLoc, ss.Loc)` for securitySchemes.

---

### 3. Semantic tokens: path param offset uses byte index as character

**File:** `server/lsp/semantic_tokens.go` (lines 87–94)

**Problem:** `pathParamRe.FindAllStringIndex(pathStr, -1)` returns byte offsets. These are added to `item.PathLoc.Range.Start.Character`, which is UTF-16. For paths with non-ASCII (e.g. `/café/{id}`), the token position is wrong.

**Fix:** Convert byte offsets to UTF-16 character offsets before adding to `Start.Character`, or use a UTF-16-aware helper.

---

### 4. Semantic tokens: schema name length uses byte count

**File:** `server/lsp/semantic_tokens.go` (line 139)

**Problem:** `length: uint32(len(name))` uses byte length. LSP semantic token `length` is in UTF-16 code units. Schema names with non-ASCII will have wrong length.

**Fix:** Use `rangeLen` or a UTF-16 length helper for the schema name token.

---

### 5. Linked editing: operationId misses inline response links

**File:** `server/lsp/linked_editing.go` (lines 72–88)

**Problem:** operationId linked editing only checks `idx.Document.Components.Links`. It does not check `operation.Responses[code].Links` (inline response links). Response links can reference operations via `operationId`.

**Fix:** Also iterate `op.Responses` → `resp.Links` and add ranges for links where `link.OperationID == cleanWord`.

---

### 6. Document highlights: $ref logic is O(n²) and could be simplified

**File:** `server/lsp/document_highlights.go` (lines 47–71)

**Problem:** The code iterates `idx.AllRefs`, then for each ref scans `idx.Refs` to find the matching target. This is redundant—`idx.RefsTo(refTarget)` already returns the usages for a given target.

**Fix:** Replace with:

```go
refTarget := cleanWord
if refTarget == "" || refTarget == "$ref" {
    refTarget = extractRefFromLine(line)
}
if refTarget != "" {
    for _, usage := range idx.RefsTo(refTarget) {
        if usage.URI == uri {
            highlights = append(highlights, protocol.DocumentHighlight{
                Range: usage.Loc.Range,
                Kind:  highlightRead,
            })
        }
    }
    if len(highlights) > 0 {
        return highlights, nil
    }
}
```

---

## Medium / Edge Cases

### 7. References: operationId in response links not searched

**File:** `server/lsp/references.go`, `server/lsp/rename.go`

**Problem:** operationId references are collected from `mo.Operation.Responses` → `link.Links`. But `mo.Operation.Responses` is `map[string]*Response`; each `*Response` has `Links map[string]*Link`. The code correctly iterates `for _, link := range mo.Operation.Responses` and then `for _, l := range link.Links`. So it does cover response links. **Re-check:** `link` is `*Response`, and `link.Links` is the response’s links. Correct.

---

### 8. Type definition: no cross-file resolution

**File:** `server/lsp/type_definition.go`

**Problem:** `resolveSchemaRef` only resolves within the current index. Cross-file `$ref` (e.g. `./other.yaml#/components/schemas/Foo`) will not resolve. Definition handler uses `resolveWithProject` for cross-file; type definition does not.

**Impact:** Go-to-type-definition fails for external schema refs.

**Fix:** Use project resolver for cross-file schema refs, similar to definition handler.

---

### 9. `rangeForWord` heuristic can misplace range

**File:** `server/lsp/rename.go`

**Problem:** `rangeForWord` assumes the word is centered around the cursor: `start = max(0, pos.Character - half)`. If the cursor is at the end of the word, the computed range can extend past the actual word (e.g. word `Pet` at chars 0–3, cursor at 3 → range [2, 5]).

**Impact:** PrepareRename may show an incorrect highlight. Rename itself uses `Loc` from the model for edits, so rename behavior may still be correct when the definition is found.

**Mitigation:** Prefer using the actual source range from the document (e.g. via `document` position helpers) when available, instead of this heuristic.

---

## Minor / Consistency

### 10. Linked editing: $ref filter `usage.URI == uri`

**File:** `server/lsp/linked_editing.go` (line 42)

**Note:** For a single-document index, all `RefUsage` share the same URI. The filter is correct but could be omitted if the index is always single-document for this handler.

---

### 11. Completion: operation template typo

**File:** `server/lsp/completion.go` (line 341)

**Note:** Snippet uses `$$ref` to produce literal `$ref`. In LSP snippet format, `$$` escapes to `$`, so this is correct.

---

## Summary Table

| # | Severity | Handler(s) | Issue |
|---|----------|------------|-------|
| 1 | Critical | references, rename, document_highlights, call_hierarchy | `componentDefinitionLoc` missing requestBodies/headers/links/examples |
| 2 | Medium | same | responses/securitySchemes should use NameLoc |
| 3 | Critical | semantic_tokens | Path param offset: byte vs UTF-16 |
| 4 | Critical | semantic_tokens | Schema name length: byte vs UTF-16 |
| 5 | Medium | linked_editing | operationId: missing inline response links |
| 6 | Low | document_highlights | $ref logic can be simplified |
| 8 | Medium | type_definition | No cross-file schema resolution |
| 9 | Low | rename (prepareRename) | rangeForWord heuristic can misplace range |
