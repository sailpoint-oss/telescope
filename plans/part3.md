# Telescope OpenAPI Lint — Design Document

**Audience:** maintainers/contributors
**Status:** Draft (implementation-ready)
**Scope:** Core engine, cross-file context ($ref), rule API, VS Code LSP adapter, CLI, config, testing, performance.

---

## 0) TL;DR (high-level)

- **One core** (engine + loader + graph + index) used by **both** CLI and VS Code LSP.
- **Four-phase pipeline:** Parse → RefGraph → Index → Lint.
- **Rules are pure:** no I/O, no `$ref` chasing—use helpers from `RuleContext`.
- **Cross-file context** solved by:

  - `$ref` **graph** with reverse edges & cycle detection,
  - **indexers** that provide reverse lookups like `pathItemsToPathStrings`,
  - **file-aware** diagnostics & JSON-Patch fixes.

- **Incremental LSP:** change only the dirty doc + dependents via reverse edges.
- **Config** supports presets, per-version bundles, overrides, and SARIF output.

---

## 1) Goals & Non-Goals

### Goals

- Provide a **project-aware** OpenAPI linter that understands multi-file `$ref`.
- Run identically in **CLI** and **VS Code** (LSP) with **shared core**.
- Deliver actionable **diagnostics** with accurate **locations** and **fixes**.
- Maintain **performance** on large projects through caching & incremental recompute.
- Offer a **stable Rule API** for rule authors with strong TypeScript types.

### Non-Goals

- Not a full dereferencer that emits a single merged doc (we keep file boundaries).
- Not an API mocking/validation server (focus is static linting).
- Not a style formatter (we may offer simple fixers; formatting is separate).

---

## 2) Monorepo Topology (Bun workspaces)

```txt
telescope-openapi-lint/
├─ package.json                     # workspaces + scripts
├─ bunfig.toml
├─ tsconfig.base.json
└─ packages/
   ├─ types-openapi/                # OAS atoms/types (2.0, 3.0, 3.1, 3.2)
   ├─ host/                         # VirtualFS & caching host (Node, LSP, HTTP)
   ├─ loader/                       # YAML/JSON parse, version detect, source maps
   ├─ graph/                        # $ref graph, reverse deps, cycles
   ├─ indexer/                      # paths/ops/components indexes + reverse lookups
   ├─ engine/                       # rule engine (RuleContext, traversal, fixes)
   ├─ rules/                        # rule packs (recommended, style, policies)
   ├─ config/                       # config schema + loader + presets
   ├─ formatters/                   # stylish, json, sarif
   ├─ cli/                          # thin CLI wrapper
   └─ vscode/                       # LSP server + VS Code client
```

**Why split `host/loader/graph/indexer`?**
Rules never do IO or parse—this split keeps them pure and lets you optimize each layer independently (esp. incremental LSP rebuilds).

---

## 3) Architecture & Data Flow

```mermaid
flowchart LR
  subgraph Host[Virtual FS Host]
    A1[Node FS (CLI)]
    A2[VS Code TextDocuments (LSP)]
    A3[HTTP Fetch (optional)]
    A4[Content Hash Cache]
  end

  Host --> B[Loader\n(YAML/JSON parser + SourceMaps + Version detect)]
  B --> C[RefGraph\n($ref edges + reverse deps + cycles)]
  C --> D[Indexers\n(paths, ops, components, reverse lookups)]
  D --> E[Engine\n(rule runner + visitors + file-aware fixes)]

  subgraph Consumers
    F[CLI]
    G[LSP Server]
  end

  E --> F
  E --> G

  subgraph Outputs
    H[Diagnostics\n(stylish/json/sarif)]
    I[WorkspaceEdit\n(CodeActions/Fixes)]
  end

  F --> H
  G --> H
  G --> I

  J[(Cache)] -. speeds up .-> B
  J -. incremental .-> C
  J -. shards .-> D
```

**Phase responsibilities**

