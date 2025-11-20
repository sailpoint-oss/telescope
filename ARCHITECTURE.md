# Telescope Architecture Flow

This document outlines the exact flow of how all packages work together in Telescope.

## Package Interaction Flow

```mermaid
flowchart TB
    subgraph EntryPoints["Entry Points"]
        Aperture["Aperture LSP<br/>(packages/aperture-lsp)"]
    end

    subgraph LensLayer["Lens - Orchestration & Configuration"]
        Config["Config Resolution<br/>(lens/config.ts)"]
        ContextResolver["Context Resolver<br/>(lens/context/)"]
        DocumentCache["Document Type Cache<br/>(lens/context/)"]
    end

    subgraph LoaderLayer["Loader - Document Parsing"]
        Loader["loadDocument()<br/>(lens/src/load-document.ts)"]
        DocDetection["Document Detection<br/>(engine)"]
        SourceMaps["Source Maps<br/>(engine IR)"]
    end

    subgraph IndexerLayer["Indexer - Graph & Indexing"]
        RefGraph["buildRefGraph()<br/>(indexer/ref-graph.ts)"]
        ProjectIndex["buildIndex()<br/>(indexer/project-index.ts)"]
        GraphTypes["Graph Types<br/>(indexer/graph-types.ts)"]
    end

    subgraph EngineLayer["Engine - Rule Execution"]
        RuleFilter["filterRulesByContext()<br/>(engine/rule-filter.ts)"]
        RuleRunner["runEngine()<br/>(engine/runner.ts)"]
        RuleAPI["Rule API<br/>(engine/types.ts)"]
    end

    subgraph BlueprintLayer["Blueprint - Schemas & Rules"]
        Schemas["Zod Schemas<br/>(blueprint/schemas/)"]
        Rules["Rule Implementations<br/>(blueprint/rules/)"]
        Presets["Presets<br/>(blueprint/rules/presets.ts)"]
    end

    subgraph Output["Output"]
        Diagnostics["Diagnostics<br/>(engine/Diagnostic)"]
        Fixes["Code Fixes<br/>(engine/FilePatch)"]
    end

    %% Entry point flows
    Aperture -->|"1. Resolve workspace"| ContextResolver

    %% Configuration flow
    Config -->|"2a. resolveConfig()"| Presets
    Config -->|"2b. materializeRules()"| Rules
    Rules -->|"Uses"| Schemas
    Presets -->|"Contains"| Rules

    %% Context resolution flow
    ContextResolver -->|"3a. Check cache"| DocumentCache
    ContextResolver -->|"3b. Load documents"| Loader
    ContextResolver -->|"3c. Discover roots"| Loader
    DocumentCache -->|"Cache lookup"| DocDetection

    %% Document loading flow
    Loader -->|"Parse YAML/JSON"| SourceMaps
    Loader -->|"Detect type"| DocDetection
    Loader -->|"Returns ParsedDocument"| RefGraph

    %% Graph building flow
    RefGraph -->|"4a. Traverse $ref"| GraphTypes
    RefGraph -->|"4b. Build edges"| GraphTypes
    RefGraph -->|"4c. Create resolver"| ProjectIndex
    ProjectIndex -->|"5. Build indexes"| GraphTypes

    %% Engine execution flow
    ProjectIndex -->|"6. ProjectContext"| RuleFilter
    Rules -->|"6. Rule[]"| RuleFilter
    RuleFilter -->|"Filtered rules"| RuleRunner
    RuleRunner -->|"7. Execute visitors"| RuleAPI
    RuleAPI -->|"Uses"| Schemas
    RuleRunner -->|"8. Generate"| Diagnostics
    RuleRunner -->|"8. Generate"| Fixes

    %% Output flow
    Diagnostics -->|"LSP output"| Aperture
    Fixes -->|"LSP code actions"| Aperture

    %% Styling
    classDef entryPoint fill:#e1f5ff,stroke:#01579b,stroke-width:2px
    classDef lens fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef loader fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px
    classDef indexer fill:#fff9c4,stroke:#f57f17,stroke-width:2px
    classDef engine fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef blueprint fill:#e0f2f1,stroke:#004d40,stroke-width:2px
    classDef output fill:#f1f8e9,stroke:#33691e,stroke-width:2px

    class Aperture entryPoint
    class Config,ContextResolver,DocumentCache lens
    class Loader,DocDetection,SourceMaps loader
    class RefGraph,ProjectIndex,GraphTypes indexer
    class RuleFilter,RuleRunner,RuleAPI engine
    class Schemas,Rules,Presets blueprint
    class Diagnostics,Fixes output
```

## Detailed Flow Description

### Phase 1: Entry & Setup

1. **Aperture LSP** receives document URIs from VS Code
2. Uses Volar's FileSystem interface for file access

### Phase 2: Configuration & Context Resolution

3. **Lens** orchestrates the process:
   - **Config Resolution**: Reads configuration, resolves presets from `blueprint`, materializes rules
   - **Context Resolution**: Determines linting mode (project-aware, fragment, multi-root)
   - Uses **Document Type Cache** to avoid redundant type detection

### Phase 3: Document Loading

4. **Loader** reads files through Volar's **FileSystem**:
   - Parses YAML/JSON into AST
   - Builds IR (Intermediate Representation) with source maps for position tracking
   - Detects document type (root, fragment, unknown)
   - Returns `ParsedDocument` objects

### Phase 4: Graph & Index Building

5. **Indexer** processes documents:
   - **buildRefGraph()**: Traverses AST, finds all `$ref` references, builds dependency graph
   - Creates **Resolver** for dereferencing `$ref` values
   - **buildIndex()**: Builds reverse lookups (paths → operations, components → references, etc.)
   - Returns `ProjectContext` with docs, graph, index, and resolver

### Phase 5: Rule Execution

6. **Engine** executes rules:
   - **filterRulesByContext()**: Filters rules based on available context (project/fragment/multi-root)
   - **runEngine()**: Traverses project context, dispatches visitors from rules
   - Rules use **Blueprint schemas** for type safety
   - Rules access **Indexer** data structures for efficient traversal

### Phase 6: Output Generation

7. **Output** is generated:
   - **Diagnostics**: Rule violations with positions, messages, severity
   - **Fixes**: Optional code patches for auto-fixable issues
   - Diagnostics are sent back to VS Code via LSP protocol

## Key Package Responsibilities

- **lens**: Orchestration, configuration resolution, context management, document loading
- **indexer**: `$ref` graph building, reverse lookups, project indexing
- **engine**: Rule API, visitor pattern, rule filtering, execution, IR building
- **blueprint**: Zod schemas for OpenAPI types, rule implementations, presets
- **aperture-client**: VS Code extension client
- **aperture-lsp**: Volar-based language server (LSP server)

## Data Flow Summary

```
URIs → Volar FileSystem → Loader → ParsedDocuments
                                    ↓
                            Indexer (Graph + Index)
                                    ↓
                            ProjectContext
                                    ↓
                    Lens (Config + Context Resolution)
                                    ↓
                            Filtered Rules (Blueprint)
                                    ↓
                            Engine Execution
                                    ↓
                            Diagnostics + Fixes
                                    ↓
                            LSP Diagnostics
```
