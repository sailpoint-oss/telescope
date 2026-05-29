# Repository boundaries

Telescope is the **public, org-neutral LSP and lint** surface on top of Cartographer extraction. It is not the fleet orchestrator.

## Telescope owns (extraction path)

- `server/generation/` — wraps `cartographer/extraction` for `telescope generate` and IDE flows
- Per-checkout `.cartographer/cartographer.yaml` driven extraction
- Sourcemap sidecars when enabled

This is **generic single-repo extraction**, same boundary as Cartographer.

## Telescope owns (non-extraction)

- OpenAPI lint engine (`server/lintengine/`, `server/rules/`)
- LSP, diagnostics, presets, codemods
- Vendor-neutral telescope-native rules (`example-matches-format`, `contact-properties`, `license-url`)
- A pluggable rule-registration surface (`barrelman.RegisterPlugin` / `ApplyPlugins`) that downstream consumers use to inject their own rule packs without forking telescope

Lint rule IDs may use the `barrelman`-defined slug namespace (kebab-case OAS / OWASP / structural rules). Vendor-branded rule packs (e.g. `sailpoint-*` analyzers, layout policy rules) are registered by downstream consumers via the plug-in interface, not by telescope itself.

## Telescope must not own

- `services.yaml` / `repos.manifest` / multi-repo clone pipelines
- Fleet-wide rewrite, reconcile, or gateway route projection
- Building or versioning `reports/rights-mapping.json`
- Vendor-branded lint rules or `x-vendor-*` extension defaults
- Meridian-only reports under `services/<svc>/`

## Plug-in interface

Telescope's `RegisterAll` calls `barrelman.ApplyPlugins` after loading the generic analyzers. Downstream consumers register their rule pack like so:

```go
import (
    _ "private-consumer/lintrules/yourbrand" // init() calls barrelman.RegisterPlugin
)
```

The pack supplies a `RulePack` interface implementation:

```go
type Pack struct{}
func (Pack) Name() string                       { return "yourbrand" }
func (Pack) Register(reg *barrelman.Registry)   { /* register rules */ }

func init() { barrelman.RegisterPlugin(Pack{}) }
```

Private consumers can use this hook to attach organization-specific guideline
rules and layout policy rules without adding those checks to Telescope.

## Meridian

Fleet runs use `meridian pipeline`, which calls Telescope's generation API per cloned service. See Meridian `docs/REPO-BOUNDARIES.md`.

## Leak-guard

Telescope ships `.github/leak-guard/` (Bloom filter + shape-only patterns + check tool). PR CI fails on any hit. The denylist itself lives only in the downstream private orchestrator that produced the artefacts; the public repo cannot enumerate the underlying terms.
