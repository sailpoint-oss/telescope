---
name: OpenAPI path templating
overview: Bring Telescope’s OpenAPI path key validation and related path-parameter checks in line with the Path Templating (4.8.2) ABNF + constraints, and add enforcement for invalid path-param example/default values.
todos:
  - id: path-template-helper
    content: Create shared helper to parse/validate path templates, extract template params, and strip template expressions for other rules.
    status: completed
  - id: rule-path-template-valid
    content: Implement new `path-template-valid` OpenAPI rule that enforces ABNF + uniqueness and reports precise diagnostics.
    status: completed
  - id: update-path-rules
    content: Update `path-params-match` and path suggestion rules to use the helper (support embedded template expressions, unicode names, avoid false positives).
    status: completed
    dependencies:
      - path-template-helper
  - id: rule-path-param-values
    content: "Implement new rule to validate `in: path` parameter examples/defaults don’t contain unescaped `/ ? #`."
    status: completed
    dependencies:
      - path-template-helper
  - id: schema-openapi-32
    content: Relax OpenAPI 3.2 `PathString` schema so valid multi-segment paths are accepted; rely on the new rule for strictness.
    status: completed
  - id: tests
    content: Add/extend unit tests for the new rules and update schema validation tests for OpenAPI 3.2.
    status: completed
    dependencies:
      - rule-path-template-valid
      - update-path-rules
      - rule-path-param-values
      - schema-openapi-32
---

# OpenAPI Path Template Compliance

## Current repo state (so we don’t redo work)

- **Existing OpenAPI path rules already present**:
  - `path-params-match` (`packages/telescope-server/src/engine/rules/openapi/paths/params-match.ts`): checks `{param}` placeholders have matching `in: path` parameters declared (and naturally skips “empty path item” cases because it only reports when operations exist).
  - `path-kebab-case`, `path-no-http-verbs`, `path-casing-consistency`, `path-no-trailing-slash` under `packages/telescope-server/src/engine/rules/openapi/paths/`.
- **Schema key validation differs by version**:
  - OpenAPI **3.0/3.1/2.0** `Paths*Schema` keys are validated as “starts with `/` (path template) or `x-` (extension)” (per their module schemas).
  - OpenAPI **3.2** currently uses `PathString = z.string().regex(/^\\/[^/]+$/) `which incorrectly rejects multi-segment paths and `/` itself.

## Goals

- Validate `paths` keys as RFC3986-derived **path-template** strings per 4.8.2 (including embedded template expressions, unicode template param names, uniqueness, and correct percent-encoding).
- Ensure downstream path rules (`path-params-match`, casing/verb suggestions) correctly understand template expressions that appear *within* a segment.
- Enforce the 4.8.2 constraint on **path parameter values** (when expressible in the spec via `example` / `schema.example` / `default`): values must not contain unescaped `/`, `?`, or `#`.

## What we change

### 1) Add a shared path-template parser/helper

- Add a small helper module (e.g. [`packages/telescope-server/src/engine/rules/openapi/paths/path-template.ts`](packages/telescope-server/src/engine/rules/openapi/paths/path-template.ts)) that:
  - **Parses** a path template string with a brace-aware scan (so `/` inside `{...}` doesn’t split segments).
  - Validates:
    - starts with `/` (skip `x-` keys)
    - no `?`/`#` outside template expressions
    - no raw `{`/`}` outside template expressions
    - no empty segments (`//`) outside template expressions (but allow `/` and trailing `/`)
    - RFC3986 `pchar` for literals (ASCII unreserved/sub-delims/`:`/`@` and correct `%HH`)
    - template-expression names are **non-empty**, contain **no `{` or `}`**, and are **unique within the template**
  - Exposes:
    - `validatePathTemplate(path): { ok, error, errorIndex?, templateParams[] }`
    - `extractTemplateParams(path): string[]` (only for well-formed templates; for invalid templates, prefer returning `[]` to avoid noisy secondary diagnostics)
    - `stripTemplateExpressions(segment): string` (for the suggestion rules)

### 2) New rule: strict path-template validity

- Add a new OpenAPI rule (e.g. `path-template-valid`) under [`packages/telescope-server/src/engine/rules/openapi/paths/`](packages/telescope-server/src/engine/rules/openapi/paths/).
- It will iterate `Root.paths` keys and report **error** diagnostics for any key that violates 4.8.2 ABNF/constraints.
- Range behavior:
  - Best effort to highlight the specific offending character/portion inside the path key (similar to existing key-slice logic in `path-kebab-case`).

