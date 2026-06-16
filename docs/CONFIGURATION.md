> **Legacy only.** Canonical configuration schema: [CONFIGURATION-V2.md](CONFIGURATION-V2.md). Built-in rulesets and counts: [RULES.md](RULES.md).

Telescope's canonical configuration file is now `.telescope/config.yaml` using the action-oriented `configVersion: 2` layout.

See [Configuration v2](CONFIGURATION-V2.md) for the current recommended schema and examples.

This document remains as the legacy compatibility reference for the older root-level `.telescope.yaml` / `.telescope.yml` structure, which Telescope still loads for existing workspaces.

## Quick Start

Create `.telescope.yaml`:

```yaml
extends: telescope:recommended

include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"

exclude:
  - "node_modules/**"
```

## File Location

Telescope searches for configuration files in this priority order (see [CONFIGURATION-V2.md](CONFIGURATION-V2.md) § Legacy Compatibility for the authoritative list):

1. `.telescope/config.yaml`
2. `.telescope/config.yml`
3. `.telescope.yaml`
4. `.telescope.yml`

If no config file is found, sensible defaults are used.

```
your-project/
├── .telescope/
│   ├── config.yaml              # Preferred configuration file (v2)
│   ├── rules/
│   └── schemas/
└── api/
    └── openapi.yaml
```

## Configuration Schema

```yaml
# Base ruleset to extend
extends: telescope:recommended

# Override individual rule severities
rules:
  operation-summary: warn
  parameter-description: error
  ascii-only: off

# Spectral-compatible YAML rulesets to load
spectralRulesets:
  - .telescope/spectral-rules.yaml
  - ./more-rules.yaml

# Glob patterns for files to include
include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"

# Glob patterns for files to exclude
exclude:
  - "node_modules/**"
  - "vendor/**"
  - ".git/**"

# OpenAPI-specific configuration
openapi:
  targetVersion: "3.1"         # Target spec version: "3.0", "3.1", or "3.2"
  extensions:
    schemas:
      - x-custom-extension.json
    required:
      - x-company-auth

# Non-OpenAPI file validation
additionalValidation:
  config-files:
    patterns:
      - "config/**/*.yaml"
    schemas:
      - schema: app-config.json

# CLI output configuration
output:
  format: text                  # text, json, sarif, github
  color: auto                   # auto, always, never

# LSP server behavior
lsp:
  debounce: 300ms               # Diagnostic debounce delay
  maxFileSize: 5242880          # Max file size in bytes (5MB)
  schemaValidation:
    mode: go                    # go | bun | compare
```

## Top-Level Fields

### `extends`

Specifies a base ruleset to extend. All rules from the base are enabled at their default severities, then the `rules` section applies overrides.

```yaml
extends: telescope:recommended
```

**Built-in rulesets:**

| Name | Description |
| ---- | ----------- |
| `telescope:recommended` | Curated rules for most projects (default). See [RULES.md](RULES.md) for counts. |
| `telescope:all` | All non-OWASP rules |
| `telescope:owasp` | OWASP API security rules |
| `telescope:strict` | Recommended + OWASP combined |

### `rules`

Override severity levels for any rule (built-in or Spectral).

```yaml
rules:
  # Change to warning
  operation-summary: warn

  # Change to error
  parameter-description: error

  # Disable entirely
  ascii-only: off
```

**Valid severity values:**

| Value | Description |
| ----- | ----------- |
| `error` | Must be fixed |
| `warn` / `warning` | Should be addressed |
| `info` / `information` | Informational |
| `hint` | Style recommendations |
| `off` | Disable the rule |

### `spectralRulesets`

Load Spectral-compatible YAML rulesets. Paths are relative to the config file location.

```yaml
spectralRulesets:
  - .telescope/spectral-rules.yaml
  - ./company-rules.yaml
```

These rulesets use JSONPath and built-in functions for declarative validation. See [Custom Rules Guide](CUSTOM-RULES.md) for the Spectral rule format.

### `include`

Glob patterns for files Telescope should process.

```yaml
include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"
```

**Default** (when not specified): `["**/*.yaml", "**/*.yml", "**/*.json"]`

### `exclude`

Glob patterns for files to exclude from processing.

```yaml
exclude:
  - "node_modules/**"
  - "vendor/**"
  - ".git/**"
  - "**/test-fixtures/**"
```

**Default** (when not specified): `["node_modules/**", "vendor/**", ".git/**"]`

## OpenAPI Section

### `openapi.targetVersion`

