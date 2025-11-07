# Test Files — OpenAPI fixture library

This workspace provides shared OpenAPI documents used across unit and integration tests. The fixtures cover positive and negative scenarios for rules, reference resolution, and language-server behaviours.

## Structure

### Root-Level Files

The root directory contains:

- **`api-v1.yaml`**, **`api-v2.yaml`**, **`api-v3.json`**: Partial OpenAPI documents that reference components in version-specific folders. These demonstrate real-world usage patterns where APIs are organized across multiple files.

- **`api-standalone.yaml`**: A fully self-contained OpenAPI specification with all components inline. Useful for testing basic validation and complete document parsing.

- **`api-minimal.yaml`**: A minimal valid OpenAPI document. Useful for testing root-level requirements.

- **`test-*.yaml`**: Focused test fixtures for specific rule validation. These are kept at root level for easy reference by unit tests.

### Version Folders (v1/, v2/, v3/)

Each version folder contains organized components that mirror real-world OpenAPI project structures:

- **`v1/`**: Contains valid examples covering positive test cases
  - All operations have proper structure (operationId, summary, description, tags)
  - Schemas include required properties, examples, descriptions
  - Parameters have examples, descriptions, formats
  - Proper security requirements and standard response codes

- **`v2/`**: Contains edge cases and warnings
  - Operations with short descriptions (warnings)
  - Tags with duplicates (warnings)
  - Summary exceeding 5 words (warnings)
  - Optional boolean parameters/properties without defaults (errors)

- **`v3/`**: Contains error cases
  - Missing required fields (operationId, description, summary)
  - Invalid formats (non-camelCase operationIds, invalid tag formats)
  - Missing examples, descriptions
  - Invalid schema structures (allOf conflicts, missing items)

Each version folder contains:
- `paths/` - Individual path item files (e.g., `pets.yaml`, `users.yaml`)
- `schemas/` - Schema component files (e.g., `Pet.yaml`, `User.yaml`)
- `components/` - Other component files (parameters, responses, examples, headers)
- `security/` - Security scheme definitions

## Naming Conventions

- `test-*` – Focused test fixtures for specific rule validation
- `api-*` – Comprehensive API examples demonstrating real-world patterns
- `valid-*` – Well-formed OpenAPI specifications
- `invalid-*` – Documents containing intentional violations for targeted rules
- `component-*` – Standalone component fragments used for `$ref` testing

## Using the Fixtures

- Unit tests import files directly via `createTestProjectFromExample("test-*.yaml")`
- Integration tests and the CLI load them through the host/loader pipeline
- Version-specific examples can be loaded via the root API files (e.g., `api-v1.yaml`)
- When adding rules, prefer extending existing fixtures or creating new ones close to the rule family they exercise

## Reference Paths

When using `$ref` in version folders, use relative paths:
- `./v1/schemas/User.yaml#/components/schemas/User`
- `../schemas/Pet.yaml#/components/schemas/Pet` (from within a path file)

Keep new fixtures concise and document the intent with comments so failures remain easy to triage.
