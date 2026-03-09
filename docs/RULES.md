# Built-in Rules Reference

Telescope includes **88 built-in rules** organized by category. Each rule has a default severity and belongs to one or more rulesets.

## Rulesets

| Ruleset | Rules | Description |
|---------|-------|-------------|
| `telescope:recommended` | 50 | Curated rules for most projects (rules marked Recommended) |
| `telescope:all` | 56 | All non-OWASP rules |
| `telescope:owasp` | 32 | OWASP API security rules |
| `telescope:strict` | 82 | Recommended + OWASP combined |

## Rules by Category

### Naming (4 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `schema-name-capital` | Schema names should start with an uppercase letter. | Warning | Yes |
| `example-name-capital` | Example names should start with an uppercase letter. | Warning | Yes |
| `operation-operationId-unique` | Every operationId must be unique across the entire API. | Error | Yes |
| `tags-format` | Tags should follow a consistent naming format. | Warning | Yes |

### Documentation (17 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `deprecated-description` | Deprecated items should include a description explaining the deprecation. | Warning | Yes |
| `enum-description` | Enum schemas should include a description. | Warning | Yes |
| `deprecated-operation` | Deprecated operations are marked with strikethrough in the IDE. | Hint | Yes |
| `deprecated-schema` | Deprecated schemas are marked with strikethrough in the IDE. | Hint | Yes |
| `deprecated-ref-usage` | References to deprecated components are flagged. | Info | Yes |
| `operation-description` | Operations should have descriptions. | Warning | Yes |
| `operation-tags` | Operations should have at least one tag. | Warning | Yes |
| `operation-operationId` | Operations should have operationId. | Warning | Yes |
| `info-description` | Info should have a description. | Warning | Yes |
| `info-contact` | Info should have contact information. | Warning | Yes |
| `info-license` | Info should have license information. | Warning | Yes |
| `tag-description` | Tags should have descriptions. | Warning | Yes |
| `parameter-description` | Parameters should have descriptions. | Warning | No |
| `response-description` | Responses should have descriptions. | Warning | Yes |
| `schema-description` | Component schemas should have descriptions. | Warning | No |
| `description-markdown` | Description fields must contain valid CommonMark without structural issues. | Warning | Yes |
| `description-html` | Description fields should not contain raw HTML tags. | Warning | Yes |

### Paths (8 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `kebab-case` | Path segments should use kebab-case. | Warning | Yes |
| `path-keys-no-trailing-slash` | Paths should not have trailing slashes. | Warning | Yes |
| `no-http-verbs` | Path segments should not contain HTTP verbs. | Warning | Yes |
| `path-params` | Path parameters must match those declared in the operation. | Error | Yes |
| `path-declarations-must-exist` | Path templates must be syntactically valid. | Error | Yes |
| `id-unique-in-path` | Path parameter names must be unique within a path. | Error | Yes |
| `casing-consistency` | Path segments should use consistent casing across the API. | Warning | Yes |
| `path-param-values-no-generic-syntax` | Path parameter names should not use generic syntax like `<id>` or `:id`. | Warning | Yes |

### Structure (14 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `oas3-schema` | Validates the document structure against the OpenAPI JSON Schema. | Error | Yes |
| `additional-properties` | Object schemas should define additionalProperties explicitly. | Warning | Yes |
| `allof-mixed-types` | allOf should not combine schemas of different types. | Warning | Yes |
| `allof-structure` | allOf schemas must be structurally valid. | Warning | Yes |
| `array-items` | Array schemas must define items. | Error | Yes |
| `discriminator-mapping` | Discriminator mapping values must reference valid schemas. | Error | Yes |
| `request-body-content` | Request bodies must have content defined. | Error | Yes |
| `type-required` | Schemas should have a 'type' field defined. | Warning | Yes |
| `missing-error-responses` | Operations should define at least one error response (4xx or 5xx). | Warning | Yes |
| `no-request-body-on-get` | GET and HEAD operations should not have request bodies. | Warning | Yes |
| `unused-component` | Components defined but never referenced are unnecessary. | Warning | Yes |
| `response-body-on-delete` | DELETE operations typically should not return a response body. | Info | No |
| `missing-pagination` | List endpoints returning arrays should include pagination parameters. | Info | No |
| `inconsistent-error-shape` | Error responses should use a consistent schema across operations. | Info | No |

### Types (4 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `no-unknown-formats` | Schema format values should be known/standard formats. | Warning | Yes |
| `example-type-mismatch` | Example values should match the declared schema type. | Warning | Yes |
| `example-enum-mismatch` | Example values should be one of the declared enum values. | Warning | Yes |
| `migration-nullable` | In OpenAPI 3.1, use type array ['string', 'null'] instead of nullable: true. | Info | No |

