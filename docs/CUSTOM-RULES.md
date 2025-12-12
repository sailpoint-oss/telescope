# Custom Rules Guide

Telescope supports custom rules for extending validation beyond the built-in rules. This guide covers creating both OpenAPI-specific rules and generic rules for any YAML/JSON files.

## Overview

| Rule Type     | Use Case                                       | API                   |
| ------------- | ---------------------------------------------- | --------------------- |
| OpenAPI Rules | Validate OpenAPI specs with semantic awareness | `defineRule()`        |
| Generic Rules | Validate any YAML/JSON files                   | `defineGenericRule()` |
| Zod Schemas   | Structural validation of any YAML/JSON files   | `defineSchema()`      |

## Directory Structure

```
your-project/
└── .telescope/
    ├── config.yaml
    ├── rules/
    │   ├── my-openapi-rule.ts
    │   └── my-generic-rule.ts
    └── schemas/
        └── my-schema.ts
```

## OpenAPI Rules

OpenAPI rules use semantic visitors to validate specific parts of your API specification.

### Basic Structure

```typescript
// .telescope/rules/require-contact.ts
import { defineRule } from "telescope-server";

export default defineRule({
  meta: {
    id: "require-contact",
    number: 1000, // Unique rule number
    description: "API must include contact information",
    type: "problem", // "problem" or "suggestion"
    fileFormats: ["yaml", "yml", "json"],
  },
  check(ctx) {
    return {
      // Visitor for Info section - receives typed InfoRef
      Info(info) {
        // Use typed accessor methods
        if (!info.hasContact()) {
          ctx.reportAt(info, "contact", {
            message: "Info section must include contact details",
            severity: "error",
          });
        }

        // Access other typed properties
        const title = info.title(); // string
        const version = info.version(); // string
        const desc = info.description(); // string | undefined
      },
    };
  },
});
```

### Available Visitors

| Visitor               | Description                         | Ref Type                  | Key Accessors                                                                         |
| --------------------- | ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `Document`            | Every OpenAPI file (general checks) | `{ uri, pointer, node }`  | `node` (raw AST)                                                                      |
| `Root`                | Root-level OpenAPI documents only   | `RootRef`                 | `openapi()`, `info()`, `paths()`, `servers()`, `tags()`                               |
| `Info`                | API metadata section                | `InfoRef`                 | `title()`, `version()`, `description()`, `contact()`, `license()`, `hasContact()`     |
| `Tag`                 | Each tag definition at root level   | `TagRef`                  | `name()`, `description()`, `externalDocs()`, `summary()`, `parent()`, `kind()`        |
| `PathItem`            | Path definitions                    | `PathItemRef`             | `path()`, `operations()`, `hasOperation()`, `parameters()`                            |
| `Operation`           | HTTP operations                     | `OperationRef`            | `method`, `operationId()`, `summary()`, `tags()`, `eachParameter()`, `eachResponse()` |
| `Component`           | Component definitions               | `ComponentRef`            | `componentType()`, `componentName()`, `isSchema()`, `isParameter()`                   |
| `Schema`              | Schema definitions (recursive)      | `SchemaRef`               | `type()`, `properties()`, `items()`, `eachProperty()`, `isArray()`, `isObject()`      |
| `Parameter`           | Parameter definitions               | `ParameterRef`            | `getName()`, `getIn()`, `required()`, `schema()`, `isPath()`, `isQuery()`             |
| `Response`            | Response definitions                | `ResponseRef`             | `description()`, `content()`, `isSuccess()`, `eachMediaType()`, `eachHeader()`        |
| `RequestBody`         | Request body definitions            | `RequestBodyRef`          | `description()`, `required()`, `content()`, `eachMediaType()`                         |
| `Header`              | Header definitions                  | `HeaderRef`               | `getName()`, `description()`, `schema()`, `required()`                                |
| `MediaType`           | Media type definitions              | `MediaTypeRef`            | `schema()`, `example()`, `examples()`, `encoding()`                                   |
| `SecurityRequirement` | Security requirements               | `SecurityRequirementRef`  | `node`, `level` ("root" or "operation")                                               |
| `Example`             | Example definitions                 | `ExampleRef`              | `summary()`, `description()`, `value()`, `externalValue()`, `isExternal()`            |
| `Link`                | Link definitions                    | `LinkRef`                 | `operationId()`, `operationRef()`, `parameters()`, `description()`                    |
| `Callback`            | Callback definitions                | `CallbackRef`             | `expressions()`, `eachPathItem()`, `isRef()`                                          |
| `Reference`           | All `$ref` nodes                    | `ReferenceRef`            | `ref` (the $ref string), `refPointer`, `node`                                         |
| `Project`             | After all files processed           | `{ index: ProjectIndex }` | Aggregate/cross-file checks                                                           |

