# Configuration v2

Telescope's canonical configuration file is now `.telescope/config.yaml`.

The `v2` layout is action-oriented: each top-level key maps to a user-facing capability such as linting, validation, testing, documentation, or generation. Telescope still accepts legacy root config files such as `.telescope.yaml`, but new work should use `.telescope/config.yaml`.

## File Layout

```text
repo/
├── .telescope/
│   ├── config.yaml
│   ├── rules/
│   ├── rulesets/
│   ├── schemas/
│   ├── overlays/
│   └── generated/
└── api/
    └── openapi.yaml
```

Path rules:

- Workspace file globs are resolved from the repo root.
- Telescope-owned asset paths are resolved from `.telescope/`.
- Output paths are resolved from the repo root unless you intentionally point them into `.telescope/generated/`.

## Quick Start

```yaml
configVersion: 2

workspace:
  ignore:
    - node_modules/**
    - vendor/**
    - .git/**
  envFiles:
    - .env
    - .env.local
  targets:
    apis:
      kind: openapi
      include:
        - api/**/*.{yaml,yml,json}
    telescopeConfig:
      kind: config
      include:
        - .telescope/config.yaml

linting:
  targets:
    - apis
  presets:
    - telescope:recommended
  overrides:
    no-trailing-slash: off
  engines:
    vacuum:
      enabled: true
      rulesets:
        - builtin: recommended
        - path: rulesets/vacuum.yaml
  rulesets:
    spectral:
      - rulesets/spectral.yaml

validation:
  openapi:
    targets:
      - apis
    targetVersion: "3.1"
    breakingChanges:
      enabled: true
      compareTo: HEAD
      onSave: true
      rules: rulesets/breaking.yaml
  files:
    telescopeConfig:
      targets:
        - telescopeConfig
      schema: schemas/telescope-config.v2.schema.json

testing:
  contract:
    enabled: true
    targets:
      - apis
    baseUrl: https://api.example.com
    concurrency: 4
    timeout: 60s
    credentials:
      ApiKeyAuth:
        apiKey:
          env: CONTRACT_API_KEY

documentation:
  printingPress:
    enabled: true
    targets:
      - apis
    output: docs
    preview:
      port: 9090
      theme: dark

extension:
  diagnostics:
    debounce: 300ms
    maxFileSize: 5MB

automation:
  ci:
    failOn: error
    failOnBreaking: true
    github:
      commentPR: true
    outputs:
      markdown: telescope-report.md
      json: telescope-report.json
      sarif: telescope-report.sarif
```

## Top-Level Sections

### `workspace`

Defines shared repo-wide concerns:

- `ignore`: global ignore globs
- `envFiles`: shared dotenv loading order
- `targets`: named file-selection sets reused by every action section

Supported target kinds:

- `openapi`
- `arazzo`
- `schema`
- `config`
- `files`

### `generation`

Holds code-to-spec and spec-assembly workflows:

- `openapi`: inline Cartographer configuration
- `bundle`: default output for bundled specs
- `overlays`: overlay files and output path

### `linting`

Controls rule presets, severity overrides, and lint engines.

- `presets`: one or more built-in Telescope presets
- `overrides`: per-rule severity overrides
- `engines.barrelman`
- `engines.vacuum`
- `rulesets.spectral`
- `customRules.bun`

Vacuum notes:

- `rulesets` currently supports the built-in `recommended` ruleset plus at most one custom path ruleset.
- Enabling Vacuum in `v2` adds it alongside Barrelman by default.

### `validation`

Separates structural/schema validation from linting.

- `openapi`: target version, required extensions, and semantic breaking-change checks
- `files`: JSON Schema validation for non-OpenAPI files
- `telescope`: reserved for Telescope-owned config validation policy

`validation.openapi.breakingChanges` is the canonical home for semantic diffing:

- `compareTo` is the Git ref used as the compatibility baseline
- `onSave` enables save-time breaking-change diagnostics in the extension
- `rules` points at optional breaking-change rules under `.telescope/`

### `formatting`

Reserved for Prettier and `prettier-plugin-openapi` configuration.

Current `v2` support stores the config shape and keeps it available for editor and CLI integrations. Telescope's built-in LSP formatter still handles the existing JSON/YAML normalization behavior.

### `testing`

Groups runtime verification flows:

- `contract`: live OpenAPI/Arazzo contract testing via Barometer
- `workflows`: workflow-target selection
- `mocks`: mock file generation and mock server defaults

Credential values can come from:

- `env`
- `file`
- `literal`

### `documentation`

Configures `printing-press` generation and preview defaults:

- output path
- preview port/theme
- title / binary / no-LLM / no-JSON / no-HTML options

### `extension`

Editor-only defaults:

- diagnostics debounce
- maximum file size
- trace level
- default lint engine / docs theme hints

### `automation`

CI/GitHub Action defaults:

- failure thresholds
- report scope
- PR commenting
- markdown / JSON / SARIF output paths

## CLI/LSP Behavior Mapped To v2

The `v2` layout is not just parsed; Telescope normalizes it into the current runtime model used by the CLI and language server.

Implemented mappings include:

- `linting` -> Barrelman/Vacuum engine selection, preset merging, severity overrides, Spectral rulesets, Bun custom rules
- `validation.openapi.breakingChanges` -> LSP save-time breaking-change diagnostics and manual "show breaking changes" commands
- `testing.contract` -> contract test defaults, credentials, TLS, Wiretap settings
- `documentation.printingPress` -> docs CLI defaults and live docs preview options
- `testing.mocks` -> mock CLI defaults
- `generation.bundle` / `generation.overlays` -> bundle and overlay CLI defaults
- `extension.diagnostics` -> LSP debounce and max file size

## Legacy Compatibility

Telescope still loads these legacy files:

1. `.telescope/config.yaml`
2. `.telescope/config.yml`
3. `.telescope.yaml`
4. `.telescope.yml`

Legacy root-level keys such as `extends`, `rules`, `spectralRulesets`, `additionalValidation`, `lsp`, and `contractTests` continue to work. New action-oriented config should prefer `configVersion: 2` in `.telescope/config.yaml`.

## Migration Guide

| Legacy | v2 |
| --- | --- |
| `extends` | `linting.presets` |
| `rules` | `linting.overrides` |
| `spectralRulesets` | `linting.rulesets.spectral` |
| `lint.engines` | `linting.engines.*` |
| `lint.vacuum` | `linting.engines.vacuum` |
| `openapi.targetVersion` | `validation.openapi.targetVersion` |
| `openapi.extensions.required` | `validation.openapi.extensions.required` |
| `additionalValidation` | `validation.files` |
| `lsp.diffOnSave` | `validation.openapi.breakingChanges.onSave` |
| `lsp.breakingRulesPath` | `validation.openapi.breakingChanges.rules` |
| `lsp.diffCompareBaseRef` | `validation.openapi.breakingChanges.compareTo` |
| `contractTests` | `testing.contract` |

## Notes

- `configVersion: 2` is required for the new layout.
- Unknown fields are rejected during config parsing.
- Repo-level asset paths should live under `.telescope/` for consistency and discoverability.
