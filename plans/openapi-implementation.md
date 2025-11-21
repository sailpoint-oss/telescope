# OpenAPI Implementation Plan

## Overview

This plan outlines the implementation of the OpenAPI support for Telescope, leveraging the "Parse Once" architecture and Volar's Language Plugin system.

## Architecture

### 1. OpenAPI Language Plugin

**Goal**: Efficiently identify, parse, and structure OpenAPI documents.

-   **File Detection**:
    -   **Pattern Matching**: Use patterns from config (e.g., `**/*.openapi.yaml`) to identify *potential* OpenAPI files.
    -   **Exclusion**: These patterns should be excluded from the "Universal YAML/JSON Plugin".
-   **Parsing**:
    -   Parse the document *once* into an object/AST.
    -   **Schema Detection**: Analyze root-level keys (e.g., `openapi`, `swagger`, `paths`, `info`) to determine the specific OpenAPI version and type.
-   **Virtual Code**:
    -   Create a `VirtualCode` entry (e.g., `OpenApiCode`) implementing the shared `ParsedContent` interface.
    -   **Mappings**: Utilize Volar's mapping capabilities to map the `VirtualCode` back to the source text. potentially treating the content as standard YAML for basic linting/validation.
    -   **Reference Graph**: Build an internal reference graph resolving `$ref` pointers within and across files.

### 2. OpenAPI Validation Service

**Goal**: Apply schema-specific and complex rule validations.

-   **Input**: Consumes the `OpenApiCode` (Virtual Code) produced by the Language Plugin.
-   **Schema Validation**:
    -   Uses the detected schema type (from the plugin) to apply the correct JSON Schema validation (via the native YAML/JSON service).
-   **Rule Engine**:
    -   Traverses the `OpenApiCode` (and its reference graph) to run complex, workspace-aware rules.
    -   Supports both pre-written rulesets and user-defined custom rules.

### 3. Integration with Universal Flow

-   **Coexistence**: The OpenAPI plugin runs alongside the Universal YAML/JSON plugin.
-   **Exclusion Logic**: Files matched by the OpenAPI plugin are excluded from the Universal plugin to ensure single ownership and single parse.
-   **Unified Interface**: Both plugins produce `VirtualCode` adhering to a common interface (`ParsedContent`), allowing the generic Validation Service to handle basic tasks (like Zod validation) uniformly if needed.

## Implementation Steps

1.  **Config Update**: Add `openapi` section to `telescope.config.yaml` for defining OpenAPI file patterns.
2.  **Language Plugin**: Implement `OpenApiLanguagePlugin` to parse files and generate `OpenApiCode`.
3.  **Schema Detection**: Implement logic to identify OpenAPI versions/types from parsed content.
4.  **Reference Graph**: Implement `$ref` resolution and graph building.
5.  **Validation Service**: Create specific service logic (or extend existing ones) to consume `OpenApiCode` and run complex rules.