- **Host:** abstracted file reads/watches, globbing, content hashing, URI normalization (file://, http(s)://).
- **Loader:** parse (YAML/JSON), build `SourceMap`, detect OAS version; **no `$ref` resolution** here.
- **Graph:** construct `$ref` dependency graph nodes `(uri, ptr)` with edges & **reverse edges**; detect cycles.
- **Indexer:** compute fast lookups (e.g., `pathItemsToPathStrings`, `operationsByOwner`, components maps).
- **Engine:** run rules with a `RuleContext` that exposes project/index helpers; produce diagnostics/fixes.

---

## 4) Core Types: Rule API (engine)

> You can paste these directly as `packages/engine/src/types.ts`.

```ts
// packages/engine/src/types.ts
export type OASVersion = "2.0" | "3.0" | "3.1" | "3.2";
export interface Position {
  line: number;
  character: number;
}
export interface Range {
  start: Position;
  end: Position;
}
export type JsonPointer = string;

export interface Diagnostic {
  ruleId: string;
  message: string;
  uri: string;
  range: Range;
  severity: "error" | "warning" | "info";
  related?: { uri: string; range: Range; message?: string }[];
  suggest?: Array<{ title: string; fix: FilePatch | FilePatch[] }>;
}

export interface FilePatch {
  uri: string;
  ops: Array<
    | { op: "add"; path: JsonPointer; value: unknown }
    | { op: "remove"; path: JsonPointer }
    | { op: "replace"; path: JsonPointer; value: unknown }
  >;
}

export interface SourceMap {
  pointerToRange(ptr: JsonPointer): Range | null;
  rangeToPointer(range: Range): JsonPointer | null;
}

export interface ParsedDoc {
  uri: string;
  format: "yaml" | "json";
  ast: any;
  version: OASVersion | "unknown";
  sourceMap: SourceMap;
}

export interface RefGraph {
  // adjacency & reverse adjacency
  dependentsOf(
    uri: string,
    ptr?: JsonPointer
  ): Array<{ uri: string; ptr: JsonPointer }>;
  referencesFrom(
    uri: string,
    ptr: JsonPointer
  ): Array<{ uri: string; ptr: JsonPointer }>;
  hasCycleAt(uri: string, ptr: JsonPointer): boolean;
}

export interface Resolver {
  deref<T = unknown>(originUri: string, originPtr: JsonPointer, ref: string): T;
  originOf(node: unknown): { uri: string; ptr: JsonPointer } | null;
}

export interface PathItemRef {
  uri: string;
  ptr: JsonPointer;
  node: any;
}
export interface OperationRef extends PathItemRef {
  method:
    | "get"
    | "put"
    | "post"
    | "delete"
    | "options"
    | "head"
    | "patch"
    | "trace";
}
export interface SchemaRef {
  uri: string;
  ptr: JsonPointer;
  node: any;
}
export interface ComponentRef {
  uri: string;
  ptr: JsonPointer;
  node: any;
}

export interface ProjectIndex {
  version: OASVersion | "unknown";
  pathsByString: Map<string, PathItemRef[]>;
  pathItemsToPathStrings: Map<string, string[]>; // `${uri}#${ptr}` => ["/pets/{id}"]
  operationsByOwner: Map<string, OperationRef[]>; // key = `${uri}#${ptr}` of PathItem
  components: Record<string, Map<string, ComponentRef>>; // schemas/responses/...
}

export interface ProjectContext {
  graph: RefGraph;
  resolver: Resolver;
  index: ProjectIndex;
  docs: Map<string, ParsedDoc>;
  version: OASVersion | "unknown";
}

export interface RuleMeta {
  id: string;
  docs: { description: string; recommended: boolean; url?: string };
  schema?: unknown;
  type: "problem" | "suggestion" | "layout";
  fixable?: boolean;
  oas?: OASVersion[];
}

export interface RuleContext {
  project: ProjectContext;
  file: { uri: string; ast: unknown; sourceMap: SourceMap };

  // navigation helpers
  getPathStringsForPathItem(uri: string, ptr: JsonPointer): string[];
  getOperationsForPathItem(uri: string, ptr: JsonPointer): OperationRef[];

  // locations
  locate(uri: string, ptr: JsonPointer): Range | null;

  // reporting + fixes
  report(diag: Diagnostic): void;
  fix(patch: FilePatch | FilePatch[]): void;
}

export interface DocumentRef {
  uri: string;
  ptr: JsonPointer;
  node: any;
}

export type Visitors = {
  Document?: (node: DocumentRef) => void;
  PathItem?: (node: PathItemRef) => void;
  Operation?: (node: OperationRef) => void;
  Component?: (node: ComponentRef) => void;
  Schema?: (node: SchemaRef) => void;
};

export interface Rule {
  meta: RuleMeta;
  create(ctx: RuleContext): Visitors;
}

