# Custom Rules Guide

Telescope supports multiple ways to extend its linting capabilities: built-in Go rules via the `RuleBuilder` API, Spectral-compatible YAML rulesets, Go plugins, and (future) Bun sidecar for TypeScript/JavaScript rules.

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
plugins:
  - ./rulesets/custom-rules.yaml
rules:
  my-custom-rule: error  # Override severity
  no-trailing-slash: off # Disable built-in rule
```

## Go Plugin SDK

Build standalone Go binaries that Telescope discovers and runs as subprocesses via `hashicorp/go-plugin` RPC.

### Plugin Structure

```go
// main.go
package main

import "github.com/sailpoint-oss/telescope/server/sdk"

func main() {
	p := sdk.NewPlugin("my-plugin", "1.0.0")

	sdk.Rule("my-rule", sdk.Meta{
		Description: "Operations must have summaries",
		Severity:    sdk.Warn,
		Category:    sdk.Documentation,
		Recommended: true,
	}).Operations(func(path, method string, op *sdk.Operation, r *sdk.Reporter) {
		if op.Summary.Text == "" {
			r.At(op.Loc, "%s %s needs a summary", method, path)
		}
	}).Register(p)

	p.Serve() // Blocks until host disconnects
}
```

### Installation

1. Build the plugin: `go build -o my-plugin .`
2. Place in `.telescope/plugins/` for automatic discovery
3. Or reference in `.telescope.yaml`:

```yaml
plugins:
  - .telescope/plugins/my-plugin
```

### SDK Types

The plugin SDK re-exports OpenAPI types and rule types so plugin code needs only the `sdk` import:

- `sdk.Document`, `sdk.Operation`, `sdk.Schema`, `sdk.Parameter`, etc.
- `sdk.Reporter`, `sdk.Meta`, `sdk.Category`
- `sdk.Error`, `sdk.Warn`, `sdk.Info`, `sdk.Hint`

## Bun Sidecar (TypeScript/JavaScript Rules)

TypeScript/JavaScript rules run in a Bun subprocess managed by `lsp/bun/Manager`. The sidecar starts lazily on first use (`sync.Once`) and includes health checks with crash recovery.

### IPC Protocol

Messages use newline-delimited JSON with an `Envelope` wrapper:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `loadRules` / `loadResponse` | Client → Sidecar → Client | Load TypeScript rules from file paths |
| `runRules` / `ruleResult` | Client → Sidecar → Client | Run loaded rules on a document |
| `runSpectral` / `spectralResult` | Client → Sidecar → Client | Run Spectral rulesets |
| `runZod` / `zodResult` | Client → Sidecar → Client | Run Zod overlay validation |
| `ping` / `pong` | Client → Sidecar → Client | Health check |
| `shutdown` | Client → Sidecar | Graceful shutdown |

### Runner Auto-Detection

`config.ResolveRunner()` determines whether a custom rule uses the Bun sidecar (`"bun"`) or native Go execution based on file extension (`.ts`, `.js` → bun) or explicit `runner` field.

## Zod Overlay Schemas

Custom validation for specific JSON pointer targets using Zod schemas. Schemas are dynamically loaded and cached by the Bun sidecar.

### Configuration

```yaml
# .telescope.yaml
zodSchemas:
  - schemaPath: ./schemas/info.ts
    pointers:
      - /info
  - schemaPath: ./schemas/paths.ts
    pointers:
      - /paths
```

### Schema Format

```typescript
// schemas/info.ts
import { z } from "zod";

export default z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Version must be semver"),
});
```

## Configuration Reference

### .telescope.yaml

```yaml
extends: telescope:recommended   # or telescope:all, telescope:owasp, telescope:strict
rules:
  rule-id: error | warn | info | hint | off
plugins:
  - ./path/to/ruleset.yaml
  - .telescope/plugins/my-plugin
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
