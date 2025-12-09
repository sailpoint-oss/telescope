# Configuration Reference

Telescope is configured via `.telescope/config.yaml` in your workspace root. This document provides a complete reference for all configuration options.

## Quick Start

Create `.telescope/config.yaml`:

```yaml
openapi:
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/*.json"
    - "!**/node_modules/**"
```

## File Location

```
your-project/
├── .telescope/
│   ├── config.yaml           # Main configuration file
│   ├── rules/                # Custom rules directory
│   │   └── my-custom-rule.ts
│   └── schemas/              # Custom schemas directory
│       └── my-schema.ts
└── api/
    └── openapi.yaml
```

## Configuration Schema

```yaml
# OpenAPI validation configuration
openapi:
  # Glob patterns for OpenAPI files
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/*.json"
    - "!**/node_modules/**"
  
  # Enable SailPoint-specific rules (default: false)
  sailpoint: true
  
  # Override built-in rule severities
  rulesOverrides:
    operation-summary: warn
    parameter-description: error
    ascii-only: off
  
  # Register custom OpenAPI rules
  rules:
    - rule: my-custom-rule.ts
    - rule: another-rule.ts
      patterns:
        - "**/api/**/*.yaml"

# Non-OpenAPI file validation
additionalValidation:
  # Named validation group
  my-configs:
    patterns:
      - "configs/**/*.yaml"
    
    # Custom TypeBox schemas for validation
    schemas:
      - schema: my-schema.ts
        patterns:
          - "configs/app-*.yaml"
    
    # Custom generic rules
    rules:
      - rule: validate-config.ts
```

## OpenAPI Section

### `openapi.patterns`

Glob patterns that determine which files are treated as OpenAPI documents.

```yaml
openapi:
  patterns:
    - "**/*.yaml"           # Include all YAML files
    - "**/*.yml"            # Include all YML files
    - "**/*.json"           # Include all JSON files
    - "!**/node_modules/**" # Exclude node_modules
    - "!**/dist/**"         # Exclude dist directory
```

**Default patterns** (when not specified):
```yaml
patterns:
  - "**/*.yaml"
  - "**/*.yml"
  - "**/*.json"
  - "**/*.jsonc"
```

### `openapi.sailpoint`

Enable SailPoint-specific rules for enterprise API standards.

```yaml
openapi:
  sailpoint: true  # Adds 22 additional rules
```

| Value | Rules Loaded |
|-------|--------------|
| `false` (default) | 30 OpenAPI best practice rules |
| `true` | 52 rules (30 OpenAPI + 22 SailPoint) |

### `openapi.rulesOverrides`

Override severity levels for built-in rules.

```yaml
openapi:
  rulesOverrides:
    # Change to warning
    operation-summary: warn
    
    # Change to error
    parameter-description: error
    
    # Disable entirely
    ascii-only: off
```

**Valid severity values:**
- `error` - Must be fixed
- `warn` / `warning` - Should be addressed
- `info` - Informational
- `off` - Disable the rule

### `openapi.rules`

Register custom OpenAPI rules.

```yaml
openapi:
  rules:
    # Simple rule registration
    - rule: require-contact.ts
    
    # Rule with pattern override
    - rule: strict-descriptions.ts
      patterns:
        - "**/public-api/**/*.yaml"
      severity: error
```

Rule paths are relative to `.telescope/rules/`.

## Additional Validation Section

Configure validation for non-OpenAPI files (config files, custom YAML/JSON formats).

### Basic Structure

```yaml
additionalValidation:
  group-name:
    patterns:
      - "path/to/files/**/*.yaml"
    schemas:
      - schema: schema-file.ts
    rules:
      - rule: rule-file.ts
```

### Named Groups

Each group defines a set of patterns, schemas, and rules:

```yaml
additionalValidation:
  # Config file validation
  app-config:
    patterns:
      - "config/**/*.yaml"
    schemas:
      - schema: app-config-schema.ts
    rules:
      - rule: validate-env-vars.ts
  
  # CI/CD file validation
  ci-files:
    patterns:
      - ".github/workflows/**/*.yaml"
    rules:
      - rule: validate-workflow.ts
```

### Schema Validation

Register TypeBox schemas for structural validation:

