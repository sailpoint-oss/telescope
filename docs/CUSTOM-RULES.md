# Custom Rules Guide

Telescope supports two approaches for extending validation beyond the built-in rules:

| Approach | Use Case | Language |
| -------- | -------- | -------- |
| **Go Plugin Binaries** | Full programmatic access to the typed OpenAPI model | Go |
| **Spectral YAML Rulesets** | Declarative rules using JSONPath + built-in functions | YAML |

## Go Plugin Binaries

Custom rules are written as standalone Go binaries using the Telescope SDK. They run as isolated subprocesses via [hashicorp/go-plugin](https://github.com/hashicorp/go-plugin) RPC.

### Getting Started

1. Create a new Go module:

```bash
mkdir my-rules && cd my-rules
go mod init my-company/telescope-rules
go get github.com/sailpoint-oss/telescope/server/sdk
```

2. Write your plugin:

```go
// main.go
package main

import "github.com/sailpoint-oss/telescope/server/sdk"

func main() {
    p := sdk.NewPlugin("my-rules", "1.0.0")

    sdk.Rule("require-security", sdk.Meta{
        Description: "All operations must define a security requirement",
        Severity:    sdk.Error,
        Category:    sdk.Security,
        Recommended: true,
        HowToFix:    "Add a 'security' array to the operation or at the document root.",
    }).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
        if len(op.Security) == 0 {
            r.At(op.Loc, "%s %s has no security requirement defined", method, path)
        }
    }).Register(p)

    p.Serve()
}
```

3. Build and deploy:

```bash
go build -o my-rules .
mkdir -p /path/to/project/.telescope/plugins/
cp my-rules /path/to/project/.telescope/plugins/
```

Telescope automatically discovers and runs plugin binaries from `.telescope/plugins/`.

### Rule Metadata

Each rule is defined with `sdk.Rule(id, meta)` where `meta` has these fields:

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `Description` | `string` | Yes | Human-readable description of what the rule checks |
| `Severity` | `DiagnosticSeverity` | Yes | Default severity (`sdk.Error`, `sdk.Warn`, `sdk.Hint`) |
| `Category` | `Category` | Yes | Rule category (see below) |
| `Recommended` | `bool` | No | Include in `telescope:recommended` ruleset |
| `HowToFix` | `string` | No | Guidance on how to fix the issue |
| `DocURL` | `string` | No | URL to documentation about this rule |

**Categories:** `sdk.Naming`, `sdk.Documentation`, `sdk.Structure`, `sdk.Types`, `sdk.Security`, `sdk.Servers`, `sdk.Paths`, `sdk.References`, `sdk.Syntax`, `sdk.OWASP`

**Severities:** `sdk.Error`, `sdk.Warn`, `sdk.Hint` (also `sdk.SeverityError`, `sdk.SeverityWarning`, `sdk.SeverityInfo`, `sdk.SeverityHint`)

### Visitor Methods

Chain visitor methods on the rule builder to target specific parts of the OpenAPI document. Each visitor receives the typed OpenAPI model element and a `*sdk.Reporter` for reporting diagnostics.

| Method | Callback Signature | Description |
| ------ | ------------------ | ----------- |
| `.Document(fn)` | `func(doc *Document, r *Reporter)` | Full document (top-level checks) |
| `.Info(fn)` | `func(info *Info, r *Reporter)` | API metadata section |
| `.Paths(fn)` | `func(path string, item *PathItem, r *Reporter)` | Each path definition |
| `.Operations(fn)` | `func(path, method string, op *Operation, r *Reporter)` | Each HTTP operation |
| `.Schemas(fn)` | `func(name string, schema *Schema, pointer string, r *Reporter)` | Top-level schemas |
| `.RecursiveSchemas(fn)` | `func(name string, schema *Schema, pointer string, r *Reporter)` | All schemas including nested |
| `.Parameters(fn)` | `func(param *Parameter, r *Reporter)` | Each parameter |
| `.Responses(fn)` | `func(code string, resp *Response, r *Reporter)` | Each response |
| `.RequestBodies(fn)` | `func(path, method string, rb *RequestBody, r *Reporter)` | Each request body |
| `.Tags(fn)` | `func(tag *Tag, r *Reporter)` | Each tag definition |
| `.Servers(fn)` | `func(server *Server, r *Reporter)` | Each server definition |
| `.SecuritySchemes(fn)` | `func(name string, ss *SecurityScheme, r *Reporter)` | Each security scheme |
| `.Examples(fn)` | `func(name string, ex *Example, r *Reporter)` | Each component example |
| `.Custom(fn)` | `func(idx *Index, r *Reporter)` | Full index for arbitrary logic |

### Reporter API

The `*sdk.Reporter` provides methods for reporting diagnostics:

```go
// Report at a model element's location (uses rule's default severity)
r.At(op.Loc, "Operation %s %s is missing a summary", method, path)

// Report at an explicit LSP range
r.AtRange(rng, "Invalid value at this location")

// Report with overridden severity
r.Error(loc, "Critical: %s", msg)   // Always error
r.Warn(loc, "Consider: %s", msg)    // Always warning

// Chain enrichments before reporting
r.WithTags(protocol.DiagnosticTagDeprecated).At(loc, "Deprecated operation")
r.WithRelated(otherLoc, otherURI, "Related definition here").At(loc, "Conflict found")
r.WithData(myData).At(loc, "Issue with attached data")
```

### Composable Validators

The SDK exposes `sdk.V` for building reusable field validators:

```go
// Individual validators
sdk.V.Required()             // value must not be empty
sdk.V.MinLength(10)          // value must be at least 10 characters
sdk.V.MaxLength(100)         // value must be at most 100 characters
sdk.V.Pattern(regexp)        // value must match regex
sdk.V.OneOf([]string{...})   // value must be one of allowed values
sdk.V.TitleCase()            // value must start with uppercase
sdk.V.CamelCase()            // value must be camelCase
sdk.V.KebabCase()            // value must be kebab-case
sdk.V.Custom(fn, msg)        // custom validation function

// Combinators
sdk.V.All(v1, v2, v3)       // all validators must pass
sdk.V.Any(v1, v2)           // at least one must pass
sdk.V.Optional(v)           // skip if empty, validate if present

// Usage in a visitor
sdk.Rule("operation-id-camel", sdk.Meta{
    Description: "operationId should be camelCase",
    Severity:    sdk.Warn,
    Category:    sdk.Naming,
}).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
    result := sdk.V.All(
        sdk.V.Required(),
        sdk.V.CamelCase(),
    )(op.OperationID, "operationId")
    if !result.Valid {
        r.At(op.OperationIDLoc, "%s", result.Message)
    }
}).Register(p)
```

### Complete Example

This example plugin demonstrates multiple visitor types:

```go
package main

import (
    "strings"

    "github.com/sailpoint-oss/telescope/server/sdk"
)

func main() {
    p := sdk.NewPlugin("my-company-rules", "1.0.0")

    // Require security on all operations
    sdk.Rule("require-security", sdk.Meta{
        Description: "All operations must define a security requirement",
        Severity:    sdk.Error,
        Category:    sdk.Security,
        Recommended: true,
    }).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
        if len(op.Security) == 0 {
            r.At(op.Loc, "%s %s has no security requirement defined", method, path)
        }
    }).Register(p)

    // Enforce PascalCase schema names
    sdk.Rule("schema-pascal-case", sdk.Meta{
        Description: "Component schema names should use PascalCase",
        Severity:    sdk.Warn,
        Category:    sdk.Naming,
    }).Schemas(func(name string, s *sdk.Schema, _ string, r *sdk.Reporter) {
        result := sdk.V.TitleCase()(name, "schema name")
        if !result.Valid {
            r.At(s.Loc, "Schema %q should use PascalCase", name)
        }
    }).Register(p)

    // No trailing slashes in paths
    sdk.Rule("no-trailing-slash", sdk.Meta{
        Description: "API paths should not end with a trailing slash",
        Severity:    sdk.Warn,
        Category:    sdk.Paths,
        HowToFix:    "Remove the trailing '/' from the path.",
    }).Paths(func(path string, item *sdk.PathItem, r *sdk.Reporter) {
        if len(path) > 1 && strings.HasSuffix(path, "/") {
            r.At(item.PathLoc, "Path %q has a trailing slash", path)
        }
    }).Register(p)

    // Require HTTPS server URLs
    sdk.Rule("server-url-https", sdk.Meta{
        Description: "Server URLs should use HTTPS",
        Severity:    sdk.Warn,
        Category:    sdk.Servers,
    }).Servers(func(server *sdk.Server, r *sdk.Reporter) {
        if strings.HasPrefix(server.URL, "http://") {
            r.At(server.URLLoc, "Server URL %q uses HTTP; consider HTTPS", server.URL)
        }
    }).Register(p)

    p.Serve()
}
```

### Testing Plugin Rules

Use the `rulestest` package to test rules with exact diagnostic assertions:

```go
package main

import (
    "testing"

    "github.com/sailpoint-oss/telescope/server/rules/testing"
)

func TestRequireSecurity(t *testing.T) {
    // Get the rule builder, then build the analyzer
    rule := sdk.Rule("require-security", sdk.Meta{
        Description: "All operations must define a security requirement",
        Severity:    sdk.Error,
        Category:    sdk.Security,
    }).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
        if len(op.Security) == 0 {
            r.At(op.Loc, "%s %s has no security requirement defined", method, path)
        }
    })

    _, analyzer := rule.Build()

    rulestest.Run(t, analyzer,
        rulestest.Case{
            Name: "reports missing security",
            Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers`,
            Expect: []rulestest.Diag{
                {Line: 7, Code: "require-security", Severity: rulestest.Error},
            },
        },
        rulestest.Case{
            Name: "passes when security is defined",
            Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
security:
  - bearerAuth: []
paths:
  /users:
    get:
      operationId: listUsers`,
            Expect: []rulestest.Diag{},
        },
    )
}
```

Run tests with:

```bash
cd my-rules && go test ./...
```

---

## Spectral YAML Rulesets

Telescope supports Spectral-compatible YAML rulesets for declarative rules. These use JSONPath expressions to target document nodes and built-in validation functions -- no JavaScript execution required.

### Basic Structure

Create a YAML ruleset file:

```yaml
# my-rules.yaml
rules:
  operation-description:
    description: Operations should have a description
    message: "{{description}}"
    severity: warn
    given: "$.paths[*][get,post,put,patch,delete]"
    then:
      field: description
      function: truthy
```

### Rule Fields

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `description` | `string` | No | Human-readable description |
| `message` | `string` | No | Diagnostic message (supports `{{value}}`, `{{path}}`, `{{property}}` placeholders) |
| `severity` | `string` | No | `error`, `warn`, `info`, `hint` (default: `warn`) |
| `given` | `string` or `string[]` | Yes | JSONPath expression(s) targeting document nodes |
| `then` | `object` or `object[]` | Yes | Validation step(s) to apply at matched nodes |
| `formats` | `string[]` | No | Restrict to spec versions: `oas2`, `oas3`, `oas3_0`, `oas3_1` |
| `recommended` | `bool` | No | Whether the rule is recommended (default: `true`) |

### Built-in Functions

| Function | Description | Options |
| -------- | ----------- | ------- |
| `truthy` | Value must be truthy (non-null, non-empty) | -- |
| `falsy` | Value must be falsy | -- |
| `defined` | Value must exist | -- |
| `undefined` | Value must not exist | -- |
| `pattern` | Value must match regex | `match: "regex"` or `notMatch: "regex"` |
| `casing` | Value must follow naming convention | `type: "camel"`, `"pascal"`, `"kebab"`, `"snake"` |
| `length` | Value length constraints | `min: N`, `max: N` |
| `enumeration` | Value must be one of allowed values | `values: [...]` |
| `schema` | Value must match JSON Schema | `schema: {...}` |
| `alphabetical` | Array/object keys must be sorted | `keyedBy: "field"` |
| `or` | At least one field must be truthy | `properties: ["a", "b"]` |
| `xor` | Exactly one field must be truthy | `properties: ["a", "b"]` |
| `typedEnum` | Enum values must match declared type | -- |
| `unreferencedReusableObject` | Component must be referenced | -- |

### JSONPath Expressions

| Expression | Description |
| ---------- | ----------- |
| `$` | Document root |
| `$.info` | Info object |
| `$.paths[*]` | All path items |
| `$.paths[*][get,post,put,patch,delete]` | All operations |
| `$.components.schemas[*]` | All component schemas |
| `$.paths[*][*].parameters[*]` | All operation parameters |
| `$.paths[*][*].responses[*]` | All responses |

### Example: Custom Spectral Ruleset

```yaml
# .telescope/spectral-rules.yaml
rules:
  # Require descriptions on operations
  operation-description:
    description: Every operation must have a description
    severity: warn
    given: "$.paths[*][get,post,put,patch,delete]"
    then:
      field: description
      function: truthy

  # Enforce kebab-case paths
  path-kebab-case:
    description: Paths should use kebab-case
    severity: warn
    given: "$.paths"
    then:
      field: "@key"
      function: pattern
      functionOptions:
        match: "^(/[a-z0-9-{}]+)+$"

  # Require contact info
  info-contact:
    description: API must include contact information
    severity: error
    given: "$.info"
    then:
      field: contact
      function: defined

  # Limit tag count
  operation-tag-count:
    description: Operations should have 1-3 tags
    severity: warn
    given: "$.paths[*][get,post,put,patch,delete].tags"
    then:
      function: length
      functionOptions:
        min: 1
        max: 3
```

### Registering Spectral Rulesets

Reference Spectral YAML rulesets in your `.telescope.yaml` config:

```yaml
# .telescope.yaml
extends: telescope:recommended

plugins:
  - ./spectral-rules.yaml
  - ./more-rules.yaml

rules:
  operation-description: error  # Override severity
```

---

## Configuration

### Plugin Binaries

Place compiled Go binaries in `.telescope/plugins/`:

```
your-project/
├── .telescope/
│   └── plugins/
│       ├── my-rules        # Compiled Go plugin binary
│       └── other-rules     # Another plugin binary
├── .telescope.yaml          # Configuration file
└── api/
    └── openapi.yaml
```

### Spectral Rulesets

Reference YAML rulesets via the `plugins` field in `.telescope.yaml`:

```yaml
# .telescope.yaml
extends: telescope:recommended

plugins:
  - .telescope/spectral-rules.yaml

rules:
  my-custom-rule: error   # Override any rule's severity
  another-rule: off        # Disable a rule
```

### Severity Overrides

Override any rule's severity (built-in, plugin, or Spectral) in `.telescope.yaml`:

```yaml
rules:
  require-security: error
  schema-pascal-case: warn
  operation-description: off
```

Valid values: `error`, `warn` / `warning`, `info`, `hint`, `off`

---

## Best Practices

### Rule Design

1. **Target a single concern** per rule -- keep rules focused and composable
2. **Provide clear messages** -- include the offending value and what's expected
3. **Use appropriate severity** -- reserve `error` for breaking issues
4. **Add `HowToFix`** -- help users understand how to resolve the issue
5. **Set `Recommended: true`** for rules that apply broadly

### Performance

1. **Early returns** -- skip processing when fields are valid
2. **Use specific visitors** -- prefer `.Operations()` over `.Custom()` when possible
3. **Avoid heavy computation** -- rules run on every document change in the LSP

### Error Messages

```go
// Good: Specific and actionable
r.At(op.Loc, "GET /users is missing a summary")

// Bad: Vague and unhelpful
r.At(op.Loc, "Missing field")
```

---

## Related Documentation

- [Configuration Reference](CONFIGURATION.md)
- [Architecture](../ARCHITECTURE.md)
- [Server & SDK Reference](../server/README.md)
- [Contributing](../CONTRIBUTING.md)