### Context API

The `ctx` object provides these methods:

```typescript
check(ctx) {
  return {
    Operation(op) {
      // Access the project's documents
      const doc = ctx.project.docs.get(op.uri);

      // Get source location for a JSON pointer
      const range = ctx.locate(op.uri, op.pointer);

      // Report a diagnostic
      ctx.report({
        message: "Issue description",
        severity: "error",   // "error", "warning", or "info"
        uri: op.uri,
        range,
      });

      // Optional: register a fix (separately from reporting)
      ctx.fix({
        uri: op.uri,
        ops: [{ op: "add", path: `${op.pointer}/operationId`, value: "myOperation" }],
      });
    },
  };
}
```

### Utility Functions

```typescript
import {
  defineRule,
  getValueAtPointer, // Get value at JSON pointer
  joinPointer, // Join pointer segments
  splitPointer, // Split pointer into segments
  getParentPointer, // Get parent pointer
} from "telescope-server";

export default defineRule({
  meta: {
    /* ... */
  },
  check(ctx) {
    return {
      Operation(op) {
        const doc = ctx.project.docs.get(op.uri);
        if (!doc) return;

        // Navigate to a child field
        const summaryPointer = joinPointer([
          ...splitPointer(op.pointer),
          "summary",
        ]);

        const summary = getValueAtPointer(doc.ast, summaryPointer);

        if (typeof summary !== "string" || summary.length < 10) {
          ctx.report({
            message: "Summary must be at least 10 characters",
            severity: "warning",
            uri: op.uri,
            range:
              ctx.locate(op.uri, summaryPointer) ??
              ctx.locate(op.uri, op.pointer),
          });
        }
      },
    };
  },
});
```

### Complete Example: Description Length Rule

```typescript
// .telescope/rules/description-length.ts
import {
  defineRule,
  getValueAtPointer,
  joinPointer,
  splitPointer,
} from "telescope-server";

export default defineRule({
  meta: {
    id: "description-min-length",
    number: 1001,
    description: "Descriptions must be at least 20 characters",
    type: "suggestion",
    fileFormats: ["yaml", "yml", "json"],
  },
  check(ctx) {
    const MIN_LENGTH = 20;

    function checkDescription(uri: string, pointer: string, fieldName: string) {
      const doc = ctx.project.docs.get(uri);
      if (!doc) return;

      const descPointer = joinPointer([
        ...splitPointer(pointer),
        "description",
      ]);
      const description = getValueAtPointer(doc.ast, descPointer);

      if (typeof description === "string" && description.length < MIN_LENGTH) {
        const range = ctx.locate(uri, descPointer);
        if (range) {
          ctx.report({
            message: `${fieldName} description should be at least ${MIN_LENGTH} characters (currently ${description.length})`,
            severity: "warning",
            uri,
            range,
          });
        }
      }
    }

    return {
      Operation(op) {
        checkDescription(op.uri, op.pointer, "Operation");
      },
      Parameter(param) {
        checkDescription(param.uri, param.pointer, "Parameter");
      },
      Schema(schema) {
        checkDescription(schema.uri, schema.pointer, "Schema");
      },
    };
  },
});
```

## Generic Rules

Generic rules work on any YAML/JSON file, not just OpenAPI specs.

### Basic Structure

