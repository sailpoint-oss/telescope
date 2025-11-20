# Custom Validation Test Files

This directory contains test files for validating custom rules and schemas configured in `.telescope/config.yaml`.

## Test Files Overview

### Custom OpenAPI Rule Tests

Tests for the custom OpenAPI rule (`example-custom-openapi-rule.ts` or `example-custom-openapi-rule.js`) that requires all operations to have a `summary` field. Both TypeScript (`.ts`) and JavaScript (`.js`) rule files are supported.

- **`custom-openapi-valid.yaml`**: Valid OpenAPI file where all operations have `summary` fields
- **`custom-openapi-invalid.yaml`**: Invalid OpenAPI file where one operation is missing a `summary` field (should trigger error)

### Custom Generic Rule Tests

Tests for the custom generic rule (`example-generic-rule.ts` or `example-generic-rule.js`) that requires all objects to have a `version` field. Both TypeScript (`.ts`) and JavaScript (`.js`) rule files are supported.

- **`custom-generic-valid.yaml`**: Valid YAML file where all objects have `version` fields
- **`custom-generic-invalid.yaml`**: Invalid YAML file where objects are missing `version` fields (should trigger errors)

### Custom Schema Validation Tests

Tests for the custom JSON schema (`example-schema.json`) that validates configuration files.

- **`custom-schema-valid.yaml`**: Valid configuration file that matches the schema requirements
- **`custom-schema-invalid.yaml`**: Invalid configuration file missing required fields and violating constraints (should trigger schema validation errors)

## Configuration

The configuration in `.telescope/config.yaml` maps these test files to their respective validators:

```yaml
OpenAPI:
  rules:
    - rule: example-custom-openapi-rule.ts  # or .js
      pattern:
        - "**/custom-openapi-*.yaml"

AdditionalValidation:
  generic-rule:
    rules:
      - rule: example-generic-rule.ts  # or .js
        pattern:
          - "**/custom-generic-*.yaml"
```

**Note**: Both TypeScript (`.ts`) and JavaScript (`.js`) rule files are supported. When using Bun (the default runtime), TypeScript files are automatically transpiled. Make sure to include the file extension when specifying rule paths in the configuration.

## Expected Behavior

### Custom OpenAPI Rule
- `custom-openapi-valid.yaml`: Should pass validation (no errors)
- `custom-openapi-invalid.yaml`: Should fail with error: "Operation must have a summary field"

### Custom Generic Rule
- `custom-generic-valid.yaml`: Should pass validation (no errors)
- `custom-generic-invalid.yaml`: Should fail with errors: "Object at <pointer> must have a 'version' field"

### Custom Schema Validation
- `custom-schema-valid.yaml`: Should pass schema validation (no errors)
- `custom-schema-invalid.yaml`: Should fail with schema validation errors:
  - Missing required field: "name"
  - Missing required field: "version"
  - Missing required field: "settings.debug"
  - Invalid value: "timeout" must be >= 0

## Running Tests

These test files can be validated using the Telescope LSP server or CLI. The validation should automatically pick up the configuration from `.telescope/config.yaml` and apply the appropriate rules and schemas to matching files.

