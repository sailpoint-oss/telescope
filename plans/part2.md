# Core types (engine)

**`packages/engine/src/types.ts`**

```ts
// Minimal primitives
export type OASVersion = "2.0" | "3.0" | "3.1" | "3.2";

export interface Position {
  line: number;
  character: number;
}
export interface Range {
  start: Position;
  end: Position;
}

export interface Diagnostic {
  ruleId: string;
  message: string;
  uri: string;
  range: Range;
  severity: "error" | "warning" | "info";
  // Optional related info (e.g., reference site vs definition site)
  related?: { uri: string; range: Range; message?: string }[];
  // Optional quick-fixes/suggestions
  suggest?: Array<{ title: string; fix: FilePatch | FilePatch[] }>;
}

export type JsonPointer = string;

// JSON Patch for a single file (file-aware, so we can apply WorkspaceEdit in LSP)
export interface FilePatch {
  uri: string;
  ops: Array<
    | { op: "add"; path: JsonPointer; value: unknown }
    | { op: "remove"; path: JsonPointer }
    | { op: "replace"; path: JsonPointer; value: unknown }
  >;
}

// ==== Project structures exposed to rules ====

export interface SourceMap {
  // map a JSON pointer in a file to a Range
  pointerToRange(ptr: JsonPointer): Range | null;
  // map a Range to the closest pointer (best-effort)
  rangeToPointer(range: Range): JsonPointer | null;
}

export interface ParsedDoc {
  uri: string;
  format: "yaml" | "json";
  ast: unknown; // JSON-like AST
  version: OASVersion | "unknown";
  sourceMap: SourceMap;
}

export interface RefGraph {
  // Useful lookups for incremental invalidation; shape is flexible.
  // e.g., dependentsOf(uri, ptr) -> Array<{uri, ptr}>
}

export interface Resolver {
  // Resolve a $ref found at (originUri, originPtr). Returns deref’d value (proxy ok).
  deref<T = unknown>(originUri: string, originPtr: JsonPointer, ref: string): T;
  // Given any resolved proxy node/value, return its definition (uri, ptr)
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
  // Fast lookups:
  pathsByString: Map<string, PathItemRef[]>;
  pathItemsToPathStrings: Map<string, string[]>; // key: `${uri}#${ptr}`
  operationsByOwner: Map<string, OperationRef[]>; // key: `${uri}#${ptr}` of PathItem
  components: Record<string, Map<string, ComponentRef>>; // e.g. schemas/responses/...
}

export interface ProjectContext {
  graph: RefGraph;
  resolver: Resolver;
  index: ProjectIndex;
  docs: Map<string, ParsedDoc>; // uri -> doc
  version: OASVersion | "unknown";
}

// ==== Rule API ====

export interface RuleMeta {
  id: string;
  docs: { description: string; recommended: boolean; url?: string };
  schema?: unknown; // JSON Schema for options
  type: "problem" | "suggestion" | "layout";
  fixable?: boolean;
  oas?: OASVersion[];
}

export interface RuleContext {
  // project
  project: ProjectContext;
  // current file during traversal
  file: { uri: string; ast: unknown; sourceMap: SourceMap };

  // navigation helpers
  getPathStringsForPathItem(uri: string, ptr: JsonPointer): string[];
  getOperationsForPathItem(uri: string, ptr: JsonPointer): OperationRef[];

  // location helpers
  locate(uri: string, ptr: JsonPointer): Range | null;

  // reporting
  report(diag: Diagnostic): void;

  // apply fixes
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

// Helper for rule authors to keep types nice
export const defineRule = (rule: Rule) => rule;
```

---

# Engine runner skeleton

**`packages/engine/src/engine.ts`**

```ts
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
  // rule config resolved already (severity + options), elided for brevity
}

export interface RunResult {
  diagnostics: Diagnostic[];
  fixes: FilePatch[]; // collected if user requested --fix or CodeAction
}

