# Test Files

`test-files/` is the workspace used by sidecar E2E tests and custom validation
fixtures. It is intentionally separate from `server/testutil/specs`, which is
the canonical fixture source for Go tests.

## Fixture Ownership

Fixture ownership and status is tracked in `test-files/fixture-manifest.yaml`.

- `keep` - active fixtures with clear test/runtime ownership.
- `gap` - retained fixtures that should be asserted by tests.
- `removed` - stale fixtures removed from this repo.

## Canonical Source + Mirroring

- Canonical source for shared OpenAPI fixtures: `server/testutil/specs`.
- Sidecar workspace mirror location: `test-files/openapi`.
- Mirror integrity guard: `server/testutil/specs/mirror_sync_test.go`.

When updating a mirrored fixture:

1. edit `server/testutil/specs/<file>`
2. copy to `test-files/openapi/<file>`
3. run `cd server && go test ./testutil/specs -run TestMirroredFixturesStayInSync`

## Structure

```
test-files/
├── .telescope/                 # Sidecar config + custom rules/schemas
├── custom/                     # Non-OpenAPI validation fixtures
├── openapi/                    # Sidecar OpenAPI fixtures
├── fixture-manifest.yaml       # Ownership and lifecycle classification
└── README.md
```

## Reference Paths

When using `$ref` in nested folders, use relative file paths:

```yaml
$ref: "./v1/schemas/User.yaml#/components/schemas/User"
$ref: "../schemas/Pet.yaml#/components/schemas/Pet"
```

## Adding Fixtures

Every new fixture must include:

1. an owner suite (`sidecar-e2e`, `server-go-tests`, or `ci-smoke-only`)
2. expected diagnostic contract (error/warn/none, and key rule codes)
3. an update to `test-files/fixture-manifest.yaml`
4. at least one explicit test reference if the fixture is not CI-smoke-only