export const defineRule = (rule: Rule) => rule;
```

---

## 5) Virtual FS & Host Adapters

**Interface**

```ts
// packages/host/src/types.ts
export interface VfsHost {
  read(uri: string): Promise<{ text: string; mtimeMs: number; hash: string }>;
  exists(uri: string): Promise<boolean>;
  glob(patterns: string[]): Promise<string[]>;
  watch(uris: string[], onChange: (uri: string) => void): () => void; // unsubscribe
  resolve(fromUri: string, ref: string): string; // resolve URL/paths
}
```

**Implementations**

- **NodeHost** (CLI): reads from disk (and optionally HTTP), uses `fast-glob`, computes content hash (e.g., sha1).
- **LspHost** (LSP): prefers `TextDocuments` content for **dirty buffers**; falls back to disk; `watch` wires to LSP file events.

> Content hashes enable cheap no-op rebuilds when nothing changed.

---

## 6) Loader (Parse + SourceMaps + Version)

**Responsibilities**

- Detect **YAML vs JSON**.
- Parse into **JSON-like AST** (anchors resolved), keep CST where needed for accurate ranges.
- Build `SourceMap` mapping **JSON Pointers** ⇄ **text Ranges**.
- Detect **OAS version** (`openapi` or `swagger` field).

**Example shape**

```ts
// packages/loader/src/loader.ts
import {
  ParsedDoc,
  SourceMap,
  OASVersion,
} from "@telescope-openapi/engine/types";

export async function loadParsedDoc(
  host: VfsHost,
  uri: string
): Promise<ParsedDoc> {
  const { text } = await host.read(uri);
  const isYaml = /\.ya?ml$/i.test(uri) || /^[\s\-]*openapi:/.test(text);
  const { ast, sourceMap } = isYaml ? parseYaml(text) : parseJson(text);
  const version = detectVersion(ast);
  return { uri, format: isYaml ? "yaml" : "json", ast, version, sourceMap };
}

function parseYaml(text: string): { ast: any; sourceMap: SourceMap } {
  // Use a YAML parser with CST (e.g., yaml + yaml-cst). Build pointerToRange mapping.
  // Keep anchors resolved in AST but preserve token ranges for every node.
  return { ast: {}, sourceMap: makeSourceMap(/*...*/) };
}

function parseJson(text: string): { ast: any; sourceMap: SourceMap } {
  // Use a tolerant JSON parser (jsonc-parser) if you want comments; otherwise JSON.parse + custom map
  return { ast: JSON.parse(text), sourceMap: makeSourceMap(/*...*/) };
}

function detectVersion(ast: any): OASVersion | "unknown" {
  if (ast?.openapi?.startsWith?.("3.2")) return "3.2";
  if (ast?.openapi?.startsWith?.("3.1")) return "3.1";
  if (ast?.openapi?.startsWith?.("3.0")) return "3.0";
  if (ast?.swagger === "2.0") return "2.0";
  return "unknown";
}
```

**SourceMap notes**

- For YAML you’ll likely combine CST node offsets with a **pointer builder** while walking the AST.
- For JSON use a parser that exposes node ranges (e.g., `jsonc-parser`’s visitor).

---

## 7) RefGraph ($ref edges + reverse deps + cycles)

**Key concepts**

- Node identity = `(uri, ptr)`.
- Edge from **ref site** → **def site** (target of `$ref`).
- Maintain **reverse edges** to re-lint dependents on changes.
- **Resolver** provides deref + origin mapping using the graph.

**Example API**

```ts
// packages/graph/src/graph.ts
import {
  RefGraph,
  Resolver,
  JsonPointer,
} from "@telescope-openapi/engine/types";

export interface BuildGraphInput {
  docs: Map<string, ParsedDoc>;
  host: VfsHost;
}

export function buildRefGraph(input: BuildGraphInput): {
  graph: RefGraph;
  resolver: Resolver;
} {
  // Walk docs, find every $ref, resolve to target (uri, ptr), add edges
  // Detect cycles via DFS; mark nodes having cycles.
  // Resolver.deref returns lazy proxies (no global deep copy).
  return { graph: newGraph(), resolver: newResolver() };
}
```

**Resolver design**

- `deref(originUri, originPtr, ref)` resolves **URI + intra-doc pointer**.
- Returns a **proxy** object with `Symbol.for("origin")` metadata to enable `originOf(node)`.
- Do **not** deep-clone or merge entire documents; keep boundaries for accurate fixes.

---

## 8) Indexers (fast reverse lookups)

**Problem solved:** Rules need to quickly answer “which path strings own this PathItem (possibly `$ref`-ed)?” and “which operations are under this PathItem?” without walking the entire AST every time.

**Index build sketch**

```ts
// packages/indexer/src/index.ts
import {
  ProjectIndex,
  PathItemRef,
  OperationRef,
  ComponentRef,
  OASVersion,
} from "@telescope-openapi/engine/types";