export function createRuleContext(
  project: ProjectContext,
  fileUri: string,
  reportSink: Diagnostic[],
  fixSink: FilePatch[]
): RuleContext {
  const doc = project.docs.get(fileUri);
  if (!doc) throw new Error(`No document for ${fileUri}`);

  return {
    project,
    file: { uri: fileUri, ast: doc.ast, sourceMap: doc.sourceMap },
    getPathStringsForPathItem(uri, ptr) {
      return project.index.pathItemsToPathStrings.get(`${uri}#${ptr}`) ?? [];
    },
    getOperationsForPathItem(uri, ptr) {
      return project.index.operationsByOwner.get(`${uri}#${ptr}`) ?? [];
    },
    locate(uri, ptr) {
      const owner = project.docs.get(uri);
      return owner?.sourceMap.pointerToRange(ptr) ?? null;
    },
    report(diag) {
      reportSink.push(diag);
    },
    fix(patch) {
      if (Array.isArray(patch)) fixSink.push(...patch);
      else fixSink.push(patch);
    },
  };
}

// A trivial dispatcher that calls visitors; real impl would walk the AST with node-kind tagging.
function dispatchVisitors(visitors: Visitors, nodeKind: string, payload: any) {
  const fn = (visitors as any)[nodeKind];
  if (typeof fn === "function") fn(payload);
}

// Stub: your real traversal should be index-driven so you call visitors in a stable order.
function traverseFile(
  project: ProjectContext,
  fileUri: string,
  visitors: Visitors[]
) {
  // 1) Document
  dispatchVisitorsAll("Document", {
    uri: fileUri,
    ptr: "",
    node: project.docs.get(fileUri)?.ast,
  });

  // 2) PathItem nodes discovered via index (owner = pathItemRef)
  for (const [
    key,
    pathStrings,
  ] of project.index.pathItemsToPathStrings.entries()) {
    const [uri, ptr] = key.split("#");
    if (uri !== fileUri) continue;
    const pathItemRef = { uri, ptr: ptr as JsonPointer, node: {} };
    dispatchVisitorsAll("PathItem", pathItemRef);

    const ops = project.index.operationsByOwner.get(key) ?? [];
    for (const op of ops) dispatchVisitorsAll("Operation", op);
  }

  function dispatchVisitorsAll(kind: string, payload: any) {
    for (const v of visitors) dispatchVisitors(v, kind, payload);
  }
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
    const visitors: Visitors[] = opts.rules.map((r) => r.create(ctx));
    visitorSets.set(fileUri, visitors);
  }

  for (const fileUri of files) {
    traverseFile(project, fileUri, visitorSets.get(fileUri)!);
  }

  return { diagnostics, fixes };
}
```

> The traversal is intentionally minimal. In your real build, you’ll tag node kinds (PathItem/Operation/Schema/etc.) either via the index or a fast AST walker; the rule surface doesn’t change.

---

# Indexer shape (used by rules)

**`packages/indexer/src/index.ts`**

```ts
import {
  ProjectIndex,
  PathItemRef,
  OperationRef,
  ComponentRef,
  OASVersion,
} from "@telescope-openapi/engine/types";

export function buildIndex(args: {
  version: OASVersion | "unknown";
  // You’ll likely inject resolver + docs to walk and find these nodes
  // For brevity, assume you’ve already collected pathItems, operations, components
  pathItems: PathItemRef[];
  operations: OperationRef[];
  components: Record<string, ComponentRef[]>;
  pathMap: Map<string, PathItemRef[]>; // "/pets/{id}" => refs
  pathOwners: Map<string, string[]>; // `${uri}#${ptr}` => [ "/pets/{id}" ]
}): ProjectIndex {
  const pathsByString = args.pathMap;
  const pathItemsToPathStrings = args.pathOwners;
  const operationsByOwner = new Map<string, OperationRef[]>();

  for (const op of args.operations) {
    // owner key is the path item’s (uri#ptr)
    const ownerKey = `${op.uri}#${op.ptr.split("/").slice(0, -1).join("/")}`; // simplistic
    const bucket = operationsByOwner.get(ownerKey) ?? [];
    bucket.push(op);
    operationsByOwner.set(ownerKey, bucket);
  }

  const components: Record<string, Map<string, ComponentRef>> = {};
  for (const [kind, arr] of Object.entries(args.components)) {
    const m = new Map<string, ComponentRef>();
    for (const c of arr) {
      const name = c.ptr.split("/").pop()!;
      m.set(name, c);
    }
    components[kind] = m;
  }

  return {
    version: args.version,
    pathsByString,
    pathItemsToPathStrings,
    operationsByOwner,
    components,
  };
}
```

---

# Example cross-file rule (path params declared)

**`packages/rules/src/path-params-match.ts`**

```ts
import {
  defineRule,
  Rule,
  FilePatch,
  OperationRef,
} from "@telescope-openapi/engine/types";

