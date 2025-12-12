# Built-in Validation Rules

This document lists all built-in validation rules for OpenAPI specifications.

## Architecture

Rules are organized into a three-tier validation system:

1. **Zod Schemas** - Enforce OpenAPI spec compliance (structural validity, required fields per spec)
2. **OpenAPI Rules** - Suggest best practices (warnings/info/hints for optional improvements)
3. **SailPoint Rules** - Require fields that OpenAPI says are optional but SailPoint mandates (errors)

## Severity Levels

| Severity  | LSP Type    | Use Case                                                   |
| --------- | ----------- | ---------------------------------------------------------- |
| `error`   | Error       | Structural issues, spec violations, SailPoint requirements |
| `warning` | Warning     | Best practices, important suggestions                      |
| `info`    | Information | Informational suggestions                                  |
| `hint`    | Hint        | Minor style suggestions                                    |

## OpenAPI Best Practice Rules (30 rules)

These rules suggest improvements for any OpenAPI specification. Most are warnings/info/hints.

### References (Structural)

| ID               | Severity | Description                                 |
| ---------------- | -------- | ------------------------------------------- |
| `unresolved-ref` | error    | Report $ref entries that cannot be resolved |

> **Note**: Circular `$ref` cycles are valid OpenAPI and are not flagged as errors.
> The engine handles cycles safely by treating `$ref` as a traversal boundary.

### Naming

| ID                               | Severity | Description                                                  |
| -------------------------------- | -------- | ------------------------------------------------------------ |
| `operationid-unique`             | warning  | operationId must be unique across the workspace              |
| `operation-id-unique-in-path`    | warning  | All operations within a path must have unique operationIds   |
| `component-schema-name-capital`  | info     | Schema names in components must start with a capital letter  |
| `component-example-name-capital` | info     | Example names in components must start with a capital letter |
| `operation-tags-format`          | info     | Operation tags should be Title Case with no duplicates       |

### Documentation

| ID                                 | Severity | Description                                          |
| ---------------------------------- | -------- | ---------------------------------------------------- |
| `operation-description-html`       | warning  | Operation descriptions must not contain raw HTML     |
| `operation-deprecated-description` | info     | Deprecated operations should explain the deprecation |
| `enum-description`                 | info     | Enum schemas should have descriptions                |

### Structure

| ID                               | Severity | Description                                                    |
| -------------------------------- | -------- | -------------------------------------------------------------- |
| `schema-allof-structure`         | warning  | Detects allOf used with type/nullable/properties at same level |
| `schema-allof-mixed-types`       | warning  | allOf compositions must not mix incompatible types             |
| `schema-array-items`             | warning  | Array schemas should define 'items'                            |
| `schema-type-required`           | info     | Schemas should explicitly declare a type                       |
| `discriminator-mapping-complete` | error    | Discriminator mappings should cover all oneOf schemas          |
| `additional-properties-defined`  | info     | Object schemas should explicitly define additionalProperties   |
| `operation-request-body-content` | warning  | Request bodies must define at least one content type           |

### Types

| ID                   | Severity | Description                            |
| -------------------- | -------- | -------------------------------------- |
| `string-max-length`  | hint     | String schemas should define maxLength |
| `no-unknown-formats` | info     | Only use standard JSON Schema formats  |

### Security

| ID                             | Severity | Description                                           |
| ------------------------------ | -------- | ----------------------------------------------------- |
| `security-schemes-defined`     | info     | API should define at least one security scheme        |
| `no-api-key-in-query`          | warning  | API keys should not be passed in query parameters     |
| `security-global-or-operation` | info     | Security must be defined at global or operation level |
| `oauth-flow-urls`              | error    | OAuth2 flows must have valid URLs                     |

### Servers

| ID                 | Severity | Description                             |
| ------------------ | -------- | --------------------------------------- |
| `servers-defined`  | info     | API should define at least one server   |
| `server-url-https` | warning  | Production server URLs should use HTTPS |

### Paths

