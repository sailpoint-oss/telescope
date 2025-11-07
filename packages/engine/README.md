# Engine — Rule API and runner

The engine executes validation rules over the project context built from OpenAPI documents. It wires visitor callbacks, collects diagnostics, and supports code fixes.

## Responsibilities

- Provide typed rule authoring primitives (`defineRule`, `RuleContext`, visitor payloads)
- Execute rules against the documents, index, and resolver supplied by the pipeline
- Aggregate diagnostics, fixes, and metadata for both the CLI and the LSP
- Filter rules to match the current linting mode (project, fragment, multi-root)

## Exports

- Types: `Rule`, `RuleContext`, `Diagnostic`, `ProjectContext`, `Visitors`, `EngineRunResult`
- Helpers: `defineRule`, `runEngine`, `createRuleContext`, `filterRulesByContext`

## Defining a rule

```ts
import { defineRule, type RuleContext } from "engine";

export default defineRule({
  id: "example-rule",
  meta: { description: "Checks something interesting" },
  create(ctx: RuleContext) {
    return {
      Document(ref) {
        ctx.report({
          ruleId: "example-rule",
          message: "Hello from a rule",
          uri: ref.uri,
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
          },
          severity: "warning"
        });
      }
    };
  }
});
```

Rules can register additional visitors (e.g. `Operation`, `Schema`) depending on which entities they need.

## Running rules

```ts
import { runEngine, filterRulesByContext } from "engine";

const filteredRules = filterRulesByContext(allRules, projectContext);
const { diagnostics, fixes } = runEngine(projectContext, entryUris, { rules: filteredRules });
```

`entryUris` controls which documents drive visitor execution. The engine returns diagnostics and any generated fixes so downstream tools can apply or display them.

## Diagnostics and fixes

- Diagnostics include `ruleId`, `message`, `uri`, text `range`, and `severity`
- Fixes are optional patches emitted by rules via `ctx.addFix`
- `filterRulesByContext` helps skip rules that require context not available in fragment or multi-root modes