### 3) Update `path-params-match` to use the shared parser (and avoid cascaded errors)

- Update [`packages/telescope-server/src/engine/rules/openapi/paths/params-match.ts`](packages/telescope-server/src/engine/rules/openapi/paths/params-match.ts) to stop using the permissive regex extraction (`/\{([^}]+)\}/g`) and instead use the shared helper.

- Instead, call `extractTemplateParams()` from the helper so we correctly support:
  - embedded expressions (`/foo{bar}baz`)
  - unicode names
  - rejecting brace-containing names (the helper will never emit them)
- **Noise control**: if the helper determines the path template is invalid, `path-params-match` should not emit follow-on “missing parameter” errors for that path (the new `path-template-valid` rule will be the single source of truth for template syntax failures).

### 4) Make path suggestion rules template-aware (avoid false positives)

- Update these rules to treat `{...}` as “non-literal” even when embedded, by running checks against `stripTemplateExpressions(segment)` rather than assuming params are whole segments (currently they use `PATH_PARAM_PATTERN = /^\{[^}]+\}$/`).
  - [`packages/telescope-server/src/engine/rules/openapi/paths/kebab-case.ts`](packages/telescope-server/src/engine/rules/openapi/paths/kebab-case.ts)
  - [`packages/telescope-server/src/engine/rules/openapi/paths/casing-consistency.ts`](packages/telescope-server/src/engine/rules/openapi/paths/casing-consistency.ts)
  - [`packages/telescope-server/src/engine/rules/openapi/paths/no-http-verbs.ts`](packages/telescope-server/src/engine/rules/openapi/paths/no-http-verbs.ts)

This avoids incorrectly warning on segments like `users-{id}` or `foo{bar}baz`.

### 5) New rule: path parameter example/default values must not contain unescaped `/ ? #`

- Add a new OpenAPI rule (e.g. `path-param-values-no-generic-syntax`) that visits `Parameter` nodes where `in: path` and validates string values in:
  - `parameter.example`
  - `parameter.examples[*].value` (when string)
  - `parameter.schema.example`
  - `parameter.schema.default`
  - (optionally `parameter.content[*].example` if present and string)
- It reports an **error** when any of those strings contain literal `/`, `?`, or `#` (percent-encoded forms like `%2F`/`%2f` are allowed).
- Note: we’ll only validate values we can “see” in the spec (examples/defaults). We can’t generally prove runtime values comply.

### 6) Relax OpenAPI 3.2 schema path key restriction (to avoid false rejects)

- OpenAPI 3.2 currently hard-rejects most valid paths:
```2003:2006:packages/telescope-server/src/engine/schemas/openapi-3.2-module.ts
export const PathString = z.string().regex(/^\/[^/]+$/);

export const Paths32Schema = z.record(PathString, PathItem32Schema).meta({
```

- Replace this with a permissive “starts with `/` (or `x-`)” key check (matching 2.0/3.0/3.1), and rely on `path-template-valid` for strict ABNF enforcement.

### 7) Wire-up + docs

- Register the new rules in [`packages/telescope-server/src/engine/rules/openapi/index.ts`](packages/telescope-server/src/engine/rules/openapi/index.ts) so they run with the OpenAPI ruleset.
- Add them to [`packages/telescope-server/src/engine/rules/RULES.md`](packages/telescope-server/src/engine/rules/RULES.md).

## Tests we’ll add/update

- Add unit tests for `path-template-valid` covering:
  - valid: `/`, `/users/{id}`, `/users/{id}/posts/{postId}`, `/foo{bar}baz`, `/%7Bfoo%7D/{id}`
  - invalid: `//`, `/users//{id}`, `/users?x=1`, `/users#{frag}`, `/users/{}`, `/users/{a{b}}`, `/users/{id}/{id}`, bad percent encoding (`/%ZZ`), unmatched braces
- Extend `path-params-match` tests with an **embedded** template case to ensure we require params for `/foo{bar}baz`.
- Add tests for `path-param-values-no-generic-syntax`:
  - error on `example: "a/b"`, `"a?b"`, `"a#b"`
  - pass on `"a%2Fb"`, `"a%3Fb"`, `"a%23b"`
- Add/update a schema-validation test for OpenAPI 3.2 (in `packages/telescope-server/tests/lsp/openapi-schema-validation.test.ts`) that includes a multi-segment templated path and verifies it no longer fails structural parsing.

## Notes on scope

- We’ll enforce ABNF as a **rule error** (your preference), keeping Zod schemas permissive enough to not block indexing/linting.