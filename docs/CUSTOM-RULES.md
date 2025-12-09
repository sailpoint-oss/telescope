# Custom Rules Guide

Telescope supports custom rules for extending validation beyond the built-in rules. This guide covers creating both OpenAPI-specific rules and generic rules for any YAML/JSON files.

## Overview

| Rule Type | Use Case | API |
|-----------|----------|-----|
| OpenAPI Rules | Validate OpenAPI specs with semantic awareness | `defineRule()` |
| Generic Rules | Validate any YAML/JSON files | `defineGenericRule()` |
| TypeBox Schemas | Structural validation of any files | `defineSchema()` |

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
import { defineRule } from "aperture-server";

export default defineRule({
  meta: {
    id: "require-contact",
    number: 1000,           // Unique rule number
    description: "API must include contact information",
    type: "problem",        // "problem" or "suggestion"
    fileFormats: ["yaml", "yml", "json"],
  },
  check(ctx) {
    return {
      // Visitor for Info object
      Info(info) {
        if (!info.contact) {
          const range = ctx.locate(info.uri, info.pointer);
          if (range) {
            ctx.report({
              message: "Info section must include contact details",
              severity: "error",
              uri: info.uri,
              range,
            });
          }
        }
      },
    };
  },
});
```

### Available Visitors

| Visitor | Description | Object Properties |
|---------|-------------|-------------------|
| `Document` | Root OpenAPI document | `openapi`, `info`, `paths`, etc. |
| `Info` | API metadata | `title`, `version`, `contact`, etc. |
| `Operation` | HTTP operations | `operationId`, `summary`, `parameters`, etc. |
| `PathItem` | Path definitions | `get`, `post`, `parameters`, etc. |
| `Parameter` | Parameters | `name`, `in`, `required`, `schema`, etc. |
| `Schema` | Schema definitions | `type`, `properties`, `items`, etc. |
| `Response` | Response definitions | `description`, `content`, etc. |
| `Tag` | Tag definitions | `name`, `description`, etc. |

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
        // Optional: provide a fix
        fix: {
          description: "Add missing field",
          changes: [{
            uri: op.uri,
            range,
            newText: "operationId: myOperation\n",
          }],
        },
      });
    },
  };
}
```

### Utility Functions

```typescript
import {
  defineRule,
  getValueAtPointer,  // Get value at JSON pointer
  joinPointer,        // Join pointer segments
  splitPointer,       // Split pointer into segments
  parentPointer,      // Get parent pointer
} from "aperture-server";

export default defineRule({
  meta: { /* ... */ },
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
            range: ctx.locate(op.uri, summaryPointer) ?? ctx.locate(op.uri, op.pointer),
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
import { defineRule, getValueAtPointer, joinPointer, splitPointer } from "aperture-server";

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

      const descPointer = joinPointer([...splitPointer(pointer), "description"]);
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
import { defineGenericRule } from "aperture-server";

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
import { defineGenericRule } from "aperture-server";

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

## Custom TypeBox Schemas

Use TypeBox schemas for structural validation of files.

### Basic Structure

```typescript
// .telescope/schemas/app-config.ts
import { defineSchema } from "aperture-server";

export default defineSchema((Type) =>
  Type.Object({
    name: Type.String({ minLength: 1 }),
    version: Type.String({ pattern: "^\\d+\\.\\d+\\.\\d+$" }),
    
    settings: Type.Optional(Type.Object({
      debug: Type.Optional(Type.Boolean()),
      timeout: Type.Optional(Type.Number({ minimum: 0 })),
      logLevel: Type.Optional(Type.Union([
        Type.Literal("debug"),
        Type.Literal("info"),
        Type.Literal("warn"),
        Type.Literal("error"),
      ])),
    })),
    
    features: Type.Optional(Type.Array(Type.String())),
  })
);
```

### Advanced Schema Example

```typescript
// .telescope/schemas/database-config.ts
import { defineSchema } from "aperture-server";

export default defineSchema((Type) => {
  const ConnectionSchema = Type.Object({
    host: Type.String({ minLength: 1 }),
    port: Type.Integer({ minimum: 1, maximum: 65535 }),
    database: Type.String({ minLength: 1 }),
    username: Type.Optional(Type.String()),
    password: Type.Optional(Type.String()),
    ssl: Type.Optional(Type.Boolean()),
  });

  const PoolSchema = Type.Object({
    min: Type.Optional(Type.Integer({ minimum: 0 })),
    max: Type.Optional(Type.Integer({ minimum: 1 })),
    idleTimeout: Type.Optional(Type.Number({ minimum: 0 })),
  });

  return Type.Object({
    connection: ConnectionSchema,
    pool: Type.Optional(PoolSchema),
    
    replicas: Type.Optional(Type.Array(ConnectionSchema)),
    
    migrations: Type.Optional(Type.Object({
      directory: Type.String(),
      tableName: Type.Optional(Type.String()),
    })),
  });
});
```

### TypeBox Schema Reference

| TypeBox | Description |
|---------|-------------|
| `Type.String()` | String type |
| `Type.Number()` | Number type |
| `Type.Integer()` | Integer type |
| `Type.Boolean()` | Boolean type |
| `Type.Object({...})` | Object with properties |
| `Type.Array(schema)` | Array of schema type |
| `Type.Optional(schema)` | Optional field |
| `Type.Union([...])` | Union of schemas |
| `Type.Literal("value")` | Literal value |
| `Type.Record(key, value)` | Record/dictionary |
| `Type.String({ minLength: 1 })` | String with constraints |
| `Type.Number({ minimum: 0 })` | Number with constraints |
| `Type.String({ format: "email" })` | Format validation |
| `Type.String({ format: "uri" })` | URL format validation |

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

```typescript
// .telescope/rules/require-contact.test.ts
import { describe, expect, it } from "bun:test";
import requireContact from "./require-contact";
import { createRuleTestContext } from "aperture-server/test-utils";

describe("require-contact", () => {
  it("reports error when contact is missing", async () => {
    const ctx = await createRuleTestContext(`
openapi: 3.0.0
info:
  title: My API
  version: 1.0.0
paths: {}
    `);
    
    const visitors = requireContact.check(ctx);
    // Simulate visiting the Info node
    // ... test logic
  });

  it("passes when contact is present", async () => {
    const ctx = await createRuleTestContext(`
openapi: 3.0.0
info:
  title: My API
  version: 1.0.0
  contact:
    email: support@example.com
paths: {}
    `);
    
    // ... test logic
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
- [Built-in Rules](../packages/aperture-server/src/engine/rules/RULES.md)
- [Architecture](../ARCHITECTURE.md)
- [Test Files Examples](../packages/test-files/README.md)