export function buildIndex(args: {
  version: OASVersion | "unknown";
  docs: Map<string, ParsedDoc>;
  resolver: Resolver;
}): ProjectIndex {
  const pathsByString = new Map<string, PathItemRef[]>();
  const pathItemsToPathStrings = new Map<string, string[]>();
  const operationsByOwner = new Map<string, OperationRef[]>();
  const components: Record<string, Map<string, ComponentRef>> = {
    schemas: new Map(),
    responses: new Map(),
    parameters: new Map(),
    headers: new Map(),
    examples: new Map(),
    requestBodies: new Map(),
    securitySchemes: new Map(),
    links: new Map(),
    callbacks: new Map(),
  };

  // Walk all docs looking for: /paths, /components, /webhooks, etc.
  // For each PathItem at `${uri}#/paths/~1pets~1{id}`, index both directions.

  // PSEUDOCODE:
  // for (doc of docs) {
  //   for (pathString, pathItemPtr) in iteratePaths(doc.ast) {
  //     const ref: PathItemRef = { uri: doc.uri, ptr: pathItemPtr, node: get(doc.ast, pathItemPtr) };
  //     push(pathsByString, pathString, ref);
  //     push(pathItemsToPathStrings, key(ref), pathString);
  //     for (op of iterateOperations(ref)) push(operationsByOwner, key(ref), op);
  //   }
  //   for (comp of iterateComponents(doc.ast)) components[kind].set(name, comp);
  // }

  return {
    version: args.version,
    pathsByString,
    pathItemsToPathStrings,
    operationsByOwner,
    components,
  };
}

const key = (r: { uri: string; ptr: string }) => `${r.uri}#${r.ptr}`;
```

---

## 9) Engine Runner

```ts
// packages/engine/src/engine.ts
import {
  Rule,
  RuleContext,
  Visitors,
  ProjectContext,
  Diagnostic,
  FilePatch,
  JsonPointer,
} from "./types";

export interface RunOptions {
  rules: Rule[];
}
export interface RunResult {
  diagnostics: Diagnostic[];
  fixes: FilePatch[];
}

export function createRuleContext(
  project: ProjectContext,
  fileUri: string,
  reportSink: Diagnostic[],
  fixSink: FilePatch[]
): RuleContext {
  const doc = project.docs.get(fileUri)!;
  return {
    project,
    file: { uri: fileUri, ast: doc.ast, sourceMap: doc.sourceMap },
    getPathStringsForPathItem: (uri, ptr) =>
      project.index.pathItemsToPathStrings.get(`${uri}#${ptr}`) ?? [],
    getOperationsForPathItem: (uri, ptr) =>
      project.index.operationsByOwner.get(`${uri}#${ptr}`) ?? [],
    locate: (uri, ptr) =>
      project.docs.get(uri)?.sourceMap.pointerToRange(ptr) ?? null,
    report: (d) => reportSink.push(d),
    fix: (p) => {
      Array.isArray(p) ? fixSink.push(...p) : fixSink.push(p);
    },
  };
}

export function runEngine(
  project: ProjectContext,
  files: string[],
  opts: RunOptions
): RunResult {
  const diagnostics: Diagnostic[] = [];
  const fixes: FilePatch[] = [];
  const visitorSets = new Map<string, Visitors[]>();

  for (const fileUri of files) {
    const ctx = createRuleContext(project, fileUri, diagnostics, fixes);
    const visitors = opts.rules.map((r) => r.create(ctx));
    visitorSets.set(fileUri, visitors);
  }

  // Traversal strategy:
  // Use index to call visitors deterministically without walking every node.
  for (const fileUri of files) {
    dispatchAll(visitorSets.get(fileUri)!, "Document", {
      uri: fileUri,
      ptr: "",
      node: project.docs.get(fileUri)?.ast,
    });

    for (const [
      key,
      pathStrings,
    ] of project.index.pathItemsToPathStrings.entries()) {
      const [uri, ptr] = key.split("#");
      if (uri !== fileUri) continue;
      const pathItemRef = { uri, ptr: ptr as JsonPointer, node: {} };
      dispatchAll(visitorSets.get(fileUri)!, "PathItem", pathItemRef);
      for (const op of project.index.operationsByOwner.get(key) ?? []) {
        dispatchAll(visitorSets.get(fileUri)!, "Operation", op);
      }
    }
  }

  return { diagnostics, fixes };

  function dispatchAll(vs: Visitors[], kind: keyof Visitors, payload: any) {
    for (const v of vs) (v[kind] as any)?.(payload);
  }
}
```

---

## 10) Rule Examples

### 10.1 Cross-file: path template params must be declared

```ts
// packages/rules/src/path-params-match.ts
import {
  defineRule,
  Rule,
  FilePatch,
  OperationRef,
  RuleContext,
} from "@telescope-openapi/engine/types";