Set the target OpenAPI specification version for version-specific validation.

```yaml
openapi:
  targetVersion: "3.1"   # "3.0", "3.1", or "3.2"
```

### `openapi.extensions`

Configure OpenAPI extension (`x-*`) validation.

```yaml
openapi:
  extensions:
    # JSON Schema files for custom extensions (from .telescope/extensions/)
    schemas:
      - x-custom-extension.json

    # Extension names that must be present in documents
    required:
      - x-company-auth
      - x-api-version
```

**Built-in extension support:**

Telescope includes built-in schemas for popular OpenAPI extensions:

- Redocly extensions (`x-logo`, `x-tagGroups`, etc.)
- Scalar extensions (`x-scalar-*`)
- Speakeasy extensions (`x-speakeasy-*`)
- Stoplight extensions (`x-stoplight-*`)

## Additional Validation

Configure validation for non-OpenAPI files using JSON Schema.

### Basic Structure

```yaml
additionalValidation:
  group-name:
    patterns:
      - "path/to/files/**/*.yaml"
    schemas:
      - schema: schema-file.json
```

### Named Groups

Each group defines a set of patterns and schemas:

```yaml
additionalValidation:
  # Config file validation
  app-config:
    patterns:
      - "config/**/*.yaml"
    schemas:
      - schema: app-config-schema.json

  # CI/CD file validation
  ci-files:
    patterns:
      - ".github/workflows/**/*.yaml"
    schemas:
      - schema: workflow-schema.json
```

### Schema with Pattern Overrides

```yaml
additionalValidation:
  my-group:
    patterns:
      - "configs/**/*.yaml"
    schemas:
      # Schema with inherited patterns
      - schema: base-config.json

      # Schema with specific patterns
      - schema: app-config.json
        patterns:
          - "configs/app-*.yaml"
```

## Output Section

Controls CLI output formatting.

```yaml
output:
  format: text    # text, json, sarif, github
  color: auto     # auto, always, never
```

| Format | Description |
| ------ | ----------- |
| `text` | Human-readable terminal output (default) |
| `json` | Machine-readable JSON |
| `sarif` | SARIF format for code analysis tools |
| `github` | GitHub Actions annotations |

## LSP Section

Controls LSP server behavior.

```yaml
lsp:
  debounce: 300ms        # Diagnostic debounce delay (default: 300ms)
  maxFileSize: 5242880   # Max file size in bytes (default: 5MB)
  schemaValidation:
    mode: go             # Schema validation backend (default: go)
```

`lsp.schemaValidation.mode` controls where structural schema validation runs:

- `go` - Existing Go validators publish diagnostics (default).
- `bun` - Legacy alias that normalizes to `go`.
- `compare` - Legacy alias that normalizes to `go`.

## Contract tests (`contractTests`)

Contract tests run OpenAPI operations (or Arazzo workflows) against a live base URL using the in-process Barometer engine. Configure credentials and transport options here; the same block is used by the LSP command `telescope.runContractTests` and the CLI `telescope contract test`.

### Static credentials (apiKey, Basic, Bearer, OAuth2 bearer token)

Map each **OpenAPI security scheme name** (keys under `components.securitySchemes`) to environment-backed values. Resolution order per scheme: LSP overrides, then `usernameEnv`+`passwordEnv` (concatenated as `user:pass` for HTTP Basic), then `apiKeyEnv`, `accessTokenEnv`, `basicAuthEnv`.

Each `*Env` value is read from **workspace dotenv** first (see `envFiles`), then the process environment. This matches how CI should inject secrets: GitHub Actions (or similar) sets `env:` entries with the same names your `.telescope.yaml` references—**never commit secrets**; use repository or environment secrets and name them consistently with `contractTests.credentials`.

Example:

```yaml
contractTests:
  defaultBaseUrl: https://api.example.com
  envFiles:
    - .env
    - .env.local
  skipTlsVerify: false
  requestTimeout: 60s
  credentials:
    ApiKeyAuth:
      apiKeyEnv: CONTRACT_API_KEY
    OAuth2:
      accessTokenEnv: CONTRACT_ACCESS_TOKEN
```

### OAuth2 token exchange (`strategy`)

When you prefer **client credentials** or **refresh token** grants instead of a pre-issued access token, set `strategy` on a scheme:

- `oauth2ClientCredentials` — POSTs `grant_type=client_credentials` to `oauth2TokenUrl`, or to `flows.clientCredentials.tokenUrl` from the spec when `oauth2TokenUrl` is omitted. Requires `clientIdEnv` and `clientSecretEnv`. Optional `oauth2Scopes` becomes a space-separated `scope` parameter.
- `oauth2Refresh` — POSTs `grant_type=refresh_token` using `refreshTokenEnv`, `clientIdEnv`, and `clientSecretEnv`. The token URL defaults to `oauth2TokenUrl`, or the spec’s authorization-code `tokenUrl` / `refreshUrl`.

Fetched access tokens are cached in-memory with TTL derived from `expires_in` (minus one minute). Static `accessTokenEnv` still wins when set.

### TLS / mTLS (`tls`)

For mutual TLS or a private CA bundle, set PEM paths (relative to the **workspace root** unless absolute):

```yaml
contractTests:
  tls:
    clientCertFile: certs/client.pem
    clientKeyFile: certs/client.key
    caCertFile: certs/ca.pem
```

`skipTlsVerify` still applies to server certificate verification when no custom CA is configured.

### Interactive OAuth / VS Code SecretStorage (not implemented)

Headless flows above cover CI and local `.env`. **Interactive** OAuth (browser login, device code) and storing refresh tokens in the VS Code Secret Storage are **not** implemented in the language server; the intended pattern is for the editor extension to obtain tokens and pass them as **credential overrides** on `telescope.runContractTests` when that workflow is added.

## Pattern Matching

Telescope uses glob patterns for file matching.

### Syntax

| Pattern | Description |
| ------- | ----------- |
| `*` | Matches any characters except `/` |
| `**` | Matches any number of directories |
| `?` | Matches a single character |
| `[abc]` | Character class |
| `{a,b}` | Brace expansion |

### Examples

```yaml
include:
  # All YAML files in api directory
  - "api/**/*.yaml"

  # YAML or JSON files
  - "**/*.{yaml,json}"

exclude:
  # Test files
  - "**/*.test.yaml"
  - "**/test/**"

  # Specific directories
  - "vendor/**"
  - "dist/**"
```

## Environment Variables

| Variable | Description |
| -------- | ----------- |
| `TELESCOPE_LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `TELESCOPE_CONFIG_PATH` | Override config file location |

```bash
# Enable debug logging
TELESCOPE_LOG_LEVEL=debug telescope lint api.yaml
```

## Default Configuration

When no config file is found, these defaults are used:

```yaml
extends: telescope:recommended

include:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"

exclude:
  - "node_modules/**"
  - "vendor/**"
  - ".git/**"

output:
  format: text
  color: auto

lsp:
  debounce: 300ms
  maxFileSize: 5242880
  schemaValidation:
    mode: go
```

## Configuration Reload

Configuration is automatically reloaded when:

- `.telescope.yaml` is modified
- Workspace folders change
- VS Code window regains focus

The server computes a configuration signature to detect changes and only reloads when necessary.

## Complete Example

```yaml
# .telescope.yaml

extends: telescope:recommended

rules:
  operation-summary: warn
  parameter-description: warn
  ascii-only: off
  require-security: error

spectralRulesets:
  - .telescope/spectral-rules.yaml

include:
  - "api/**/*.yaml"
  - "api/**/*.yml"
  - "schemas/**/*.json"

exclude:
  - "node_modules/**"
  - "**/examples/**"

openapi:
  targetVersion: "3.1"
  extensions:
    required:
      - x-company-auth

additionalValidation:
  config-files:
    patterns:
      - "config/**/*.yaml"
    schemas:
      - schema: app-config-schema.json

output:
  format: text
  color: auto

lsp:
  debounce: 500ms
  schemaValidation:
    mode: compare
```

## Troubleshooting

### Config Not Loading

1. Verify file location: `.telescope.yaml` in workspace root
2. Check YAML syntax is valid
3. Check the **Telescope Language Server** output channel in VS Code for errors

### Patterns Not Matching

1. Use `**` for recursive matching
2. Ensure patterns don't conflict between `include` and `exclude`
3. Check that file extensions match your patterns

### Rules Not Running

1. Verify the rule is enabled in your `extends` ruleset or explicitly in `rules`
2. Check that Spectral YAML rulesets are listed under `spectralRulesets` (paths must exist)
3. For Bun/TS custom rules, ensure the Bun sidecar can start and rule files are under `.telescope/` as documented

## Related Documentation

- [Custom Rules Guide](CUSTOM-RULES.md)
- [Architecture](../ARCHITECTURE.md)
- [Contributing](../CONTRIBUTING.md)