### Security (4 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `no-api-key-in-query` | API keys should not be passed in query parameters. | Warning | Yes |
| `oauth-flow-urls` | OAuth flow URLs should be absolute and use HTTPS. | Warning | Yes |
| `security-global-or-operation` | Security should be defined globally or on every operation. | Warning | Yes |
| `security-schemes-defined` | Security requirements must reference defined security schemes. | Error | Yes |

### Servers (2 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `oas3-api-servers` | OpenAPI document should define at least one server. | Warning | Yes |
| `server-url-https` | Server URLs should use HTTPS. | Warning | Yes |

### References (1 rule)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `unresolved-ref` | Reports `$ref` values that cannot be resolved. | Error | Yes |

### Syntax (2 rules)

| Rule ID | Description | Severity | Rec |
|---------|-------------|----------|-----|
| `duplicate-keys` | Reports duplicate mapping keys in YAML/JSON objects. | Error | Yes |
| `ascii` | Reports non-ASCII characters that may cause interoperability issues. | Warning | Yes |

### OWASP (32 rules)

All OWASP rules are in the `telescope:owasp` ruleset. None are included in `telescope:recommended`.

| Rule ID | Description | Severity |
|---------|-------------|----------|
| `owasp-no-http-basic` | Security scheme should not use HTTP basic auth. | Warning |
| `owasp-no-api-keys-in-url` | API keys should not be in query or path. | Warning |
| `owasp-no-credentials-in-url` | URLs should not contain credentials. | Error |
| `owasp-auth-insecure-schemes` | Should not use insecure auth schemes (negotiate, oauth). | Warning |
| `owasp-jwt-best-practices` | JWT bearer tokens should follow best practices. | Warning |
| `owasp-short-lived-access-tokens` | OAuth2 flows should define refreshUrl for short-lived tokens. | Warning |
| `owasp-protection-global-unsafe` | Unsafe operations should have security defined. | Warning |
| `owasp-protection-global-safe` | All operations should have some security defined. | Info |
| `owasp-define-error-responses-401` | Operations should define 401 responses. | Warning |
| `owasp-define-error-responses-500` | Operations should define 500 responses. | Warning |
| `owasp-rate-limit` | Responses should define rate limit headers. | Warning |
| `owasp-rate-limit-retry-after` | 429 responses should include Retry-After header. | Warning |
| `owasp-rate-limit-responses-429` | Operations should define a 429 Too Many Requests response. | Warning |
| `owasp-define-error-validation` | Operations should define 422/400 responses for input validation. | Warning |
| `owasp-define-cors-origin` | Responses should define Access-Control-Allow-Origin header. | Warning |
| `owasp-no-scheme-http` | OAS 2.0 schemes must not include http. | Error |
| `owasp-no-server-http` | Server URLs must use HTTPS. | Error |
| `owasp-no-numeric-ids` | Avoid integer IDs; use UUIDs or random strings. | Warning |
| `owasp-no-additionalProperties` | Object schemas should restrict additional properties. | Warning |
| `owasp-constrained-additionalProperties` | Additional properties should have constraints. | Warning |
| `owasp-no-unevaluatedProperties` | Object schemas should set unevaluatedProperties to false (OAS 3.1+). | Warning |
| `owasp-constrained-unevaluatedProperties` | Unevaluated properties schema should have maxProperties. | Warning |
| `owasp-string-limit` | String schemas should define maxLength. | Warning |
| `owasp-string-restricted` | String schemas should specify format, pattern, enum, or const. | Warning |
| `owasp-array-limit` | Array schemas should define maxItems. | Warning |
| `owasp-integer-limit` | Integer schemas should define minimum and maximum bounds (OAS 3.1+). | Warning |
| `owasp-integer-limit-legacy` | Integer schemas should define minimum and maximum (OAS 2.0/3.0). | Warning |
| `owasp-integer-format` | Integer schemas should specify format (int32 or int64). | Warning |
| `owasp-admin-security-unique` | Admin endpoints should use distinct security schemes. | Warning |
| `owasp-concerning-url-parameter` | Parameters with URL-like names may be vulnerable to SSRF. | Info |
| `owasp-inventory-access` | Server objects should declare x-internal to indicate intended audience. | Warning |
| `owasp-inventory-environment` | Server descriptions should state the environment (production, staging, etc.). | Warning |

## Overriding Severities

Override any rule's severity in `.telescope.yaml`:

```yaml
extends: telescope:recommended

rules:
  # Upgrade to error
  operation-summary: error

  # Downgrade to info
  kebab-case: info

  # Disable entirely
  ascii: off

  # Enable an OWASP rule alongside recommended
  owasp-string-limit: warn
```

## Related Documentation

- [Configuration Reference](CONFIGURATION.md)
- [Custom Rules Guide](CUSTOM-RULES.md)
- [Server & SDK Reference](../server/README.md)