function extractTemplateParams(paths: string[]): Set<string> {
  const set = new Set<string>();
  for (const p of paths)
    for (const m of p.matchAll(/\{([^}]+)\}/g)) set.add(m[1]);
  return set;
}

function collectDeclaredPathParams(
  op: OperationRef,
  ctx: RuleContext
): { name: string; in: string }[] {
  const params: { name: string; in: string }[] = [];

  // 1) Path-level parameters: `${pathItemPtr}/parameters`
  const pathItemPtr = op.ptr.split("/").slice(0, -1).join("/");
  const pathParamsPtr = `${pathItemPtr}/parameters`;
  const pathParams = getArray(ctx.project.docs.get(op.uri)?.ast, pathParamsPtr);
  for (const [i, p] of (pathParams ?? []).entries()) {
    const param = resolveParam(p, ctx, op.uri, `${pathParamsPtr}/${i}`);
    if (param) params.push(param);
  }

  // 2) Operation-level parameters: `${op.ptr}/parameters`
  const opParamsPtr = `${op.ptr}/parameters`;
  const opParams = getArray(ctx.project.docs.get(op.uri)?.ast, opParamsPtr);
  for (const [i, p] of (opParams ?? []).entries()) {
    const param = resolveParam(p, ctx, op.uri, `${opParamsPtr}/${i}`);
    if (param) params.push(param);
  }

  return params;

  function resolveParam(
    node: any,
    ctx: RuleContext,
    originUri: string,
    originPtr: string
  ) {
    if (node && typeof node === "object" && typeof node["$ref"] === "string") {
      const target = ctx.project.resolver.deref<any>(
        originUri,
        originPtr,
        node["$ref"]
      );
      return { name: target?.name, in: target?.in };
    }
    return { name: node?.name, in: node?.in };
  }
}

function addMissingParamPatch(op: OperationRef, name: string): FilePatch {
  return {
    uri: op.uri,
    ops: [
      {
        op: "add",
        path: `${op.ptr}/parameters/-`,
        value: { name, in: "path", required: true, schema: { type: "string" } },
      },
    ],
  };
}

function getArray(ast: any, ptr: string): any[] | null {
  const segs = ptr
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = ast;
  for (const s of segs) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[s];
  }
  return Array.isArray(cur) ? cur : null;
}

export default defineRule({
  meta: {
    id: "path-params-match",
    type: "problem",
    fixable: true,
    docs: {
      description:
        "Path template params must be declared as in:'path' parameters",
      recommended: true,
    },
    oas: ["2.0", "3.0", "3.1", "3.2"],
  },
  create(ctx) {
    return {
      PathItem({ uri, ptr }) {
        const owners = ctx.getPathStringsForPathItem(uri, ptr);
        if (!owners.length) return;

        const needed = extractTemplateParams(owners);
        if (!needed.size) return;

        for (const op of ctx.getOperationsForPathItem(uri, ptr)) {
          const declared = collectDeclaredPathParams(op, ctx);
          for (const name of needed) {
            const has = declared.some(
              (p) => p.in === "path" && p.name === name
            );
            if (!has) {
              const opRange = ctx.locate(op.uri, op.ptr)!;
              ctx.report({
                ruleId: "path-params-match",
                severity: "error",
                uri: op.uri,
                range: opRange,
                message: `Path parameter "{${name}}" is not declared for ${op.method.toUpperCase()} operation.`,
                suggest: [
                  {
                    title: `Add "{${name}}" parameter`,
                    fix: addMissingParamPatch(op, name),
                  },
                ],
              });
            }
          }
        }
      },
    };
  },
} as Rule);
```

### 10.2 Workspace-wide: operationId uniqueness

```ts
// packages/rules/src/operationid-unique.ts
import { defineRule, Rule } from "@telescope-openapi/engine/types";

