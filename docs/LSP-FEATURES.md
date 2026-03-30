# LSP Features Reference

Telescope provides a full OpenAPI-focused LSP on top of a few supporting subsystems. This document describes the features that are actually wired today, where they come from, and what is optional versus always-on.

## Table of Contents

- [Overview](#overview)
- [Distribution](#distribution)
- [Core Navigation](#core-navigation)
- [Code Intelligence](#code-intelligence)
- [Refactoring](#refactoring)
- [UI Features](#ui-features)
- [Editing Support](#editing-support)
- [Validation](#validation)
- [Embedded Language Support](#embedded-language-support)
- [Commands](#commands)

## Overview

Telescope's LSP surface is split across a few distinct layers:

| Layer | Scope | What it actually provides |
| ----- | ----- | ------------------------- |
| **Telescope OpenAPI server** | OpenAPI YAML/JSON documents | Navigation, hover, completion, rename, formatting, semantic tokens, code actions, workspace symbols, call hierarchy, inlay hints, code lens, and Telescope-owned diagnostics |
| **Child YAML validator** | YAML documents routed through Telescope | Syntax and schema diagnostics from `yaml-language-server` |
| **Child JSON validator** | JSON documents routed through Telescope | Syntax and schema diagnostics from `vscode-json-language-server` |
| **Embedded Markdown support** | Markdown inside descriptions, summaries, and docs fields | Markdown parsing, document links, and extension-side syntax highlighting for fenced code blocks |
| **Optional Bun sidecar** | Workspaces that enable JS/TS custom rules | Additional diagnostics for Bun-backed custom rules when the sidecar is bundled and available |

The important distinction is that Telescope does **not** expose the child YAML/JSON servers as full generic editor services. Their completion, hover, and formatting features are disabled in Telescope; they are used as auxiliary validators.

### Capability Truth Table

| Capability | Telescope core | Child YAML/JSON | Bun sidecar |
| ---------- | -------------- | --------------- | ----------- |
| OpenAPI navigation and refactoring | Yes | No | No |
| OpenAPI completion, hover, and semantic tokens | Yes | No | No |
| YAML/JSON syntax and schema diagnostics | No | Yes | No |
| Generic YAML/JSON completion, hover, or formatting | No | Disabled | No |
| Embedded Markdown link handling and code-block highlighting | Yes | No | No |
| Spectral YAML ruleset diagnostics | Yes | No | No |
| TypeScript/JavaScript custom-rule diagnostics | No | No | Optional |

## Distribution

| Channel | Extension ID | Notes |
| ------- | ------------ | ----- |
| VS Code Marketplace | `SailPointTechnologies.telescope-openapi` | Official Microsoft VS Code listing |
| Open VSX | `sailpoint.telescope` | Used by Open VSX-compatible editors such as Cursor and VSCodium |

Platform-specific VSIXs currently bundle the Telescope server for `darwin-arm64`, `darwin-x64`, `linux-x64`, and `win32-x64`.

Universal VSIXs do not bundle the native server binary. On unsupported platforms such as Linux ARM64, Windows ARM64, or Alpine/musl environments, install the `telescope` binary separately and point the extension at it with `telescope.serverPath`, `TELESCOPE_SERVER_PATH`, or `PATH`.

## Core Navigation

### Go to Definition

**Trigger**: `Ctrl+Click` or `F12` on a symbol

Navigate to the definition of:

- **`$ref` references**: Jump to the referenced schema, parameter, or response
- **operationId references**: Navigate from links/callbacks to the operation definition
- **Security scheme references**: Jump from security requirements to scheme definitions
- **Tag references**: Navigate from operation tags to global tag definitions
- **Discriminator mappings**: Jump to referenced schemas in discriminator mappings

```yaml
# Ctrl+Click on "#/components/schemas/User" to jump to definition
schema:
  $ref: "#/components/schemas/User"
```

### Find All References

**Trigger**: `Shift+F12` or right-click → "Find All References"

Find all usages of:

- **Components**: Find all `$ref` pointers to a schema, parameter, or response
- **operationId**: Find all references in links, callbacks, and other locations
- **Include declaration**: Toggle to include/exclude the original definition

### Call Hierarchy

**Trigger**: `Shift+Ctrl+H` or right-click → "Show Call Hierarchy"

View reference relationships for OpenAPI components:

- **Incoming calls**: What references this component (dependents)
- **Outgoing calls**: What this component references (dependencies)

Useful for understanding schema relationships and refactoring impact.

## Code Intelligence

### Hover Information

**Trigger**: Hover over any element

Rich, context-aware hover for all OpenAPI elements:

**`$ref` hover** resolves all 8 component types (Schema, Parameter, Response, RequestBody, Header, Link, Example, PathItem) with full details:

- **Schema references**: Type, constraints (minLength, maxLength, minimum, maximum, pattern, minItems, maxItems, maxProperties), flags (deprecated, nullable, readOnly, writeOnly, const), default/example values, enum values, required fields, and property tables
- **Composition display**: allOf shows merged properties as a table; oneOf/anyOf show variant summaries with discriminator field if present
- **Parameter references**: Location (in: query/path/header/cookie), required/deprecated flags, type with format, enum values, example, description
- **Response references**: Description, content types with schema type hints (e.g., `application/json -> object`), headers list
- **Header/Link/Example references**: Full formatted details

**operationId hover** shows:

- HTTP method + path (e.g., `GET /users`)
- Deprecated flag, summary, and description (with heading outline for long descriptions)
- Tags used, parameter counts by location (path, query, header, cookie), response codes

**Security scheme hover**: Type, scheme, bearer format, location, name, description, OAuth flow details

**Tag hover**: Tag name, description, external docs

**Path item hover**: Path string, summary, list of operations with method + summary

```yaml
# Hover over the $ref value to see full schema details with constraints
$ref: "#/components/schemas/User"
```

### Completions

**Trigger**: `Ctrl+Space` or type trigger characters (`"`, `'`, `#`, `/`)

OpenAPI-specific completions for:

| Context               | Completions                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `$ref` values         | All available component references (`#/components/schemas/...`)    |
| Security requirements | Defined security scheme names                                      |
| Operation tags        | Global tag names with descriptions                                 |
| Response status codes | Common HTTP codes (200, 201, 400, 401, 404, 500, etc.)             |
| Media types           | `application/json`, `application/xml`, `multipart/form-data`, etc. |
| Schema properties     | Common patterns (id, uuid, email, created_at, etc.) with snippets  |
| Operation templates   | GET/POST/PUT/PATCH/DELETE skeletons                                 |
| HTTP headers          | X-Request-ID, ETag, Retry-After, etc.                               |

**Completion resolve** provides rich details when you select an item:

- **`$ref` completions**: Full target details (schema type, constraints, properties) shown in the detail panel
- **Security scheme completions**: Full scheme details (type, scheme, flows)
- **Tag completions**: Description + operation count using the tag

```yaml
responses:
  # Type Ctrl+Space to see status code suggestions
  200:
    content:
      # Type Ctrl+Space to see media type suggestions
      application/json:
```

### Inlay Hints

**Trigger**: Enabled by default (toggle via VS Code settings)

Visual hints displayed inline:

- **`$ref` type hints**: Shows `: <type>` after refs (e.g., `: object`, `: string`, `: array`)
- **Required property indicators**: Shows `*` before required schema properties with tooltip
- **Parameter location hints**: Shows `in: <location>` after parameter names
- **Deprecated schema markers**: `deprecated` label at schema name with tooltip
- **Deprecated operation markers**: `deprecated` label at operation location
- **Composition summary hints**:
  - allOf: `merged: {property1, property2, ...}` with property count tooltip
  - oneOf: `oneOf: Variant1 | Variant2 | ...` (or `discriminator: fieldName -> Variant1, Variant2, ...`)
  - anyOf: `anyOf: Variant1 | Variant2 | ...`

```yaml
schema:
  $ref: "#/components/schemas/User" # : object (inlay hint)
```

### Semantic Tokens

**Trigger**: Automatic (enhanced syntax highlighting)

Semantic highlighting for OpenAPI elements:

| Element          | Token Type      | Modifiers              | Example                        |
| ---------------- | --------------- | ---------------------- | ------------------------------ |
| HTTP methods     | `method`        | `deprecated` if marked | `get`, `post`, `put`, `delete` |
| Paths            | `namespace`     |                        | `/users/{id}`                  |
| Status codes     | `enum`          |                        | `200`, `404`, `default`        |
| `$ref` values    | `variable`      |                        | `#/components/schemas/User`    |
| Schema types     | `keyword`       |                        | `string`, `integer`, `array`   |
| operationId      | `function`      |                        | `getUserById`                  |
| Security schemes | `macro`         |                        | `bearerAuth`                   |
| Media types      | `string`        |                        | `application/json`             |
| Schema names     | `type`          | `deprecated`, `definition` | Component schema definitions |
| Tag names        | `type`          | `definition`           | Global tag definitions         |
| Path parameters  | `typeParameter` |                        | `{userId}`                     |

The `deprecated` modifier renders as strikethrough in VS Code, giving visual feedback for deprecated schemas and operations directly in the editor.

## Refactoring

### Rename Symbol

**Trigger**: `F2` or right-click → "Rename Symbol"

Safely rename across your entire workspace:

- **operationId**: Renames all references in links, callbacks, and the definition
- **Component names**: Updates the definition and all `$ref` pointers

The rename operation shows a preview before applying changes.

### Code Actions / Quick Fixes

**Trigger**: `Ctrl+.` or click the lightbulb icon

Available quick fixes:

| Diagnostic          | Quick Fix                                           |
| ------------------- | --------------------------------------------------- |
| Missing description | Add `description: "TODO: Add description"`          |
| Missing summary     | Add `summary: "TODO: Add summary"`                  |
| Missing operationId | Add auto-generated operationId based on path/method |
| Non-kebab-case path | Convert path to kebab-case                          |

Source actions:

- **Sort tags alphabetically**: Organize global tags in alphabetical order

```yaml
# Missing operationId diagnostic
get:
  # 💡 Quick fix: Add operationId: "getUsers"
  summary: Get all users
```

## UI Features

### Code Lens

**Trigger**: Displayed automatically above code

Inline information displayed above elements:

| Location                 | Code Lens                                              |
| ------------------------ | ------------------------------------------------------ |
| Schema definitions       | `N references` - click to show all references          |
| Operations               | `Responses: 200, 400, 404` - summary of response codes |
| Operations with security | `🔒 bearerAuth, apiKey` - required security schemes    |

```yaml
# [3 references]  ← Code lens showing reference count
User:
  type: object
  properties:
    id:
      type: string
```

### Document Symbols

**Trigger**: `Ctrl+Shift+O` or Outline view

Hierarchical view of document structure:

- Paths and operations
- Components (schemas, parameters, responses, etc.)
- Tags and security schemes

### Workspace Symbols

**Trigger**: `Ctrl+T` and type search query

Search across all OpenAPI files in your workspace:

- **Operations**: Search by operationId or `METHOD /path`
- **Components**: Search by component name
- **Schemas**: Search by schema name

Results show the containing file and component type.

## Editing Support

### Document Links

**Trigger**: `Ctrl+Click` on links

Clickable links for all `$ref` values:

- **Same-document references**: `#/components/schemas/User`
- **Relative file paths**: `./schemas/User.yaml`
- **External URLs**: `https://example.com/schemas/User.json`

Links navigate directly to the referenced location with precise line positioning.

### Folding Ranges

**Trigger**: Click fold icons in gutter or `Ctrl+Shift+[`

Collapse/expand regions:

- Objects and arrays
- Operations under paths
- Component sections

### Selection Ranges

**Trigger**: `Shift+Alt+→` to expand, `Shift+Alt+←` to shrink

Smart selection expansion based on document structure.

### Formatting

**Trigger**: `Shift+Alt+F` or right-click → "Format Document"

- **YAML**: On-type formatting with newline triggers
- **JSON**: Full document formatting with configurable options

### Document Colors

**Trigger**: Automatic for JSON files

Color picker for color values in JSON documents.

## Validation

### Real-time Diagnostics

**Trigger**: Automatic as you type

Validation sources:

1. **OpenAPI Rules**: 88 built-in rules covering best practices, security, and OWASP
2. **Schema Validation**: JSON Schema structural validation for OpenAPI 3.0/3.1/3.2
3. **Custom Rules**: Spectral-compatible YAML rulesets and Bun sidecar TS/JS rules
4. **Reference Validation**: `$ref` resolution and cycle detection

Diagnostic severities:

- 🔴 **Error**: Must be fixed
- 🟡 **Warning**: Should be addressed
- 🔵 **Information**: Suggestions
- ⚪ **Hint**: Style recommendations

### Workspace Diagnostics

**Trigger**: Automatic on file changes

Validates all OpenAPI files in your workspace:

- Incremental updates for changed files
- Cross-file reference validation
- operationId uniqueness checking
- Progress reporting for large workspaces (3+ root documents)

### Parse Error Diagnostics

YAML and JSON parse errors are surfaced as diagnostics with precise locations:

- Syntax errors (missing colons, invalid indentation)
- Invalid YAML/JSON structure
- Encoding issues

Parse errors appear immediately, even before OpenAPI rule validation runs.

### Progress Reporting

For workspaces with multiple OpenAPI root documents, Telescope shows progress in the VS Code status bar:

- "Analyzing OpenAPI workspace" with percentage
- Individual root progress (e.g., "Analyzing root 2/5")
- Automatic completion when all roots are processed

### Partial Results

Workspace symbol search (`Ctrl+T`) returns results incrementally:

- Results appear as they're found across files
- No need to wait for complete workspace scan
- Responsive even in large API projects

## Editing Support (Extended)

### Linked Editing Ranges

**Trigger**: Automatic when editing matching text (if supported by client)

Synchronized editing for related text spans within a single document:

- **`$ref` linked editing**: Edits all identical `$ref` values simultaneously
- **Tag linked editing**: Editing a root tag definition updates all operation tag usages (and vice versa)
- **operationId linked editing**: Editing an operationId definition updates link operationId references

Requires 2+ matching ranges to activate. Client must support `textDocument/linkedEditingRange`.

## Embedded Language Support

### Markdown in Descriptions

Full markdown language support in `description` and `summary` fields:

| Feature        | Support                            |
| -------------- | ---------------------------------- |
| Completions    | Link completions, path suggestions |
| Hover          | Markdown preview                   |
| Document links | Clickable URLs and file references |
| Diagnostics    | Link validation                    |
| Folding        | Markdown section folding           |
| Symbols        | Heading symbols                    |
| References     | Find markdown references           |
| Rename         | Rename links and references        |

### Code Block Syntax Highlighting

Fenced code blocks in descriptions get proper syntax highlighting for 21+ languages:

````yaml
description: |
  ## Example Request

  ```typescript
  const response = await fetch('/api/users');
  const users = await response.json();
````

```python
response = requests.get('/api/users')
users = response.json()
```

```

Supported languages:
- TypeScript, JavaScript, JSON
- Python, Ruby, PHP
- Go, Rust, Java, Kotlin, Swift
- C, C++, C#
- Shell/Bash, SQL
- HTML, CSS, XML
- YAML, GraphQL

## Commands

Available via Command Palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `OpenAPI: Classify Current Document` | Manually classify document as OpenAPI |
| `telescope: Convert JSON to YAML (Replace)` | Convert JSON file to YAML, delete original |
| `telescope: Convert JSON to YAML (Copy)` | Convert JSON file to YAML, keep original |
| `telescope: Convert YAML to JSON (Replace)` | Convert YAML file to JSON, delete original |
| `telescope: Convert YAML to JSON (Copy)` | Convert YAML file to JSON, keep original |
| `telescope: Show OpenAPI Files` | List all detected OpenAPI files |
| `telescope: Rescan Workspace` | Re-scan workspace for OpenAPI files |
| `telescope: Restart Server` | Restart the language server |

Context menu commands are also available when right-clicking on files in Explorer or Editor.

## Related Documentation

- [Configuration Reference](CONFIGURATION.md) - Configure patterns and rules
- [Custom Rules Guide](CUSTOM-RULES.md) - Create custom validation rules
- [Architecture](../ARCHITECTURE.md) - Technical implementation details
- [Built-in Rules](../server/README.md) - Rule reference
