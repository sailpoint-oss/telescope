# Custom Rules Guide

Telescope supports multiple ways to extend its linting capabilities: built-in Go rules via the `RuleBuilder` API (for Telescope contributors), Spectral-compatible YAML rulesets, declarative YAML in `.telescope.yaml`, and Bun sidecar execution for TypeScript/JavaScript rules.

## Built-in Rule Development

### RuleBuilder API

Use `rules.Define()` to create a rule with metadata, then chain visitor methods and call `Register()`:

```go
package analyzers

import (
	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

func registerOperationSummary(s *gossip.Server) {
	rules.Define("operation-summary-required", rules.RuleMeta{
		Description: "Operations must have a summary",
		Severity:    ctypes.SeverityWarning,
		Category:    rules.CategoryDocumentation,
		Recommended: true,
	}).Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
		if op.Summary == "" {
			r.At(op.Loc, "%s %s is missing summary", method, path)
		}
	}).Register(s)
}
```

Then add `registerOperationSummary(s)` to `RegisterAll()` in `rules/analyzers/register.go`.

### Visitor Methods

| Method | Callback Signature | When Called |
|--------|-------------------|-------------|
| `Document` | `func(doc *Document, r *Reporter)` | Full document (top-level checks) |
| `Info` | `func(info *Info, r *Reporter)` | Document info object |
| `Paths` | `func(path string, item *PathItem, r *Reporter)` | Each path item |
| `Operations` | `func(path, method string, op *Operation, r *Reporter)` | Each operation |
| `Schemas` | `func(name string, schema *Schema, pointer string, r *Reporter)` | Top-level schemas |
| `RecursiveSchemas` | `func(name string, schema *Schema, pointer string, r *Reporter)` | All schemas (nested) |
| `Parameters` | `func(param *Parameter, r *Reporter)` | Each parameter |
| `Responses` | `func(code string, resp *Response, r *Reporter)` | Each response |
| `Tags` | `func(tag *Tag, r *Reporter)` | Each tag |
| `Servers` | `func(server *Server, r *Reporter)` | Each server |
| `RequestBodies` | `func(path, method string, rb *RequestBody, r *Reporter)` | Request bodies |
| `SecuritySchemes` | `func(name string, ss *SecurityScheme, r *Reporter)` | Security schemes |
| `Examples` | `func(name string, ex *Example, r *Reporter)` | Examples |
| `Custom` | `func(idx *Index, r *Reporter)` | Full index access |

### Reporter

Use `r.At(loc, format, args...)` to emit diagnostics:

```go
r.At(op.Loc, "missing operationId")
r.At(op.Loc, "%s %s needs a summary", method, path)
```

### Testing Rules

Use `rulestest.Run()` with exact diagnostic assertions:

```go
package myrules

import (
	"testing"

	"github.com/LukasParke/gossip/treesitter"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
	"github.com/sailpoint-oss/telescope/server/rules/testing/rulestest"
)

func TestOperationSummaryRequired(t *testing.T) {
	_, analyzer := rules.Define("operation-summary-required", rules.RuleMeta{
		Description: "Operations must have a summary",
		Severity:    ctypes.SeverityWarning,
	}).Operations(func(path, method string, op *openapi.Operation, r *rules.Reporter) {
		if op.Summary == "" {
			r.At(op.Loc, "missing summary")
		}
	}).Build()

	rulestest.Run(t, analyzer,
		rulestest.Case{
			Name: "flags missing summary",
			Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      responses:
        "200":
          description: OK`,
			Expect: []rulestest.Diag{
				{Line: 7, Code: "operation-summary-required", Severity: rulestest.Warn},
			},
		},
		rulestest.Case{
			Name: "passes when summary present",
			Spec: `openapi: "3.1.0"
info:
  title: Test
  version: "1.0"
paths:
  /users:
    get:
      operationId: listUsers
      summary: List users
      responses:
        "200":
          description: OK`,
			Expect: nil,
		},
	)
}
```

`rulestest.Diag` fields: `Line` (0-based), `Col` (0 = any), `Code`, `Severity`, `Message` (substring match).

## Spectral YAML Rulesets

Telescope supports Spectral-compatible YAML rulesets. No JavaScript execution — JSONPath expressions and built-in functions only.

### Example Ruleset

```yaml
# custom-rules.yaml
extends: telescope:recommended
rules:
  my-custom-rule:
    description: "Paths must use kebab-case"
    severity: warn
    given: "$.paths"
    then:
      field: "@key"
      function: pattern
      functionOptions:
        match: "^/[a-z0-9]+(-[a-z0-9]+)*$"
```

### Configuration

Reference in `.telescope.yaml`:

```yaml
extends: telescope:recommended
spectralRulesets:
  - ./rulesets/custom-rules.yaml
rules:
  my-custom-rule: error  # Override severity
  no-trailing-slash: off # Disable built-in rule
```

## Bun Sidecar (TypeScript/JavaScript Rules)

TypeScript/JavaScript rules run in a Bun subprocess managed by `lsp/bun/Manager`. Telescope ships a bundled sidecar script (`runner.js`) and launches it with the system `bun` executable when custom rules or Spectral rulesets are configured. If Bun is missing, Telescope keeps core validation/LSP features available and simply disables the sidecar-backed rule paths.

### Runtime Requirements

- Bun must be installed and available on `PATH`.
- Source-checkout workflows should bundle the sidecar once with `bash server/lsp/bun/runner/build.sh`.
- VS Code packaging uses `pnpm --filter ./client run build:sidecar` to copy the bundled script into the extension package.

### IPC Protocol

Messages use newline-delimited JSON with an `Envelope` wrapper:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `loadRules` / `loadResponse` | Client → Sidecar → Client | Load TypeScript rules from file paths |
| `runRules` / `ruleResult` | Client → Sidecar → Client | Run loaded rules on a document |
| `runSpectral` / `spectralResult` | Client → Sidecar → Client | Run Spectral rulesets |
| `ping` / `pong` | Client → Sidecar → Client | Health check |
| `shutdown` | Client → Sidecar | Graceful shutdown |

### Runner Auto-Detection

`config.ResolveRunner()` determines whether a custom rule uses the Bun sidecar (`"bun"`) or native Go execution based on file extension (`.ts`, `.js` → bun) or explicit `runner` field.

## JSON Schema Validation

For schema validation, Telescope uses the Go validator path. Configure JSON Schema files under `additionalValidation.schemas`:

```yaml
# .telescope/config.yaml
additionalValidation:
  my-group:
    patterns:
      - "custom/**/*.yaml"
    schemas:
      - schema: my-schema.json
```

## Configuration Reference

### .telescope.yaml

```yaml
extends: telescope:recommended   # or telescope:all, telescope:owasp, telescope:strict
rules:
  rule-id: error | warn | info | hint | off
spectralRulesets:
  - ./path/to/ruleset.yaml
include:
  - "**/*.yaml"
  - "**/*.json"
exclude:
  - "node_modules/**"
```

### Built-in Rulesets

| Ruleset | Description |
|---------|-------------|
| `telescope:recommended` | ~50 rules, balanced |
| `telescope:all` | ~56 non-OWASP rules |
| `telescope:owasp` | ~32 OWASP security rules |
| `telescope:strict` | recommended + OWASP |