export default defineRule({
  meta: {
    id: "operationid-unique",
    type: "problem",
    docs: {
      description: "operationId should be unique across the workspace",
      recommended: true,
    },
    oas: ["2.0", "3.0", "3.1", "3.2"],
  },
  create(ctx) {
    // Build a local set per file run; rely on project.index across files
    const seen = new Map<string, Array<{ uri: string; ptr: string }>>();
    for (const [, ops] of ctx.project.index.operationsByOwner.entries()) {
      for (const op of ops) {
        const idPtr = `${op.ptr}/operationId`;
        const doc = ctx.project.docs.get(op.uri)?.ast;
        const id = doc?.paths && get(doc, idPtr); // pointer getter
        if (typeof id === "string" && id.length) {
          const list = seen.get(id) ?? [];
          list.push({ uri: op.uri, ptr: idPtr });
          seen.set(id, list);
        }
      }
    }

    return {
      Document() {
        for (const [opId, locs] of seen.entries()) {
          if (locs.length <= 1) continue;
          // Report all duplicates
          for (const loc of locs) {
            const r = ctx.locate(loc.uri, loc.ptr)!;
            ctx.report({
              ruleId: "operationid-unique",
              severity: "error",
              uri: loc.uri,
              range: r,
              message: `Duplicate operationId "${opId}"`,
              related: locs
                .filter((x) => x !== loc)
                .map((x) => ({
                  uri: x.uri,
                  range: ctx.locate(x.uri, x.ptr)!,
                  message: "Duplicate here",
                })),
            });
          }
        }
      },
    };

    function get(obj: any, ptr: string): any {
      const segs = ptr
        .split("/")
        .slice(1)
        .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
      let cur = obj;
      for (const s of segs) {
        if (!cur) return undefined;
        cur = cur[s];
      }
      return cur;
    }
  },
} as Rule);
```

---

## 11) Config & Presets

**Definition**

```ts
// packages/config/src/types.ts
export type Severity = "off" | "warn" | "error";

export interface RuleSetting {
  0?: never; // prefer strings
}
export type RuleConfig = Severity | [Severity, unknown?];

export interface LintConfig {
  entrypoints: string[]; // globs
  extends?: string[]; // preset ids
  rules?: Record<string, RuleConfig>;
  overrides?: Array<{ files: string[]; rules: Record<string, RuleConfig> }>;
  versionOverride?: "2.0" | "3.0" | "3.1" | "3.2";
}
```

**Preset Example**

```ts
// packages/rules/src/index.ts
import pathParamsMatch from "./path-params-match";
import operationIdUnique from "./operationid-unique";

export const recommended31 = {
  id: "@telescope-openapi/recommended-3.1",
  rules: {
    "path-params-match": ["error", {}],
    "operationid-unique": "error",
  },
};

export const allRules = { pathParamsMatch, operationIdUnique };
```

**Config Loader (merge logic)**

- Resolve `extends` → merge base → apply `rules` → apply `overrides` by glob.
- Validate rule options via each rule’s `meta.schema` (Ajv).

---

## 12) CLI

**Commands**

```
telescope-lint lint [paths...]         # project-aware (defaults from config.entrypoints)
telescope-lint fix [paths...]
telescope-lint graph [paths...]        # emits json/dot
telescope-lint list-rules
telescope-lint explain <ruleId>
```

**Skeleton**

```ts
// packages/cli/src/index.ts
#!/usr/bin/env bun
import { loadProject } from "./project-loader";
import { runEngine } from "@telescope-openapi/engine/engine";
import { toStylish, toJson, toSarif } from "@telescope-openapi/formatters";

const args = process.argv.slice(2);
const format = getFlag("--format", "stylish");
const cmd = args[0] ?? "lint";

const project = await loadProject(/* reads config, builds host+loader+graph+index */);
const files = [...project.docs.keys()];
const rules = project.resolvedRules; // materialized Rule[] per config

const result = runEngine(project, files, { rules });
output(result, format);
process.exit(result.diagnostics.some(d => d.severity === "error") ? 1 : 0);
```

**Formatters**

- `stylish` for human CLI output,
- `json` for tools,
- `sarif` for CI/code scanning.

---

## 13) VS Code LSP

**Server basics**

```ts
// packages/vscode/server/src/server.ts
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { runEngine } from "@telescope-openapi/engine/engine";
import { toLspDiagnostic, toWorkspaceEdit } from "./lsp-mappers";
import { loadOrUpdateProject } from "./project-host";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments();

let project = await loadOrUpdateProject({ documents }); // build initial

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    codeActionProvider: { resolveProvider: false },
  },
}));