| ID                        | Severity | Description                                                   |
| ------------------------- | -------- | ------------------------------------------------------------- |
| `path-params-match`       | error    | Path template params must be declared as in:'path' parameters |
| `path-no-trailing-slash`  | warning  | Paths should not end with trailing slashes                    |
| `path-kebab-case`         | info     | Path segments should use kebab-case                           |
| `path-no-http-verbs`      | warning  | Path segments should not contain HTTP verbs                   |
| `path-casing-consistency` | warning  | All paths should use consistent casing                        |

### Document

| ID               | Severity | Description                                              |
| ---------------- | -------- | -------------------------------------------------------- |
| `document-ascii` | warning  | Only ASCII characters are allowed in specification files |

---

## SailPoint Rules (22 rules)

These rules enforce SailPoint's business requirements. They require fields that OpenAPI says are optional.
Enable with `openapi.sailpoint: true` in `.telescope/config.yaml`.

### Operations

| ID                                | Severity | Description                                          |
| --------------------------------- | -------- | ---------------------------------------------------- |
| `operation-description-required`  | error    | Operations must include meaningful descriptions      |
| `operation-summary-required`      | error    | Operations must include a concise summary (≤5 words) |
| `tags-required`                   | error    | Operations must have at least one tag                |
| `operation-error-responses`       | error    | Operations must document standard error responses    |
| `operation-id-format`             | error    | operationId must follow SailPoint naming conventions |
| `operation-pagination`            | error    | GET operations returning arrays must have pagination |
| `operation-security-requirements` | error    | Operations must have security requirements           |
| `operation-user-levels`           | error    | Operations must specify user levels                  |

### Parameters

| ID                               | Severity | Description                                         |
| -------------------------------- | -------- | --------------------------------------------------- |
| `parameter-description-required` | error    | Parameters must include descriptions (≥8 chars)     |
| `parameter-example-required`     | error    | Parameters must provide example values              |
| `parameter-required-explicit`    | error    | Parameters must explicitly declare 'required'       |
| `parameter-example-keys`         | error    | Parameter examples must use standard keys           |
| `parameter-filters`              | error    | Filter parameters must follow SailPoint conventions |
| `parameter-sorters`              | error    | Sorter parameters must follow SailPoint conventions |

### Schemas

| ID                            | Severity | Description                                  |
| ----------------------------- | -------- | -------------------------------------------- |
| `schema-description-required` | error    | Schema properties must include descriptions  |
| `schema-example-required`     | error    | Schema properties must include examples      |
| `schema-required-array`       | error    | Object schemas must declare a required array |
| `schema-example-keys`         | error    | Schema examples must use standard keys       |

### Types

| ID                | Severity | Description                                      |
| ----------------- | -------- | ------------------------------------------------ |
| `numeric-format`  | error    | Integer/number types must declare valid formats  |
| `boolean-default` | error    | Optional boolean properties must define defaults |

### Root

| ID              | Severity | Description                                           |
| --------------- | -------- | ----------------------------------------------------- |
| `sailpoint-api` | error    | Document must include required x-sailpoint extensions |
| `root-tags`     | error    | Tags array must be present and sorted alphabetically  |

---

## Configuration

Override rule severities in `.telescope/config.yaml`:

```yaml
openapi:
  sailpoint: true # Enable SailPoint-specific rules
  rulesOverrides:
    # Turn off a rule
    string-max-length: off

    # Reduce severity
    path-kebab-case: warn
    schema-allof-structure: info

    # Increase severity (for OpenAPI rules)
    security-schemes-defined: error
```

---

## Directory Structure

```
rules/
├── api.ts, types.ts, index.ts
│
├── openapi/                    # Best practices (suggestions)
│   ├── references/             # $ref validation
│   ├── naming/                 # Naming conventions
│   ├── documentation/          # Doc quality
│   ├── structure/              # Schema structure
│   ├── types/                  # Type validation
│   ├── security/               # Security practices
│   ├── servers/                # Server config
│   ├── paths/                  # Path validation
│   └── document/               # Document-level
│
└── sailpoint/                  # Business requirements (errors)
    ├── operations/
    ├── parameters/
    ├── schemas/
    ├── types/
    └── root/
```