// tiny helper
function extractTemplateParams(paths: string[]): Set<string> {
  const set = new Set<string>();
  for (const p of paths) {
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(p))) set.add(m[1]);
  }
  return set;
}

function collectDeclaredPathParams(
  op: OperationRef,
  ctx: any
): { name: string; in: string }[] {
  // In real code, walk path-level + op-level parameters and deref $refs
  // Here we just illustrate the shape.
  return []; // TODO: implement with ctx.project.resolver + ptr math
}

function addMissingParamPatch(op: OperationRef, name: string): FilePatch {
  // Add to op-level parameters array:  `${op.ptr}/parameters/-`
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

export default defineRule({
  meta: {
    id: "path-params-match",
    type: "problem",
    fixable: true,
    docs: {
      description:
        "Ensure path template params are declared as { in: 'path' } parameters",
      recommended: true,
    },
    oas: ["2.0", "3.0", "3.1", "3.2"],
  },
  create(ctx) {
    return {
      PathItem({ uri, ptr, node }) {
        const owners = ctx.getPathStringsForPathItem(uri, ptr);
        if (!owners.length) return;

        const needed = extractTemplateParams(owners);
        if (!needed.size) return;

        const ops = ctx.getOperationsForPathItem(uri, ptr);
        for (const op of ops) {
          const declared = collectDeclaredPathParams(op, ctx);
          for (const paramName of needed) {
            const has = declared.some(
              (p) => p.in === "path" && p.name === paramName
            );
            if (!has) {
              const opRange = ctx.locate(op.uri, op.ptr) ?? {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              };
              ctx.report({
                ruleId: "path-params-match",
                severity: "error",
                uri: op.uri,
                range: opRange,
                message: `Path parameter "{${paramName}}" is not declared for ${op.method.toUpperCase()} operation.`,
                suggest: [
                  {
                    title: `Add "{${paramName}}" parameter`,
                    fix: addMissingParamPatch(op, paramName),
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

> Note: the `collectDeclaredPathParams` implementation will use your resolver to merge path-level + op-level `parameters` (chasing `$ref`), which is exactly where the cross-file power shows up.

---

# A tiny “recommended” preset exporting your rules

**`packages/rules/src/index.ts`**

```ts
import pathParamsMatch from "./path-params-match";

export const recommended31 = {
  plugins: [],
  rules: {
    "path-params-match": ["error", {}],
  },
};

export { pathParamsMatch };
```

---

# CLI adapter (thin wrapper)

**`packages/cli/src/index.ts`**

```ts
#!/usr/bin/env bun
import { runEngine } from "@telescope-openapi/engine/engine";
import { loadProject } from "./project-loader"; // your host+loader+graph+index build
import { recommended31 } from "@telescope-openapi/rules";

const args = process.argv.slice(2);
const filesOrGlobs = args.length ? args : ["openapi.yaml"];

const project = await loadProject({ entrypoints: filesOrGlobs }); // builds docs, graph, index
const rules = [
  /* expand config to actual Rule instances */
];

const allFiles = [...project.docs.keys()];
const result = runEngine(project, allFiles, {
  rules: [
    /* pick from recommended31 */
  ],
});

// pretty print (stylish)
for (const d of result.diagnostics) {
  const { uri, range, message, ruleId, severity } = d;
  console.log(
    `${severity.toUpperCase()} ${uri}:${range.start.line + 1}:${
      range.start.character + 1
    } ${message} (${ruleId})`
  );
}

process.exit(result.diagnostics.some((d) => d.severity === "error") ? 1 : 0);
```

---

# VS Code LSP server adapter (key bits)

**`packages/vscode/server/src/server.ts`**

```ts
import {
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
  CodeActionKind,
  WorkspaceEdit,
  TextEdit,
} from "vscode-languageserver/node";
import { runEngine } from "@telescope-openapi/engine/engine";
import { toWorkspaceEdit } from "./toWorkspaceEdit";
import { loadOrUpdateProject } from "./project-host";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments();
let project = await loadOrUpdateProject({ documents });

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
  const result = runEngine(project, [change.document.uri], {
    rules: project.rules,
  });
  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics: result.diagnostics.map(toLspDiagnostic),
  });
});

connection.onCodeAction((params) => {
  // Map our FilePatch suggestions to WorkspaceEdit
  // Collect from the last run or re-run engine if needed
  return []; // build CodeAction[] with edits via toWorkspaceEdit(...)
});

documents.listen(connection);
connection.listen();
```

**`packages/vscode/server/src/toWorkspaceEdit.ts`**

```ts
import { FilePatch } from "@telescope-openapi/engine/types";
import { WorkspaceEdit, TextEdit, Range } from "vscode-languageserver";

export function toWorkspaceEdit(
  patches: FilePatch[],
  pointerToOffset: (uri: string, ptr: string) => Range
): WorkspaceEdit {
  const changes: Record<string, TextEdit[]> = {};
  for (const p of patches) {
    for (const op of p.ops) {
      const range = pointerToOffset(p.uri, op.path); // translate JsonPointer -> text Range
      if (!changes[p.uri]) changes[p.uri] = [];
      if (op.op === "replace") {
        changes[p.uri].push({ range, newText: stringifyValue(op.value) });
      } else if (op.op === "add") {
        changes[p.uri].push({ range, newText: stringifyValue(op.value) });
      } else if (op.op === "remove") {
        changes[p.uri].push({ range, newText: "" });
      }
    }
  }
  return { changes };
}

function stringifyValue(v: unknown) {
  // If YAML, respect indentation; otherwise JSON.stringify with spacing
  return JSON.stringify(v, null, 2);
}
```

> Your loader’s `SourceMap` will supply `pointerToRange` & friends—plug that in so fixes land precisely, even across files.

---

# Mermaid architecture map

Paste this into any Mermaid renderer (it’s intentionally conservative syntax):

```mermaid
flowchart LR
  subgraph Host[Virtual FS Host]
    A1[Node FS (CLI)]
    A2[VS Code TextDocuments (LSP)]
    A3[HTTP Fetch (optional)]
  end

  Host --> B[Loader\n(YAML/JSON parser + SourceMaps)]
  B --> C[RefGraph\n($ref graph + reverse deps + cycles)]
  C --> D[Indexers\n(paths, ops, components, reverse lookups)]
  D --> E[Engine\n(rule runner + visitors + fixes)]

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

  J[(Cache\ncontent hashes)] -. speeds up .-> B
  J -. incremental .-> C
  J -. shards .-> D
```

---

## What to whiteboard (labels)

- “**Host**” box: Node FS / TextDocuments / HTTP — one interface, two adapters.
- “**Loader**”: parse & build source maps; detect OAS version; no `$ref` resolution yet.
- “**RefGraph**”: nodes `(uri, ptr)`; edges `$ref`; reverse edges for invalidation; cycles detected.
- “**Indexers**”: fast reverse lookups (e.g., `pathItemsToPathStrings`, `operationsByOwner`).
- “**Engine**”: runs rules via visitors; rules use `RuleContext` helpers (no IO).
- “**Consumers**”: same core runs in CLI + LSP; CLI adds formatters; LSP maps fixes to `WorkspaceEdit`.
- “**Cache**”: content hashes; shard index; incremental re-lint via reverse deps.