documents.onDidChangeContent(async (change) => {
  project = await loadOrUpdateProject({
    documents,
    changedUri: change.document.uri,
  });
  const run = runEngine(project, [change.document.uri], {
    rules: project.resolvedRules,
  });
  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics: run.diagnostics.map(toLspDiagnostic),
  });
  // Code actions will re-run or pull from last run’s suggestions
});

documents.listen(connection);
connection.listen();
```

**Incremental strategy**

1. On change: re-parse changed doc (loader).
2. Update RefGraph nodes/edges for that doc; mark **dependents** via reverse edges.
3. Rebuild only **affected index shards** (for touched URIs).
4. Re-run engine for changed file (and optionally dependents in background).
5. Publish diagnostics; map fixes to `WorkspaceEdit` via `SourceMap`.

---

## 14) Diagnostics, Locations, and Fixes

- **Blame site** selection:

  - **Ref site** (where `$ref` is used) for contract misuse,
  - **Def site** (where definition lives) for definition errors,
  - Or both (diagnostic with `related`).

- **Ranges** via `SourceMap.pointerToRange(ptr)`.
- **Fixes** are **file-aware JSON Patches**. LSP adapter converts patches into `WorkspaceEdit`.
- For YAML, consider patching at pointer boundaries then **re-stringify with indentation** preserved (use CST to calculate insertion points and indentation).

---

## 15) Performance & Caching

- **Content hashes** per file; skip parse/index when unchanged.
- **RefGraph reverse edges** allow precise invalidation.
- **Sharded index**: store lookups keyed by `uri` so you rebuild only shards that changed.
- **Parallelization** (CLI): parse/index across files using Bun workers; engine traversal is CPU-light.

---

## 16) Version Handling & Schema Validation

- Detect version at load time (`2.0`, `3.0`, `3.1`, `3.2`, `unknown`).
- Some rules may be gated by `meta.oas`.
- **Schema validation** utilities:

  - **OAS 3.1/3.2**: JSON Schema 2020-12 (Ajv) is compatible for `schema` objects.
  - **OAS 3.0**: its “schema objects” are a subset of OpenAPI, not full JSON Schema; provide a narrow validator or use an adapter.

---

## 17) Error Handling & Reporting

- On parse errors, emit **document-level** diagnostics with a best-effort range (first line).
- On `$ref` resolution errors:

  - If **def missing** → report at **ref site** with related info to intended target.
  - If **cycle** → report cycle summary; show a short path in `related`.

- Ensure the CLI **exits 1** on any “error” severity.

---

## 18) Testing Strategy

- **VirtualFS harness** to load fixtures from memory and assert diagnostics.
- **Golden tests** for range correctness using `pointerToRange`.
- **Rule unit tests** for each rule with minimal fixtures.
- **Integration tests** for multi-file projects (paths split into `/paths/*.yaml`, components, cycles).
- **Performance tests** on large projects to measure incremental times.

Example test harness:

```ts
// packages/engine/tests/harness.ts
export function withVirtualProject(
  files: Record<string, string>,
  run: (proj: ProjectContext) => Promise<void>
) {
  const host = new MemoryHost(files); // implements VfsHost
  const docs = new Map<string, ParsedDoc>();
  for (const uri of Object.keys(files))
    docs.set(uri, await loadParsedDoc(host, uri));
  const { graph, resolver } = buildRefGraph({ docs, host });
  const index = buildIndex({ version: "3.1", docs, resolver });
  const project = { graph, resolver, index, docs, version: "3.1" as const };
  return run(project);
}
```

---

## 19) Security & Policies

- Add policy rules: `disallow-remote-http-refs`, `restrict-http-schemes`, `no-credentials-leak` in examples.
- For CLI fetching over HTTP, consider `--allow-remote` flag; default to local only.

---

## 20) Extensibility

- **Plugin hooks** later (e.g., AsyncAPI, GraphQL).
- **Custom rules** loading via `config.plugins`.
- **Output adapters** for other editors (Neovim via LSP, JetBrains via SARIF).

---

## 21) Implementation Plan (Milestones)

**M0 (Skeleton)**

- Packages & build config (bun workspaces, tsconfig).
- Host (Node) + Loader (JSON+YAML) + minimal SourceMap.
- RefGraph builder (no cycles first).
- Indexer (paths & operations only).
- Engine with `Document`, `PathItem`, `Operation` visitors.
- CLI: `lint`, `--format stylish`.
- Rules: `path-params-match`, `operationid-unique`.

**M1 (LSP & Fixes)**

- LSP server (diagnostics).
- File-aware JSON patch fixes → `WorkspaceEdit`.
- Reverse edges + incremental invalidation.
- Formatters: JSON, SARIF.

**M2 (Breadth)**

- Components index, no-orphan components rule.
- Response example validation (Ajv for 3.1).
- Config `extends` + overrides + Ajv options validation.

**M3 (Perf & Polish)**

- Cycle detection & clean errors.
- Cache on disk for CLI.
- Parallel parse/index (workers).
- Docs + Rule authoring guide.

---

## 22) Code Snippets to Drop In

### 22.1 RuleContext wiring (already shown)

### 22.2 LSP workspace edit mapper

```ts
// packages/vscode/server/src/lsp-mappers.ts
import {
  Diagnostic as LspDiagnostic,
  Range as LspRange,
  CodeAction,
  CodeActionKind,
  WorkspaceEdit,
} from "vscode-languageserver";
import { Diagnostic, FilePatch } from "@telescope-openapi/engine/types";

export function toLspDiagnostic(d: Diagnostic): LspDiagnostic {
  return {
    message: `${d.message} (${d.ruleId})`,
    range: d.range,
    severity: d.severity === "error" ? 1 : d.severity === "warning" ? 2 : 3,
    source: "telescope-openapi",
    relatedInformation: d.related?.map((r) => ({
      location: { uri: r.uri, range: r.range },
      message: r.message ?? "",
    })),
  };
}

// The pointerToTextRange must be provided by the loader/source map layer.
export function toWorkspaceEdit(
  patches: FilePatch[],
  pointerToTextRange: (uri: string, ptr: string) => LspRange
): WorkspaceEdit {
  const changes: Record<string, import("vscode-languageserver").TextEdit[]> =
    {};
  for (const patch of patches) {
    for (const op of patch.ops) {
      const range = pointerToTextRange(patch.uri, op.path);
      const newText =
        op.op === "remove"
          ? ""
          : typeof op.value === "string"
          ? op.value
          : JSON.stringify(op.value, null, 2);
      (changes[patch.uri] ??= []).push({ range, newText });
    }
  }
  return { changes };
}
```

### 22.3 CLI stylish formatter

```ts
// packages/formatters/src/stylish.ts
import { Diagnostic } from "@telescope-openapi/engine/types";

export function toStylish(diags: Diagnostic[]): string {
  const lines: string[] = [];
  for (const d of diags) {
    const pos = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
    lines.push(`${severity(d)} ${d.uri}:${pos} ${d.message} (${d.ruleId})`);
    if (d.related?.length) {
      for (const r of d.related) {
        const rpos = `${r.range.start.line + 1}:${r.range.start.character + 1}`;
        lines.push(`  ↳ ${r.uri}:${rpos} ${r.message ?? ""}`);
      }
    }
  }
  return lines.join("\n");

  function severity(d: Diagnostic) {
    return d.severity.toUpperCase().padEnd(5);
  }
}
```

---

## 23) Practical Notes & Gotchas

- **YAML anchors/aliases:** Resolve in AST but keep CST for positions. Anchors should not duplicate nodes in index (use origin mapping for `originOf`).
- **JSON Pointer encoding:** remember `~1` = `/`, `~0` = `~`.
- **Paths normalization:** `/paths/~1pets~1{id}` for pointer keys.
- **Inline disables:** YAML comments aren’t preserved in AST—prefer explicit extension fields like `x-lint-disable: ["ruleId"]` at node level. Provide a helper in `RuleContext` to check disable lists up the ancestor chain.
- **Mixed bundles:** Some repos will mix OAS 3.0 and 3.1 documents; index per-doc version and have rules check `ctx.project.version` **or** the doc’s detected version where relevant.
- **Operation owner detection:** When `$ref` is used for a PathItem, operations are children of the **referenced** item. Ensure `operationsByOwner` treats the **owning PathItem ref site** as the owner key so file/fix mapping stays intuitive.

---

## 24) Example Excalidraw Labels (to copy)

- Virtual FS Host (Node FS, TextDocuments, HTTP)
- Loader: YAML/JSON parse, SourceMap, Version detect
- RefGraph: nodes (uri,ptr); edges $ref; reverse deps; cycles
- Indexers: paths/opIds/components; reverse lookups
- Engine: RuleContext (project, locate, report, fix); Visitors (Document, PathItem, Operation, Schema, Component)
- Consumers: CLI (formatters), LSP (diagnostics + WorkspaceEdit)
- Cache: content hash; shards; incremental rebuilds
