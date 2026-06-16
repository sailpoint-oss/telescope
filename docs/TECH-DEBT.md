# Technical Debt Tracker

Actionable backlog for maintainers. For full narrative on LSP handler issues, see [LSP-BUG-REVIEW.md](LSP-BUG-REVIEW.md). For V2 architecture context, see [ARCHITECTURE.md](ARCHITECTURE.md) § LSP Ownership.

## V2 graph migration

The LSP uses `WorkspaceGraph` as the structural source of truth. Remaining transition work:

| Item | Status | Location | Notes |
|------|--------|----------|-------|
| Document lifecycle (open/change/close) | Done | `GraphBridge`, `WorkspaceGraph` | Open buffers use `SyntheticSource`; watched files use `FilesystemSource` |
| Pipeline stages (parse/lint/bind/analyze) | Done | `PipelineRunner`, `SnapshotManager` | Same topology as SDK |
| Cross-file `$ref` edges | Done | `BindStage` on `WorkspaceGraph` | Edges from bind pass, not mirrored IndexCache |
| Legacy typed handler reads | In progress | `openapi.IndexCache` | Projection cache populated from graph parse results |
| Analyzer resolver input | Done | Graph-backed resolver adapter | `AnalysisData.Resolver` uses graph-backed resolution |
| Workspace startup diagnostics | Done | `project.Manager` | Seeds graph first, reuses graph-backed resolver |
| Handler migration off IndexCache | Open | `server/lsp/*.go` | Handlers still read typed index via projection; migrate to graph/snapshot APIs where practical |
| Document targeting gate | Done | `server/lsp/target.go` | Shared `TargetDeps` for diagnostics and LSP handlers |

## LSP handler bugs

Track fixes against [LSP-BUG-REVIEW.md](LSP-BUG-REVIEW.md). Summary:

### Critical

| ID | Handler(s) | Issue | File |
|----|------------|-------|------|
| 1 | references, rename, document_highlights, call_hierarchy | `componentDefinitionLoc` missing requestBodies, headers, links, examples | `server/lsp/rename.go` |
| 3 | semantic_tokens | Path param offset uses byte index as UTF-16 character | `server/lsp/semantic_tokens.go` |
| 4 | semantic_tokens | Schema name length uses byte count instead of UTF-16 | `server/lsp/semantic_tokens.go` |

### Medium

| ID | Handler(s) | Issue | File |
|----|------------|-------|------|
| 2 | references, rename, document_highlights, call_hierarchy | responses/securitySchemes should use `NameLoc` | `server/lsp/rename.go` |
| 5 | linked_editing | operationId misses inline response links | `server/lsp/linked_editing.go` |
| 8 | type_definition | No cross-file schema resolution | `server/lsp/type_definition.go` |

### Low

| ID | Handler(s) | Issue | File |
|----|------------|-------|------|
| 6 | document_highlights | `$ref` logic is O(n²); use `idx.RefsTo` | `server/lsp/document_highlights.go` |
| 9 | rename (prepareRename) | `rangeForWord` heuristic can misplace range | `server/lsp/rename.go` |

### Verified non-issues

| ID | Notes |
|----|-------|
| 7 | References correctly iterate response links — re-check confirmed OK |
| 10 | Linked editing URI filter — cosmetic |
| 11 | Completion `$$ref` snippet — correct LSP escaping |

## Documentation debt

| Item | Notes |
|------|-------|
| Dual architecture docs | Unified in [ARCHITECTURE.md](ARCHITECTURE.md); root [ARCHITECTURE.md](../ARCHITECTURE.md) is a pointer stub |
| Maintainer roster | Template in [MAINTAINER-GUIDE.md](MAINTAINER-GUIDE.md); fill when team confirmed |
| CODEOWNERS | Template in [.github/CODEOWNERS](../.github/CODEOWNERS); replace placeholders |

## How to use this file

1. When fixing an LSP bug from the review, check off the row and link the PR
2. When completing a migration item, update Status and Notes
3. Add new debt items with file references; keep [LSP-BUG-REVIEW.md](LSP-BUG-REVIEW.md) for detailed analysis
