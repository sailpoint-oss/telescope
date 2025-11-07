# 1) Monorepo layout (Bun workspaces)

```txt
telescope-openapi-lint/
├─ package.json                     # "workspaces": ["packages/*"]
├─ bunfig.toml
├─ tsconfig.base.json
└─ packages/
   ├─ types-openapi/                # shared TS atoms for Swagger 2.0, OAS 3.0/3.1/3.2
   ├─ loader/                       # parse YAML/JSON -> AST+CST, URI resolver, source maps
   ├─ graph/                        # $ref graph, virtual FS, incremental dep tracking
   ├─ indexer/                      # build registries: paths, opIds, components, params, etc.
   ├─ engine/                       # the linter core (rule runner + selector/visitor + fixers)
   ├─ rules/                        # rule packs (recommended, style, best-practices, versioned)
   ├─ formatters/                   # stylish, json, sarif
   ├─ config/                       # presets, schema for config, default severities
   ├─ cli/                          # thin wrapper over engine; same host as LSP with Node FS
   └─ vscode/                       # LSP server + VS Code client (client is tiny)
```

You originally had 5 packages; this keeps that spirit but extracts **loader/graph/indexer** so rules never worry about IO or JSON/YAML details. Those three layers unlock cross-file context and make LSP incremental updates cheap.

---

# 2) Data pipeline (the heart of cross-file context)

Think in **four phases**. Each phase outputs stable, typed data structures that the next phase consumes. Both CLI and LSP run the same phases; the LSP just runs them incrementally.

## Phase A — Loader (parse + source maps)

