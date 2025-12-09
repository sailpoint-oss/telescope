# LSP Features Reference

Telescope provides comprehensive Language Server Protocol (LSP) features for OpenAPI documents, YAML/JSON files, and embedded Markdown content. This document details all available features and how to use them.

## Table of Contents

- [Overview](#overview)
- [Core Navigation](#core-navigation)
- [Code Intelligence](#code-intelligence)
- [Refactoring](#refactoring)
- [UI Features](#ui-features)
- [Editing Support](#editing-support)
- [Validation](#validation)
- [Embedded Language Support](#embedded-language-support)
- [Commands](#commands)

## Overview

Telescope implements LSP features through multiple specialized services:

| Service | Scope | Features |
|---------|-------|----------|
| **OpenAPI Service** | OpenAPI documents | 15 features including semantic tokens, call hierarchy |
| **YAML Service** | Generic YAML files | 11 features via yaml-language-server |
| **JSON Service** | Generic JSON files | 10 features via vscode-json-languageservice |
| **Markdown Service** | Embedded descriptions | 15 features via vscode-markdown-languageservice |
| **Validation Service** | Custom file validation | Diagnostics for custom rules/schemas |

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

- **`$ref` values**: Preview the referenced content inline
- **External URLs**: Display as external reference with link
- **Local references**: Show formatted YAML/JSON preview (truncated for large objects)

```yaml
# Hover over the $ref value to see User schema preview
$ref: "#/components/schemas/User"
```

### Completions

**Trigger**: `Ctrl+Space` or type trigger characters (`"`, `'`, `#`, `/`)

OpenAPI-specific completions for:

| Context | Completions |
|---------|-------------|
| `$ref` values | All available component references (`#/components/schemas/...`) |
| Security requirements | Defined security scheme names |
| Operation tags | Global tag names with descriptions |
| Response status codes | Common HTTP codes (200, 201, 400, 401, 404, 500, etc.) |
| Media types | `application/json`, `application/xml`, `multipart/form-data`, etc. |

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

- **`$ref` type hints**: Shows `→ object`, `→ array`, `→ allOf composition` after refs
- **Required property indicators**: Shows `*` before required schema properties

```yaml
schema:
  $ref: "#/components/schemas/User"  # → object (inlay hint)
```

### Semantic Tokens

**Trigger**: Automatic (enhanced syntax highlighting)

Semantic highlighting for OpenAPI elements:

| Element | Token Type | Example |
|---------|------------|---------|
| HTTP methods | `method` | `get`, `post`, `put`, `delete` |
| Paths | `namespace` | `/users/{id}` |
| Status codes | `enum` | `200`, `404`, `default` |
| `$ref` values | `variable` | `#/components/schemas/User` |
| Schema types | `keyword` | `string`, `integer`, `array` |
| operationId | `function` | `getUserById` |
| Security schemes | `macro` | `bearerAuth` |
| Media types | `string` | `application/json` |
| Deprecated flags | `modifier` | `deprecated: true` |
| Schema names | `type` | Component schema definitions |
| Path parameters | `typeParameter` | `{userId}` |

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

| Diagnostic | Quick Fix |
|------------|-----------|
| Missing description | Add `description: "TODO: Add description"` |
| Missing summary | Add `summary: "TODO: Add summary"` |
| Missing operationId | Add auto-generated operationId based on path/method |
| Non-kebab-case path | Convert path to kebab-case |

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

| Location | Code Lens |
|----------|-----------|
| Schema definitions | `N references` - click to show all references |
| Operations | `Responses: 200, 400, 404` - summary of response codes |
| Operations with security | `🔒 bearerAuth, apiKey` - required security schemes |

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

1. **OpenAPI Rules**: 38 built-in rules covering best practices
2. **Schema Validation**: Zod/JSON Schema structural validation
3. **Custom Rules**: Your `.telescope/rules/` TypeScript rules
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

## Embedded Language Support

### Markdown in Descriptions

Full markdown language support in `description` and `summary` fields:

| Feature | Support |
|---------|---------|
| Completions | Link completions, path suggestions |
| Hover | Markdown preview |
| Document links | Clickable URLs and file references |
| Diagnostics | Link validation |
| Folding | Markdown section folding |
| Symbols | Heading symbols |
| References | Find markdown references |
| Rename | Rename links and references |

### Code Block Syntax Highlighting

Fenced code blocks in descriptions get proper syntax highlighting for 21+ languages:

```yaml
description: |
  ## Example Request
  
  ```typescript
  const response = await fetch('/api/users');
  const users = await response.json();
  ```
  
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
| `Aperture: Convert JSON to YAML (Replace)` | Convert JSON file to YAML, delete original |
| `Aperture: Convert JSON to YAML (Copy)` | Convert JSON file to YAML, keep original |
| `Aperture: Convert YAML to JSON (Replace)` | Convert YAML file to JSON, delete original |
| `Aperture: Convert YAML to JSON (Copy)` | Convert YAML file to JSON, keep original |
| `Aperture: Show OpenAPI Files` | List all detected OpenAPI files |
| `Aperture: Rescan Workspace` | Re-scan workspace for OpenAPI files |
| `Aperture: Restart Server` | Restart the language server |

Context menu commands are also available when right-clicking on files in Explorer or Editor.

## Related Documentation

- [Configuration Reference](CONFIGURATION.md) - Configure patterns and rules
- [Custom Rules Guide](CUSTOM-RULES.md) - Create custom validation rules
- [Architecture](../ARCHITECTURE.md) - Technical implementation details
- [Built-in Rules](../packages/aperture-server/src/engine/rules/RULES.md) - Rule reference

