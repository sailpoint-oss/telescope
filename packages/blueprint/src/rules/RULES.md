# Level Rules

This document lists all available rules in the `blueprint` package.

## Operations Rules

- **operation-basic-fields**: Operations must include meaningful descriptions and avoid placeholder text (legacy code: 400)
- **operation-description-html**: Operation descriptions must not contain raw HTML tags or entities (legacy code: 405)
- **operation-id-format**: operationId must be camelCase with verb + Resource (e.g. listAccessProfiles) (legacy code: 404)
- **operation-summary**: Operations must include a concise summary (≤5 words) (legacy code: 305)
- **operation-tags**: Operations must have at least one Title Case tag with no duplicates or whitespace (legacy code: 402)
- **operation-security-requirements**: Operations must declare security requirements using userAuth, applicationAuth, or {} for public access (legacy code: 104)
- **responses-standard-codes**: Operations must document at least one 2xx success response and standard error responses (400, 401, 403, 429, 500) (legacy code: 151)
- **operation-pagination**: GET list operations returning arrays must expose limit and offset query parameters with proper bounds (legacy code: 159)
- **operation-user-levels**: Operations must document minimum SailPoint user levels using x-sailpoint-userLevels extension (legacy code: 321)

## Paths Rules

- **operation-id-unique-in-path**: All operations within a path must have unique operationIds (legacy code: 404)

## Parameter Rules

- **parameter-in**: Parameters must have a valid 'in' value (query, header, path, cookie for OpenAPI 3.x; query, header, path, formData, body for Swagger 2.0) (legacy code: 318)
- **parameter-required**: Parameters must explicitly declare whether they are required (legacy code: 317)
- **parameter-description**: Parameters must include descriptive explanations (at least 8 characters) (legacy code: 303)
- **parameter-default**: Optional boolean parameters must provide a default value (legacy code: 310)
- **parameter-example**: Parameters must provide an example value via example, examples, or schema.example (legacy code: 304)
- **parameter-example-keys**: Example keys in parameter examples must be meaningful names between 6 and 20 characters (legacy code: 507)
- **parameter-filters**: filters query parameter must follow standard collection parameter format (legacy code: 324)
- **parameter-formats**: Integer and number parameters must specify valid formats (legacy code: 171)
- **parameter-sorters**: sorters query parameter must follow standard collection parameter format (legacy code: 325)

## Schema Rules

- **schema-allof-mixed-types**: allOf compositions must not mix incompatible schema types (legacy code: 506)
- **schema-default**: Optional boolean properties must define a default value (legacy code: 310)
- **schema-description**: Schema properties must include descriptive text (legacy code: 303)
- **schema-example**: Schema properties must include example values (except object and array types) (legacy code: 304)
- **schema-example-keys**: Example keys in schema examples must be meaningful names between 6 and 20 characters (legacy code: 507)
- **schema-formats**: Integer and number schema properties must declare valid formats (legacy code: 171)
- **schema-required**: Object schemas with properties must declare a required array (legacy code: 317)
- **schema-structure**: Detects invalid OpenAPI schema structures including allOf conflicts and missing array items (legacy code: 508)

## Component Rules

- **component-example-name-capital**: Example names in components must start with a capital letter (legacy code: 510)
- **component-schema-name-capital**: Schema names in components must start with a capital letter (legacy code: 509)

## Root Rules

- **root-info**: OpenAPI documents must include an info section at root level (legacy code: 101)
- **root-sailpoint-api**: x-sailpoint-api extension is required at root level and must contain version and audience fields (legacy code: 219)
- **root-tags**: Tags array must be present at root level and sorted alphabetically by name (legacy code: 403)

## Document Rules

- **ascii-only**: Only ASCII characters are allowed in OpenAPI specification files (legacy code: 401)
- **cross-version-ref-isolation**: External $ref must include current version segment (legacy code: 405)

## Core Rules

- **path-params-match**: Ensure path template params are declared as in:'path' parameters
- **operationid-unique**: operationId must be unique across the workspace
- **unresolved-ref**: Report $ref entries that cannot be resolved
- **ref-cycle**: Report $ref cycles detected in the reference graph

## Usage

Rules are available through presets or can be individually imported from `blueprint`:

```typescript
import { rules, defaultPreset, sailpointPreset, recommended31 } from "blueprint";
```

### Presets

- **`defaultPreset`** (`@telescope-openapi/default`) - General OpenAPI best practices for all users. Recommended for most projects.
- **`sailpointPreset`** (`@telescope-openapi/sailpoint`) - Extends `defaultPreset` and adds SailPoint-specific rules:
  - `root-sailpoint-api` - Requires x-sailpoint-api extension
  - `operation-user-levels` - Requires x-sailpoint-userLevels extension
- **`recommended31`** (`@telescope-openapi/recommended-3.1`) - Backward compatibility preset (same as sailpointPreset)
