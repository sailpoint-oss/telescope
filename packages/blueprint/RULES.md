# Telescope Rules Documentation

This document provides comprehensive documentation for all available rules in Telescope, rule metadata options, and how to create custom rules.

## Table of Contents

- [Available Rules](#available-rules)
- [Rule Metadata](#rule-metadata)
- [Creating Custom Rules](#creating-custom-rules)
- [Rule Configuration](#rule-configuration)
- [Presets](#presets)

## Available Rules

Telescope provides a comprehensive set of rules organized by category. All rules are available through presets or can be individually configured.

### Core Rules

Core rules validate fundamental OpenAPI structure and references.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `path-params-match` | Ensure path template params are declared as `in:'path'` parameters | - |
| `operationid-unique` | `operationId` must be unique across the workspace | - |
| `unresolved-ref` | Report `$ref` entries that cannot be resolved | - |
| `ref-cycle` | Report `$ref` cycles detected in the reference graph | - |

### Operations Rules

Rules that validate operation-level specifications.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `operation-basic-fields` | Operations must include meaningful descriptions and avoid placeholder text | 400 |
| `operation-description-html` | Operation descriptions must not contain raw HTML tags or entities | 405 |
| `operation-id-format` | `operationId` must be camelCase with verb + Resource (e.g. `listAccessProfiles`) | 404 |
| `operation-summary` | Operations must include a concise summary (≤5 words) | 305 |
| `operation-tags` | Operations must have at least one Title Case tag with no duplicates or whitespace | 402 |
| `operation-security-requirements` | Operations must declare security requirements using `userAuth`, `applicationAuth`, or `{}` for public access | 104 |
| `operation-responses` | Operations must document at least one 2xx success response and standard error responses (400, 401, 403, 429, 500) | 151 |
| `operation-pagination` | GET list operations returning arrays must expose `limit` and `offset` query parameters with proper bounds | 159 |
| `operation-user-levels` | Operations must document minimum SailPoint user levels using `x-sailpoint-userLevels` extension | 321 |

### Paths Rules

Rules that validate path-level specifications.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `operation-id-unique-in-path` | All operations within a path must have unique `operationId`s | 404 |

### Parameter Rules

Rules that validate parameter specifications.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `parameter-in` | Parameters must have a valid `in` value (query, header, path, cookie for OpenAPI 3.x; query, header, path, formData, body for Swagger 2.0) | 318 |
| `parameter-required` | Parameters must explicitly declare whether they are required | 317 |
| `parameter-description` | Parameters must include descriptive explanations (at least 8 characters) | 303 |
| `parameter-default` | Optional boolean parameters must provide a default value | 310 |
| `parameter-example` | Parameters must provide an example value via `example`, `examples`, or `schema.example` | 304 |
| `parameter-example-keys` | Example keys in parameter examples must be meaningful names between 6 and 20 characters | 507 |
| `parameter-filters` | `filters` query parameter must follow standard collection parameter format | 324 |
| `parameter-formats` | Integer and number parameters must specify valid formats | 171 |
| `parameter-sorters` | `sorters` query parameter must follow standard collection parameter format | 325 |

### Schema Rules

Rules that validate schema definitions.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `schema-allof-mixed-types` | `allOf` compositions must not mix incompatible schema types | 506 |
| `schema-default` | Optional boolean properties must define a default value | 310 |
| `schema-description` | Schema properties must include descriptive text | 303 |
| `schema-example` | Schema properties must include example values (except object and array types) | 304 |
| `schema-example-keys` | Example keys in schema examples must be meaningful names between 6 and 20 characters | 507 |
| `schema-formats` | Integer and number schema properties must declare valid formats | 171 |
| `schema-required` | Object schemas with properties must declare a `required` array | 317 |
| `schema-structure` | Detects invalid OpenAPI schema structures including `allOf` conflicts and missing array items | 508 |

### Component Rules

Rules that validate component definitions.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `component-example-name-capital` | Example names in components must start with a capital letter | 510 |
| `component-schema-name-capital` | Schema names in components must start with a capital letter | 509 |

### Root Rules

Rules that validate root-level document structure.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `root-info` | OpenAPI documents must include an `info` section at root level | 101 |
| `root-sailpoint-api` | `x-sailpoint-api` extension is required at root level and must contain `version` and `audience` fields | 219 |
| `root-tags` | Tags array must be present at root level and sorted alphabetically by name | 403 |

### Document Rules

Rules that validate document-level concerns.

| Rule ID | Description | Legacy Code |
|---------|-------------|-------------|
| `document-ascii` | Only ASCII characters are allowed in OpenAPI specification files | 401 |
| `document-version-ref-isolation` | External `$ref` must include current version segment | 405 |

## Rule Metadata

Rule metadata provides information about the rule's behavior, requirements, and configuration options.

### OpenAPI Rule Metadata

OpenAPI rules use the `RuleMeta` interface with the following properties:

```typescript
interface RuleMeta {
  // Required fields
  id: string;                    // Unique rule identifier (e.g., "operation-summary")
  number: number;                // Rule number (e.g., 401, 402, etc.)
  docs: {
    description: string;         // Human-readable description
    recommended: boolean;        // Whether rule is recommended for general use
    url?: string;                // Optional URL to rule documentation
  };
  type: "problem" | "suggestion" | "layout";
  
  // Optional fields
  schema?: unknown;              // JSON schema for rule options
  fixable?: boolean;             // Whether rule can auto-fix issues
  oas?: string[];                // Supported OpenAPI versions (e.g., ["3.0", "3.1", "3.2"])
  fileFormats?: string[];        // File formats rule applies to (e.g., ["yaml", "yml", "json"])
  ruleType?: "openapi";          // Automatically set by defineRule - do not set manually
  contextRequirements?: {
    requiresRoot?: boolean;       // Rule needs root document context
    requiresPaths?: boolean;       // Rule needs paths section
    requiresComponents?: boolean;  // Rule needs components section
    requiresSpecificSection?: string[]; // Custom section requirements (e.g., ["info", "security"])
  };
}
```

#### Metadata Field Descriptions

- **`id`** (required): Unique identifier for the rule. Use kebab-case (e.g., `operation-summary`).
- **`number`** (required): Numeric identifier for the rule. Use high numbers (999+) for custom rules.
- **`docs.description`** (required): Clear, concise description of what the rule checks.
- **`docs.recommended`** (required): Whether this rule should be enabled by default in presets.
- **`docs.url`** (optional): Link to detailed documentation or examples.
- **`type`** (required): Rule category:
  - `"problem"`: Violations that are likely bugs or errors
  - `"suggestion"`: Best practices and style recommendations
  - `"layout"`: Formatting and structure concerns
- **`schema`** (optional): JSON schema defining rule-specific options. Used for rule configuration.
- **`fixable`** (optional): Set to `true` if the rule can automatically fix violations.
- **`oas`** (optional): Array of supported OpenAPI versions. If omitted, rule applies to all versions.
- **`fileFormats`** (optional): Array of file extensions the rule applies to. Defaults to all formats.
- **`contextRequirements`** (optional): Specifies what parts of the OpenAPI document the rule needs:
  - `requiresRoot`: Rule needs access to root document
  - `requiresPaths`: Rule needs paths section
  - `requiresComponents`: Rule needs components section
  - `requiresSpecificSection`: Custom sections needed (e.g., `["info", "security"]`)

### Generic Rule Metadata

Generic rules use the `GenericRuleMeta` interface with a simplified structure:

```typescript
interface GenericRuleMeta {
  // Required fields
  id: string;                    // Unique rule identifier
  docs: {
    description: string;         // Human-readable description
    recommended?: boolean;       // Whether rule is recommended
    url?: string;                // Optional URL to rule documentation
  };
  type: "problem" | "suggestion" | "layout";
  
  // Optional fields
  schema?: unknown;              // JSON schema for rule options
  fixable?: boolean;             // Whether rule can auto-fix issues
  fileFormats?: string[];        // File formats rule applies to (e.g., ["yaml", "json"])
  ruleType?: "generic";         // Automatically set by defineGenericRule - do not set manually
}
```

#### Generic Rule Metadata Field Descriptions

- **`id`** (required): Unique identifier for the rule.
- **`docs.description`** (required): Clear description of what the rule checks.
- **`docs.recommended`** (optional): Whether rule is recommended for general use.
- **`docs.url`** (optional): Link to detailed documentation.
- **`type`** (required): Rule category (same as OpenAPI rules).
- **`schema`** (optional): JSON schema for rule-specific options.
- **`fixable`** (optional): Whether rule can auto-fix violations.
- **`fileFormats`** (optional): File extensions the rule applies to.

## Creating Custom Rules

### OpenAPI Custom Rules

Create custom OpenAPI rules using the `defineRule` helper:

```typescript
import { defineRule } from "lens";

export default defineRule({
  meta: {
    id: "custom-operation-summary",
    number: 999, // Use high numbers for custom rules
    docs: {
      description: "All operations must have a summary field",
      recommended: false,
    },
    type: "problem",
    fileFormats: ["yaml", "yml", "json"],
  },
  create(ctx) {
    return {
      Operation(op) {
        const operation = op.node;
        if (
          typeof operation === "object" &&
          operation !== null &&
          !("summary" in operation)
        ) {
          ctx.report({
            message: "Operation must have a summary field",
            uri: op.uri,
            range: ctx.locate(op.uri, op.pointer) ?? {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            severity: "error",
          });
        }
      },
    };
  },
});
```

#### Available Visitors for OpenAPI Rules

OpenAPI rules can register visitors for different parts of the OpenAPI document:

- `Document` - Root document node
- `PathItem` - Path item definitions
- `Operation` - HTTP operations (GET, POST, etc.)
- `Component` - Component definitions
- `Schema` - Schema definitions
- `Parameter` - Parameter definitions
- `Response` - Response definitions
- `RequestBody` - Request body definitions
- `Header` - Header definitions
- `MediaType` - Media type definitions
- `SecurityRequirement` - Security requirement definitions
- `Example` - Example definitions
- `Link` - Link definitions
- `Callback` - Callback definitions
- `Reference` - `$ref` references

#### Rule Context Methods

The `RuleContext` provides several helper methods:

- `ctx.report(diagnostic)` - Report a diagnostic/error
- `ctx.fix(patch)` - Provide an auto-fix
- `ctx.locate(uri, pointer)` - Get the range for a JSON pointer
- `ctx.offsetToRange(uri, startOffset, endOffset?)` - Convert byte offsets to range
- `ctx.findKeyRange(uri, parentPointer, keyName)` - Find range of a key name
- `ctx.getScopeContext(uri, pointer)` - Get scope context for a node
- `ctx.getRootDocuments(uri?, pointer?)` - Get root document URIs
- `ctx.getPrimaryRoot(uri?, pointer?)` - Get primary root document URI

### Generic Custom Rules

Create custom generic rules using the `defineGenericRule` helper:

```typescript
import { defineGenericRule } from "lens";

export default defineGenericRule({
  meta: {
    id: "custom-version-required",
    docs: {
      description: "All objects must have a version field",
      recommended: false,
    },
    type: "problem",
    fileFormats: ["yaml", "json"],
  },
  create(ctx) {
    return {
      Document(ref) {
        // Traverse the document and check for version field
        function checkObject(obj: unknown, pointer: string): void {
          if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
            const objRecord = obj as Record<string, unknown>;
            if (!("version" in objRecord)) {
              const range = ctx.offsetToRange(0, 100) ?? {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 0 },
              };

              ctx.report({
                message: `Object at ${pointer} must have a "version" field`,
                uri: ref.uri,
                range,
                severity: "error",
              });
            }

            // Recursively check nested objects
            for (const [key, value] of Object.entries(objRecord)) {
              if (typeof value === "object" && value !== null) {
                checkObject(value, `${pointer}/${key}`);
              }
            }
          }
        }

        checkObject(ref.node, ref.pointer);
      },
    };
  },
});
```

#### Available Visitors for Generic Rules

Generic rules only support the `Document` visitor, which receives the parsed AST of the file.

#### Generic Rule Context Methods

The `GenericRuleContext` provides:

- `ctx.report(diagnostic)` - Report a diagnostic/error
- `ctx.fix(patch)` - Provide an auto-fix
- `ctx.offsetToRange(startOffset, endOffset?)` - Convert byte offsets to range
- `ctx.file.uri` - File URI
- `ctx.file.ast` - Parsed AST (object, array, or primitive)
- `ctx.file.rawText` - Raw file text

## Rule Configuration

Rules can be configured in your `.telescope/config.yaml` file with different severity levels and optional rule-specific options.

### Rule Severity Levels

- `"off"` - Disable the rule
- `"warn"` - Report violations as warnings
- `"error"` - Report violations as errors (default)

### Basic Rule Configuration

```yaml
OpenAPI:
  base:
    - "@telescope-openapi/default"
  rulesOverrides:
    "operation-summary": "warn"  # Simple severity override
    "operation-id-format": "off" # Disable rule
```

### Rule Configuration with Options

Some rules support configuration options:

```yaml
OpenAPI:
  base:
    - "@telescope-openapi/default"
  rulesOverrides:
    "operation-summary":
      severity: "error"
      options:
        maxWords: 10  # Rule-specific option
```

### File-Specific Rule Overrides

Override rules for specific files or patterns:

```yaml
OpenAPI:
  base:
    - "@telescope-openapi/default"
  overrides:
    - files:
        - "**/legacy/**"
      rules:
        "operation-id-format": "off"
        "operation-summary": "warn"
```

### Custom Rule Configuration

Add custom rules to your configuration:

```yaml
OpenAPI:
  base:
    - "@telescope-openapi/default"
  rules:
    - rule: example-custom-openapi-rule.ts
      pattern: "**/custom-openapi-*.yaml"  # Optional pattern
```

## Presets

Presets are collections of rules with predefined configurations.

### Available Presets

- **`@telescope-openapi/default`** - General OpenAPI best practices for all users. Recommended for most projects.
- **`@telescope-openapi/sailpoint`** - Extends `defaultPreset` and adds SailPoint-specific rules:
  - `root-sailpoint-api` - Requires `x-sailpoint-api` extension
  - `operation-user-levels` - Requires `x-sailpoint-userLevels` extension
- **`@telescope-openapi/recommended-3.1`** - Backward compatibility preset (same as `sailpointPreset`)

### Using Presets

```yaml
OpenAPI:
  base:
    - "@telescope-openapi/default"
    # Or use SailPoint preset:
    # - "@telescope-openapi/sailpoint"
```

### Extending Presets

Presets can extend other presets. When you use a preset, all rules from extended presets are included, and you can override them:

```yaml
OpenAPI:
  base:
    - "@telescope-openapi/sailpoint"  # Includes default + SailPoint rules
  rulesOverrides:
    "operation-summary": "warn"  # Override from default preset
```

## Examples

### Example: Custom OpenAPI Rule

See `packages/test-files/.telescope/rules/example-custom-openapi-rule.ts` or `example-custom-openapi-rule.js` for a complete example. Both TypeScript (`.ts`) and JavaScript (`.js`) rule files are supported.

### Example: Custom Generic Rule

See `packages/test-files/.telescope/rules/example-generic-rule.ts` or `example-generic-rule.js` for a complete example. Both TypeScript (`.ts`) and JavaScript (`.js`) rule files are supported.

### Example: Rule Configuration

```yaml
OpenAPI:
  base:
    - "@telescope-openapi/default"
  patterns:
    - "**/*.yaml"
    - "!**/node_modules/**"
  rulesOverrides:
    "operation-summary": "warn"
    "operation-id-format": "error"
  overrides:
    - files:
        - "**/legacy/**"
      rules:
        "operation-id-format": "off"
  rules:
    - rule: my-custom-rule.ts  # or .js
      pattern: "**/api/**/*.yaml"
```

**Note**: Both TypeScript (`.ts`) and JavaScript (`.js`) rule files are supported. When using Bun (the default runtime), TypeScript files are automatically transpiled. Make sure to include the file extension when specifying rule paths in the configuration. The configuration validation will check that rule files exist and report errors if they are missing.

## Best Practices

1. **Use descriptive rule IDs**: Use kebab-case and be specific (e.g., `operation-summary` not `summary`).
2. **Provide clear descriptions**: Write descriptions that help users understand what the rule checks.
3. **Set appropriate types**: Use `"problem"` for errors, `"suggestion"` for best practices, `"layout"` for formatting.
4. **Specify OpenAPI versions**: Use the `oas` field to indicate which OpenAPI versions your rule supports.
5. **Use high rule numbers**: Custom rules should use numbers 999+ to avoid conflicts with built-in rules.
6. **Document rule options**: If your rule accepts options, provide a JSON schema in the `schema` field.
7. **Handle edge cases**: Ensure your rule handles missing or malformed data gracefully.