```typescript
// .telescope/rules/require-version.ts
import { defineGenericRule } from "telescope-server";

export default defineGenericRule({
  meta: {
    id: "require-version",
    type: "problem",
    docs: {
      description: "All config files must have a version field",
      recommended: false,
    },
    fileFormats: ["yaml", "json"],
  },
  create(ctx) {
    return {
      Document(ref) {
        const node = ref.node as Record<string, unknown>;

        if (typeof node === "object" && node !== null) {
          if (!("version" in node)) {
            ctx.report({
              message: "Document must have a 'version' field at root level",
              severity: "error",
              uri: ref.uri,
              range: ctx.offsetToRange(0, 1) ?? {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              },
            });
          }
        }
      },
    };
  },
});
```

### Context API for Generic Rules

```typescript
create(ctx) {
  return {
    Document(ref) {
      // ref.node - The parsed document content
      // ref.uri - Document URI
      // ref.pointer - JSON pointer (usually "" for root)

      // Convert character offsets to line/column range
      const range = ctx.offsetToRange(startOffset, endOffset);

      // Report a diagnostic
      ctx.report({
        message: "Issue description",
        severity: "error",
        uri: ref.uri,
        range: range ?? {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 }
        },
      });
    },
  };
}
```

### Complete Example: Key Ordering Rule

```typescript
// .telescope/rules/yaml-key-order.ts
import { defineGenericRule } from "telescope-server";

const PREFERRED_ORDER = ["name", "version", "description", "author", "license"];

export default defineGenericRule({
  meta: {
    id: "yaml-key-order",
    type: "suggestion",
    docs: {
      description: "Enforce consistent key ordering in YAML files",
      recommended: false,
    },
    fileFormats: ["yaml", "yml"],
  },
  create(ctx) {
    return {
      Document(ref) {
        const node = ref.node as Record<string, unknown>;

        if (typeof node !== "object" || node === null || Array.isArray(node)) {
          return;
        }

        const keys = Object.keys(node);
        const orderedKeys = [...keys].sort((a, b) => {
          const aIndex = PREFERRED_ORDER.indexOf(a);
          const bIndex = PREFERRED_ORDER.indexOf(b);

          if (aIndex === -1 && bIndex === -1) return 0;
          if (aIndex === -1) return 1;
          if (bIndex === -1) return -1;
          return aIndex - bIndex;
        });

        if (JSON.stringify(keys) !== JSON.stringify(orderedKeys)) {
          ctx.report({
            message: `Keys should be ordered: ${orderedKeys.join(", ")}`,
            severity: "info",
            uri: ref.uri,
            range: ctx.offsetToRange(0, 1) ?? {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          });
        }
      },
    };
  },
});
```

## Custom Zod Schemas

Use Zod schemas for structural validation of files.

### Basic Structure

```typescript
// .telescope/schemas/app-config.ts
import { defineSchema } from "telescope-server";

export default defineSchema((z) =>
  z.object({
    name: z.string().min(1),
    version: z.string().regex(/^\\d+\\.\\d+\\.\\d+$/),
    settings: z
      .object({
        debug: z.boolean().optional(),
        timeout: z.number().min(0).optional(),
        logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
      })
      .optional(),
    features: z.array(z.string()).optional(),
  })
);
```

### Advanced Schema Example

```typescript
// .telescope/schemas/database-config.ts
import { defineSchema } from "telescope-server";

export default defineSchema((z) =>
  z.object({
    connection: z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535),
      database: z.string().min(1),
      username: z.string().optional(),
      password: z.string().optional(),
      ssl: z.boolean().optional(),
    }),
    pool: z
      .object({
        min: z.number().int().min(0).optional(),
        max: z.number().int().min(1).optional(),
        idleTimeout: z.number().min(0).optional(),
      })
      .optional(),
    replicas: z
      .array(
        z.object({
          host: z.string().min(1),
          port: z.number().int().min(1).max(65535),
          database: z.string().min(1),
          username: z.string().optional(),
          password: z.string().optional(),
          ssl: z.boolean().optional(),
        })
      )
      .optional(),
    migrations: z
      .object({
        directory: z.string(),
        tableName: z.string().optional(),
      })
      .optional(),
  })
);
```

### Zod Schema Reference

See Zod’s documentation for the full API surface; common building blocks:

- `z.object({ ... })`
- `z.string()`, `z.number()`, `z.boolean()`
- `z.array(schema)`
- `schema.optional()`
- `z.enum([...])`

## Configuration

### Register OpenAPI Rules

```yaml
# .telescope/config.yaml
openapi:
  rules:
    - rule: require-contact.ts
    - rule: description-length.ts
      patterns:
        - "**/public-api/**/*.yaml"
```

### Register Generic Rules and Schemas

```yaml
# .telescope/config.yaml
additionalValidation:
  config-files:
    patterns:
      - "config/**/*.yaml"
    schemas:
      - schema: app-config.ts
    rules:
      - rule: require-version.ts

  package-files:
    patterns:
      - "**/package.yaml"
    rules:
      - rule: yaml-key-order.ts
```

## Testing Custom Rules

### Unit Testing OpenAPI Rules

Use the engine helpers to run a rule against an in-memory document:

```typescript
import { describe, expect, it } from "bun:test";
import myRule from "./require-contact";
import {
  buildIndex,
  buildRefGraph,
  createRuleContext,
  runEngine,
  type Rule,
} from "telescope-server";

describe("require-contact", () => {
  it("reports error when contact is missing", async () => {
    const uri = "file:///api.yaml";
    const doc = {
      ast: {
        openapi: "3.0.0",
        info: { title: "My API", version: "1.0.0" },
        paths: {},
      },
      ir: {
        root: {
          ptr: "#",
          kind: "object",
          children: [],
          loc: { start: 0, end: 0 },
          uri,
        },
      },
      rawText: "",
      hash: "",
      mtimeMs: 0,
      version: "3.0",
      format: "yaml",
    } as any;

    const docs = new Map([[uri, doc]]);
    const { graph, resolver, rootResolver } = buildRefGraph({ docs });
    const index = buildIndex({ docs, graph, resolver });
    const project = {
      docs,
      index,
      resolver,
      graph,
      rootResolver,
      version: index.version,
    };

    const diagnostics: any[] = [];
    const fixes: any[] = [];
    const ctx = createRuleContext(
      project,
      uri,
      diagnostics,
      fixes,
      myRule as Rule
    );
    const visitors = (myRule as Rule).check?.(
      ctx,
      (myRule as any).state?.() ?? undefined
    );
    expect(visitors).toBeTruthy();

    const result = runEngine(project, [uri], { rules: [myRule as Rule] });
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
```

### Run Tests

```bash
bun test .telescope/rules/
```

## Best Practices

### Rule Design

1. **Be specific** - Target a single concern per rule
2. **Provide context** - Include helpful error messages
3. **Use appropriate severity** - Reserve `error` for breaking issues
4. **Consider fixes** - Provide auto-fixes when possible

### Performance

1. **Early returns** - Skip unnecessary processing
2. **Cache lookups** - Reuse document references
3. **Limit scope** - Use patterns to target specific files

### Error Messages

```typescript
// Good: Specific and actionable
ctx.report({
  message: `Operation '${op.operationId}' should have a description of at least 20 characters`,
  severity: "warning",
  ...
});

// Bad: Vague and unhelpful
ctx.report({
  message: "Missing description",
  severity: "error",
  ...
});
```

## Troubleshooting

### Rule Not Loading

1. Check file path in config matches actual location
2. Ensure default export: `export default defineRule(...)`
3. Check for TypeScript errors in the rule file
4. Verify Bun can load the file: `bun .telescope/rules/my-rule.ts`

### Rule Not Triggering

1. Verify patterns match target files
2. Check visitor names match exactly (case-sensitive)
3. Ensure the rule returns visitors from `check()` or `create()`
4. Add console logging to debug visitor calls

### Range/Location Issues

1. Ensure `ctx.locate()` returns a valid range before using
2. Provide fallback ranges for edge cases
3. Use parent pointer if child pointer doesn't resolve

## Related Documentation

- [Configuration Reference](CONFIGURATION.md)
- [Built-in Rules](../packages/telescope-server/src/engine/rules/RULES.md)
- [Architecture](../ARCHITECTURE.md)
- [Test Files Examples](../packages/test-files/README.md)
