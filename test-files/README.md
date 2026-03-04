# Test Files

This package provides shared OpenAPI documents used across Telescope's unit and integration tests.

## Structure

```
test-files/
├── openapi/              # OpenAPI test fixtures
│   ├── api-*.yaml        # Comprehensive API examples
│   ├── test-*.yaml       # Focused test cases for specific rules
│   └── v1/, v2/, v3/     # Version-specific component files
└── custom/               # Custom validation test files
    ├── custom-generic-*.yaml
    └── custom-zod-schema-*.yaml
```

## OpenAPI Fixtures

### Root-Level Files

| File                                        | Description                                 |
| ------------------------------------------- | ------------------------------------------- |
| `api-v1.yaml`, `api-v2.yaml`, `api-v3.json` | Partial specs referencing versioned folders |
| `api-standalone.yaml`                       | Fully self-contained OpenAPI spec           |
| `api-minimal.yaml`                          | Minimal valid OpenAPI document              |
| `test-*.yaml`                               | Focused test fixtures for specific rules    |

### Version Folders

| Folder | Purpose                                      |
| ------ | -------------------------------------------- |
| `v1/`  | Valid examples, proper structure and fields  |
| `v2/`  | Edge cases and warning scenarios             |
| `v3/`  | Error cases, missing fields, invalid formats |

Each version folder contains:

- `paths/` - Individual path item files
- `schemas/` - Schema component files
- `components/` - Parameters, responses, examples, headers
- `security/` - Security scheme definitions

## Naming Conventions

| Pattern       | Description                              |
| ------------- | ---------------------------------------- |
| `test-*`      | Focused test fixtures for specific rules |
| `api-*`       | Comprehensive API examples               |
| `valid-*`     | Well-formed specifications               |
| `invalid-*`   | Documents with intentional violations    |
| `component-*` | Standalone fragments for `$ref` testing  |

## Custom Rules

Telescope supports custom rules via **Go plugin binaries**. See the [Custom Rules documentation](../../docs/CUSTOM-RULES.md) and the example plugin at `server/examples/custom-plugin/main.go`.

## Reference Paths

When using `$ref` in version folders, use relative paths:

```yaml
# From root
$ref: './v1/schemas/User.yaml#/components/schemas/User'

# From within a path file
$ref: '../schemas/Pet.yaml#/components/schemas/Pet'
```

## Contributing

When adding new test fixtures:

- Keep fixtures concise and focused
- Document the intent with comments
- Prefer extending existing fixtures when possible
- Place new fixtures close to the rule family they test
