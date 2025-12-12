10 more “minimal validity” OpenAPI rules (syntax/structure correctness)

Root version key required: require exactly one of openapi (OAS3) or swagger (OAS2), and it must be a non-empty string.

info required: require info is an object.

info.title required: non-empty string.

info.version required: non-empty string.

paths/webhooks presence: for OAS 3.1+, require at least one of paths or webhooks (and whichever exists must be an object).

Path keys valid: every paths key must start with / (and must not contain whitespace).

PathItem method keys only: under each PathItem, only allow valid HTTP methods + allowed PathItem fields (no typos like gets, postt).

Operation requires responses: every operation must have responses as an object.

Response keys valid: response keys must be default, 1XX..5XX, or 100..599 string form (reject invalid like 700 or 20).

Response requires description: every response object must have description as a non-empty string (per spec).

10 more SailPoint-specific rules (content + UX/best practices)

Summary style: summary must be concise verb-first (“List Accounts”), length bounds, no trailing period.

Description completeness: description must include at least: purpose, authorization behavior, and any side effects.

Consistent success codes: enforce SailPoint conventions (e.g., POST create -> 201 + body, DELETE -> 204 no body, async -> 202 + status link).

Standard error schema: all required error responses (400/401/403/429/500) must reference the standard SailPoint error schema (and not ad-hoc shapes).

429 UX: 429 response must document Retry-After (header in spec + description guidance).

Examples for consumers: every operation with a request body must include an example; every 2xx response with JSON must include an example.

Pagination response UX: list endpoints must document how to determine total/next page (e.g., X-Total-Count header or explicit total + offset/limit echo).

Filter/sorter guidance: filters/sorters descriptions must include at least one concrete example and explicitly state supported fields/ops (or link to canonical list).

Consistency of resource naming: enforce plural nouns for collection paths and stable resource identifiers (/accounts/{id} not /account/{accountId} + mixed).

Breaking-change safety: require operationId stability rules (no version suffixes, no renames without explicit deprecation notes), and require deprecated: true operations to include replacement guidance.