**Input:** URIs (file://, http(s)://), raw text
**Output:** `ParsedDoc` with:

- `uri: string`
- `format: "yaml" | "json"`
- `ast: any` (lossless JSON-ish AST)
- `cst: any` (only if you need exact YAML token trivia)
- `sourceMap: Map<JsonPointer, Range>` (start/end positions)
- `version: "2.0" | "3.0" | "3.1" | "3.2" | "unknown"`

Notes:

- Keep YAML anchors/aliases resolved **in the AST** but retain CST positions.
- Detect the OpenAPI/Swagger version early (look at `openapi`/`swagger`).
- No $ref resolution here—just parse and build source maps.

## Phase B — Graph (build the $ref dependency graph)

**Input:** set of `ParsedDoc`s from a workspace “entrypoint” or single file
**Output:** `RefGraph`

- Nodes are `(uri, jsonPointer)` pairs.
- Edges are `$ref` links (outgoing from the referencing site).
- Reverse edges (who references me?) for incremental invalidation.
- Cycles tracked explicitly (to report and to avoid infinite resolve).

Provide a **Resolver** with lazy resolution:

```ts
interface Resolver {
  // Resolve the target node; returns a proxy that remembers origin + target
  deref<T = unknown>(
    originUri: string,
    originPtr: string,
    ref: string
  ): Resolved<T>;
  // Translate any "resolved proxy" back to its definition location (uri, ptr)
  originOf(node: unknown): { uri: string; ptr: string } | null;
}
```

**Virtual FS Host** abstraction:

- CLI host uses Node fs + fetch.
- LSP host uses VS Code’s `TextDocuments` for dirty files first, then disk.
- Same interface: `read(uri)`, `stat(uri)`, `glob(pattern)`, `watch(...)`.
- Add a content-hash cache (fast no-op when content unchanged).

## Phase C — Indexer (fast lookups for rules)

**Input:** `ParsedDoc`s + `RefGraph` + `Resolver`
**Output:** `ProjectIndex`

- `pathsByString: Map<string, PathItemRef[]>`
- `pathItemsToPathStrings: MultiMap<(uri,ptr)=>string>` (reverse lookup you’ll need constantly)
- `opsByOperationId: Map<string, OperationRef[]>`
- `components: { schemas, responses, parameters, headers, examples, requestBodies, securitySchemes, links, callbacks }` as string→Ref maps
- `schemasByRef: Map<string, SchemaRef>` (for quick `$ref` existence/type checks)
- `servers, tags, webhooks` indexes as needed
- `version: "2.0" | "3.0" | "3.1" | "3.2"`

The key trick for your `$ref`-split **PathItem**:
`pathItemsToPathStrings` lets a rule that visits a `PathItem` (possibly in a different file) still ask: “What path strings (e.g. `/pets/{id}`) include _this_ PathItem reference?” and get **all** owners.

## Phase D — Engine (selector/visitor + diagnostics + fixes)

**Input:** `ProjectIndex` + `Resolver` + config + rules
**Output:** diagnostics + code actions/fixes

- Traverse using **selectors** (like ESLint) or typed **visitors**.

- Provide a `Context` object with everything rules may need:

  ```ts
  interface RuleContext {
    project: {
      version: OASVersion;
      index: ProjectIndex;
      resolver: Resolver;
      graph: RefGraph;
    };
    file: { uri: string; ast: unknown; sourceMap: SourceMap };
    // nav
    getPathStringsForPathItem(uri: string, ptr: string): string[];
    getOperationsForPathItem(uri: string, ptr: string): OperationRef[];
    // reporting
    report(diag: Diagnostic): void;
    // fixes (JSON Patch with file awareness)
    fix(patch: JsonPatch | JsonPatch[]): void;
    // utilities
    jsonPointerAt(range: Range): string | null;
    locate(uri: string, ptr: string): Range | null; // resolves through source maps
  }
  ```

- **Blame strategy** (where to put the diagnostic range):

  - Some rules should blame the **referencing site** (the `$ref` location).
  - Others should blame the **definition site** (the referenced file).
  - Let rules choose via `diag.blamedLocation = "refSite" | "defSite" | "both"`.

- **Auto-fix** is done with **file-aware JSON Patch**:

  ```ts
  type FilePatch = {
    uri: string;
    ops: { op: "add" | "remove" | "replace"; path: string; value?: any }[];
  };
  ```

---

# 3) Rule API that scales (and runs the same in LSP + CLI)

### Rule definition

```ts
export interface RuleMeta {
  id: string; // "path-params-match"
  docs: {
    description: string;
    recommended: boolean;
    url?: string;
  };
  schema?: unknown; // JSON Schema for rule options
  type: "problem" | "suggestion" | "layout";
  fixable?: boolean;
  oas?: ("2.0" | "3.0" | "3.1" | "3.2")[]; // which versions apply
}

export interface Rule {
  meta: RuleMeta;
  // ESLint-like factory: receive context that abstracts the world
  create(ctx: RuleContext): Visitors;
}

export type Visitors = {
  // You can expose many hooks; keep them stable & typed
  Document?: (node: DocumentRef) => void;
  PathItem?: (node: PathItemRef) => void;
  Operation?: (node: OperationRef) => void;
  Component?: (node: ComponentRef) => void;
  Schema?: (node: SchemaRef) => void;
  // ... add granular hooks as needed (Parameter, Response, etc.)
};
```

Under the hood, the engine schedules visitors by walking the unresolved ASTs but hands you **resolved helpers** via `ctx.project` and `ctx.get*()` functions. Rules never fetch files or chase $refs themselves.

### Example rule: path params must match param declarations (cross-file)

```ts
export const pathParamsMatch: Rule = {
  meta: {
    id: "path-params-match",
    type: "problem",
    fixable: true,
    docs: {
      description: "Path template params must be declared in operations",
      recommended: true,
    },
    oas: ["2.0", "3.0", "3.1", "3.2"],
  },
  create(ctx) {
    return {
      PathItem({ uri, ptr, node }) {
        // Which path strings own this path item (even if $ref’d)?
        const owners = ctx.getPathStringsForPathItem(uri, ptr); // e.g. ["/pets/{id}"]
        if (!owners.length) return;

        const ops = ctx.getOperationsForPathItem(uri, ptr);
        for (const op of ops) {
          const templateParams = extractParamsFromPathStrings(owners); // {id}
          const declared = collectPathLevelAndOpLevelParams(
            op,
            ctx.project.resolver
          ); // list of {name,in}

          for (const name of templateParams) {
            const has = declared.some(
              (p) => p.in === "path" && p.name === name
            );
            if (!has) {
              ctx.report({
                ruleId: "path-params-match",
                message: `Path parameter "{${name}}" is not declared in ${op.method.toUpperCase()} operation.`,
                // blame the operation site
                location: ctx.locate(op.uri, op.ptr) ?? {
                  uri: op.uri,
                  range: { start: 0, end: 0 },
                },
                severity: "error",
                suggest: [
                  {
                    title: `Add path parameter "${name}"`,
                    fix: addMissingPathParamPatch(op), // returns FilePatch
                  },
                ],
              });
            }
          }
        }
      },
    };
  },
};
```

This works **even if the PathItem is in a separate file** and referenced via `$ref`, because `ctx.getPathStringsForPathItem` and `ctx.getOperationsForPathItem` come from the **Indexer** which knows reverse ownership.

### Running modes

- **Project-aware** (default): you specify entrypoints (or we auto-discover `openapi.*` files). Builds graph + index across the workspace. All rules have full context.

- **Single-file quick lint** (fragment mode): the engine still builds a **mini graph**:

  - the current file (dirty buffer)
  - 0..N “neighbor” documents (from last project index or nearest entrypoint)
  - Reverse index lets us answer “who owns this PathItem?” from cached info
    This makes “open a component.yaml and still see real diagnostics” work in LSP.

---

# 4) Adapters: LSP & CLI use the same core

## LSP (VS Code)

- Server hosts the **same** engine with an **LspHost** FS (dirty buffers first).
- Watchers: onDidOpen/Change/Save/Close → update DocStore → invalidate RefGraph nodes → re-index only what changed → re-run engine for affected files (use reverse edges to find dependents).
- Publish diagnostics with rich related locations (e.g., definition site and ref site).
- CodeActions: convert `FilePatch` → `WorkspaceEdit`.
- Extra: a `telescope.openapi/showGraph` custom request to visualize the `$ref` dependency graph (nice for debugging).
- Settings:

  - `telescope.openapi.entrypoints` (globs)
  - `telescope.openapi.versionOverride` (rare)
  - `telescope.openapi.rules` (per-workspace overrides)
  - `telescope.openapi.maxWorkers` (parallelism)

## CLI

Commands (thin wrappers over engine):

```
telescope-lint lint [paths...]         # project-aware by default
telescope-lint fix [paths...]
telescope-lint graph [paths...]        # print/emit graph (dot/json)
telescope-lint list-rules
telescope-lint explain <ruleId>
```

Flags:

- `--format stylish|json|sarif`
- `--config telescope-lint.config.{js,json,yml}`
- `--entrypoint openapi.yaml` (repeatable)
- `--max-workers N`
- `--cache` (`.telescope-lint/` with content hashes)

Formatters:

- **stylish** for humans
- **json** for machines
- **sarif** for GitHub code scanning

---

## Config model

`telescope-lint.config.ts`

```ts
import { defineConfig } from "@telescope-openapi/config";

export default defineConfig({
  entrypoints: ["openapi.yaml", "apis/**/openapi.yaml"],
  extends: ["@telescope-openapi/config/recommended-3.1"],
  rules: {
    "path-params-match": "error",
    "operationid-unique": ["error", { scope: "workspace" }],
    "no-unused-components": "warn",
    // per-file overrides
    overrides: [
      {
        files: ["**/examples/**"],
        rules: { "operationid-unique": "off" },
      },
    ],
  },
});
```

- `extends` presets per OAS version (2.0/3.0/3.1/3.2).
- Rule options validated via each rule’s JSON Schema.

---

## Testing & fixtures (critical for confidence)

- **VirtualFS test harness**: load multiple files by URI string → engine → diagnostics snapshot.
- Fixture sets:

  - `multifile-pathitem/` (root has `/pets/{id}`; PathItem in `paths/pets-id.yaml`)
  - `components-ref-cycle/`
  - `opid-duplicate-cross-package/`
  - `3.0-vs-3.1-schema-dialect/`

- Unit tests per rule + integration tests per preset.
- Golden tests for **source map accuracy**: ensure reported locations match expected line/column in the right file.
- Performance tests for large repos (cache hits, incremental invalidations).

---

## What to draw in Excalidraw (labels to copy)

- **Box:** Virtual FS Host
  _Adapters:_ Node FS (CLI), VS Code TextDocuments (LSP), HTTP fetch
- **Arrow →** **Box:** Loader (YAML/JSON parser + source maps)
- **Arrow →** **Box:** RefGraph (nodes: (uri,ptr); edges: $ref; reverse edges; cycles)
- **Arrow →** **Box:** Indexer (paths/opIds/components/… + reverse lookups)
- **Arrow →** **Box:** Engine (rule runner)

  - **Inside:** RuleContext (project, locate, report, fix)
  - **Inside:** Visitors (Document/PathItem/Operation/Schema/Component…)

- **Arrows out →** **Boxes:**

  - LSP Adapter (publishDiagnostics, CodeActions)
  - CLI Adapter (formatters, exit code, --fix)

- **Side note:** Cache (content hash → parsed doc, index shards)
- **Side note:** Config (presets, overrides, severities)

---

## A few high-value rules to start (that leverage cross-file context)

- **`operationid-unique`** across the workspace (reverse index lets this be fast).
- **`path-params-match`** (mismatch between `/foo/{id}` and declared parameters).
- **`no-orphan-components`** (component never referenced anywhere).
- **`response-example-validates`** (example payload validates against schema; 3.1 uses JSON Schema 2020-12; 3.0 uses OAS Schema subset).
- **`security-schemes-used`** (declared but unused / referenced but undefined).
- **`server-variables-resolved`** (variables referenced actually exist).
- **`disallow-remote-http-refs`** (policy rule to block `http:` refs).

---

## Implementation nudges

- **Don’t fully deref** docs globally. Use **lazy proxies** + indexes; keep file boundaries intact so fixes are file-aware.
- **Always return ranges** via the source map from the **blamed** site (def or ref).
- **Incremental LSP**: reparse only dirty docs; walk reverse edges to find dependents to re-index + re-lint.
- **Schema validation**:

  - OAS 3.1: Ajv (2020-12) works for `schema` objects.
  - OAS 3.0: validate with an OAS-aware validator (or small internal subset) rather than raw JSON Schema.

- Output **SARIF** early; it unlocks CI/code-scanning stories for free.
