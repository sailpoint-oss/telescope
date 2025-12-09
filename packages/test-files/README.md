# Test Files

This package provides shared OpenAPI documents and custom rule examples used across Telescope's unit and integration tests.

## Structure

```
test-files/
├── openapi/              # OpenAPI test fixtures
│   ├── api-*.yaml        # Comprehensive API examples
│   ├── test-*.yaml       # Focused test cases for specific rules
│   └── v1/, v2/, v3/     # Version-specific component files
├── custom/               # Custom validation test files
│   ├── custom-generic-*.yaml
│   └── custom-zod-schema-*.yaml
└── .telescope/           # Example custom rules and schemas
    ├── config.yaml
    ├── rules/
    └── schemas/
```

## OpenAPI Fixtures

### Root-Level Files

| File | Description |
|------|-------------|
| `api-v1.yaml`, `api-v2.yaml`, `api-v3.json` | Partial specs referencing versioned folders |
| `api-standalone.yaml` | Fully self-contained OpenAPI spec |
| `api-minimal.yaml` | Minimal valid OpenAPI document |
| `test-*.yaml` | Focused test fixtures for specific rules |

### Version Folders

| Folder | Purpose |
|--------|---------|
| `v1/` | Valid examples, proper structure and fields |
| `v2/` | Edge cases and warning scenarios |
| `v3/` | Error cases, missing fields, invalid formats |

Each version folder contains:
- `paths/` - Individual path item files
- `schemas/` - Schema component files
- `components/` - Parameters, responses, examples, headers
- `security/` - Security scheme definitions

## Naming Conventions

| Pattern | Description |
|---------|-------------|
| `test-*` | Focused test fixtures for specific rules |
| `api-*` | Comprehensive API examples |
| `valid-*` | Well-formed specifications |
| `invalid-*` | Documents with intentional violations |
| `component-*` | Standalone fragments for `$ref` testing |

## Using Fixtures in Tests

```typescript
// Unit tests
import { createTestProjectFromExample } from "./test-utils";

const project = await createTestProjectFromExample("test-operation-summary.yaml");
const results = runRule(operationSummary, project);
```

## Custom Rule Examples

The `.telescope/` directory contains example custom rules for reference:

```
.telescope/
├── config.yaml                        # Example configuration
├── rules/
│   ├── example-custom-openapi-rule.ts # Custom OpenAPI rule
│   ├── example-generic-rule.ts        # Generic rule for any YAML/JSON
│   ├── require-operationid.ts         # Simple OpenAPI rule example
│   └── yaml-key-order.ts              # Generic key ordering rule
└── schemas/
    ├── example-zod-schema.ts          # Custom TypeBox schema
    └── example-json-schema.json       # JSON Schema example
```

### Example OpenAPI Rule

```typescript
// .telescope/rules/require-operationid.ts
import { defineRule, getValueAtPointer, joinPointer, splitPointer } from "aperture-server";

export default defineRule({
  meta: {
    id: "custom-require-operationid",
    number: 1000,
    description: "Every operation must have an operationId",
    type: "problem",
    fileFormats: ["yaml", "yml", "json"],
  },
  check(ctx) {
    return {
      Operation(op) {
        const doc = ctx.project.docs.get(op.uri);
        if (!doc) return;

        const operationIdPointer = joinPointer([
          ...splitPointer(op.pointer),
          "operationId",
        ]);
        const operationId = getValueAtPointer(doc.ast, operationIdPointer);

        if (!operationId || typeof operationId !== "string") {
          const range = ctx.locate(op.uri, op.pointer);
          if (range) {
            ctx.report({
              message: "Operation must have an operationId",
              severity: "error",
              uri: op.uri,
              range,
            });
          }
        }
      },
    };
  },
});
```

### Example Generic Rule

```typescript
// .telescope/rules/example-generic-rule.ts
import { defineGenericRule } from "aperture-server";

export default defineGenericRule({
  meta: {
    id: "custom-version-required",
    type: "problem",
    docs: {
      description: "All objects must have a version field",
      recommended: false,
    },
    fileFormats: ["yaml", "json"],
  },
  create(ctx) {
    return {
      Document(ref) {
        function checkObject(obj: unknown, pointer: string): void {
          if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
            const record = obj as Record<string, unknown>;
            if (!("version" in record)) {
              ctx.report({
                message: `Object at ${pointer} must have a "version" field`,
                uri: ref.uri,
                range: ctx.offsetToRange(0, 100) ?? { 
                  start: { line: 0, character: 0 }, 
                  end: { line: 0, character: 0 } 
                },
                severity: "error",
              });
            }
          }
        }
        checkObject(ref.node, ref.pointer);
      },
    };
  },
});
```

### Example TypeBox Schema

```typescript
// .telescope/schemas/example-zod-schema.ts
import { defineSchema } from "aperture-server";

export default defineSchema((Type) =>
  Type.Object({
    name: Type.String(),
    version: Type.String({ pattern: "^\\d+\\.\\d+\\.\\d+$" }),
    settings: Type.Optional(Type.Object({
      debug: Type.Boolean(),
      timeout: Type.Optional(Type.Number({ minimum: 0 })),
    })),
  })
);
```

## Custom Validation Test Files

Test files for validating custom rules and schemas:

### OpenAPI Rule Tests (`openapi/`)
- `custom-openapi-valid.yaml` - Operations with `summary` fields (passes)
- `custom-openapi-invalid.yaml` - Missing `summary` field (fails)

### Generic Rule Tests (`custom/`)
- `custom-generic-valid.yaml` - Objects with `version` fields (passes)
- `custom-generic-invalid.yaml` - Missing `version` fields (fails)

### TypeBox Schema Tests (`custom/`)
- `custom-zod-schema-valid.yaml` - Valid configuration (passes)
- `custom-zod-schema-invalid.yaml` - Missing required fields (fails)

## Configuration Example

```yaml
# .telescope/config.yaml
openapi:
  patterns:
    - "openapi/**/*.yaml"
    - "openapi/**/*.yml"
    - "openapi/**/*.json"
  rules:
    - rule: example-custom-openapi-rule.ts

additionalValidation:
  generic-rule:
    patterns:
      - "custom/custom-generic-*.yaml"
    rules:
      - rule: example-generic-rule.ts
  
  typebox-schema-validation:
    patterns:
      - "custom/custom-zod-schema-*.yaml"
    schemas: 
      - schema: example-zod-schema.ts
```

## Reference Paths

When using `$ref` in version folders, use relative paths:

```yaml
# From root
$ref: './v1/schemas/User.yaml#/components/schemas/User'

# From within a path file
$ref: '../schemas/Pet.yaml#/components/schemas/Pet'
```

## Contributing

When adding new test fixtures:
- Keep fixtures concise and focused
- Document the intent with comments
- Prefer extending existing fixtures when possible
- Place new fixtures close to the rule family they test