```yaml
additionalValidation:
  my-group:
    patterns:
      - "configs/**/*.yaml"
    schemas:
      # Schema with inherited patterns
      - schema: base-config.ts
      
      # Schema with specific patterns
      - schema: app-config.ts
        patterns:
          - "configs/app-*.yaml"
```

### Generic Rules

Register rules for non-OpenAPI validation:

```yaml
additionalValidation:
  my-group:
    patterns:
      - "**/*.yaml"
    rules:
      # Rule with inherited patterns
      - rule: check-version.ts
      
      # Rule with specific patterns
      - rule: check-naming.ts
        patterns:
          - "**/components/**/*.yaml"
```

## Pattern Matching

Telescope uses Prettier-style glob patterns.

### Syntax

| Pattern | Description |
|---------|-------------|
| `*` | Matches any characters except `/` |
| `**` | Matches any number of directories |
| `?` | Matches a single character |
| `[abc]` | Character class |
| `{a,b}` | Brace expansion |
| `!` prefix | Exclusion pattern |

### Examples

```yaml
patterns:
  # All YAML files in api directory
  - "api/**/*.yaml"
  
  # YAML or JSON files
  - "**/*.{yaml,json}"
  
  # Exclude test files
  - "**/*.yaml"
  - "!**/*.test.yaml"
  - "!**/test/**"
  
  # Specific version directories
  - "api/v[1-3]/**/*.yaml"
```

### Pattern Evaluation

1. Files must match at least one positive pattern
2. Files are excluded if they match a negation pattern
3. Patterns are evaluated in order; last match wins
4. `.telescope/config.yaml` is always excluded from OpenAPI linting

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TELESCOPE_LOG_LEVEL` | Logging verbosity: `debug`, `info`, `warn`, `error` |
| `TELESCOPE_CONFIG_PATH` | Override config file location |

```bash
# Enable debug logging
TELESCOPE_LOG_LEVEL=debug code .
```

## Default Configuration

When no `.telescope/config.yaml` exists:

```yaml
openapi:
  patterns:
    - "**/*.yaml"
    - "**/*.yml"
    - "**/*.json"
    - "**/*.jsonc"
  sailpoint: false
  rulesOverrides: {}
  rules: []

additionalValidation: {}
```

## Configuration Reload

Configuration is automatically reloaded when:

- `.telescope/config.yaml` is modified
- Workspace folders change
- VS Code window regains focus

The server computes a configuration signature to detect changes and only reloads when necessary.

## Complete Example

```yaml
# .telescope/config.yaml

openapi:
  patterns:
    - "api/**/*.yaml"
    - "api/**/*.yml"
    - "schemas/**/*.json"
    - "!**/node_modules/**"
    - "!**/examples/**"
  
  sailpoint: true
  
  rulesOverrides:
    operation-summary: warn
    parameter-description: warn
    ascii-only: off
  
  rules:
    - rule: require-contact-info.ts
    - rule: enforce-versioning.ts
      patterns:
        - "api/v*/**/*.yaml"

additionalValidation:
  config-files:
    patterns:
      - "config/**/*.yaml"
    schemas:
      - schema: app-config-schema.ts
    rules:
      - rule: validate-secrets.ts
  
  github-workflows:
    patterns:
      - ".github/workflows/**/*.yaml"
    rules:
      - rule: validate-actions.ts
```

## Troubleshooting

### Config Not Loading

1. Verify file location: `.telescope/config.yaml`
2. Check YAML syntax: `bun -e "console.log(require('yaml').parse(require('fs').readFileSync('.telescope/config.yaml', 'utf8')))"`
3. Check the **Aperture Language Server** output channel for errors

### Patterns Not Matching

1. Use `**` for recursive matching
2. Ensure exclusions come after inclusions
3. Test patterns with `ls` or `find`:
   ```bash
   find . -name "*.yaml" -not -path "*/node_modules/*"
   ```

### Rules Not Running

1. Verify rule file exists in `.telescope/rules/`
2. Check for TypeScript compilation errors
3. Ensure the rule exports a default function

## Related Documentation

- [Custom Rules Guide](CUSTOM-RULES.md)
- [Built-in Rules](../packages/aperture-server/src/engine/rules/RULES.md)
- [Architecture](../ARCHITECTURE.md)

