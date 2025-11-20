Aperture Language Server starting...
Starting inspector on 127.0.0.1:6009 failed: address already in use
[OpenAPI Service] Creating OpenAPI service plugin
[Additional Validation] Creating validation service plugin
[Server] Initializing with 2 language service plugin(s)
[Server] Connection initialized - registering 2 plugin(s)
[Server] Server capabilities initialized - textDocumentSync: 2
[Server] Server initialization complete
✅ Aperture extension activated
[Server] Connection initialized - calling server.initialized()
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[Workspace Diagnostics] Performing initial workspace scan...
[Workspace Diagnostics] Found 67 potential OpenAPI files, validating...
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - excluded by config patterns
[Workspace Diagnostics] Skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - excluded by config patterns
[Workspace Diagnostics] Initial scan complete: 45 valid OpenAPI file(s), 22 skipped
[Workspace Diagnostics] Processing 45 file(s) in batches
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml
[OpenAPI Service] Returning 2 diagnostic(s) (0 schema, 2 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml does not match group "generic-rule" patterns
[Server] Registered file watchers for OpenAPI files: **/*.yaml, **/*.yml, **/*.json
[Server] Registered file watchers for config files: .telescope/config.yaml
[Workspace Diagnostics] Completed in 109ms: 45 processed, 0 skipped, 45 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 5ms: 5 processed, 0 skipped, 1 report(s)
[Context] reloadConfiguration skipped - configuration signature unchanged (b69b34b60a2837c52ee55f91fb146be2f032fad5)
[Server] Configuration change event at 2025-11-14T22:25:24.165Z but signature unchanged (b69b34b60a2837c52ee55f91fb146be2f032fad5) - skipping reload
[Context] reloadConfiguration skipped - configuration signature unchanged (b69b34b60a2837c52ee55f91fb146be2f032fad5)
[Server] Configuration change event at 2025-11-14T22:25:24.168Z but signature unchanged (b69b34b60a2837c52ee55f91fb146be2f032fad5) - skipping reload
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml
[OpenAPI Service] Returning 2 diagnostic(s) (0 schema, 2 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Fapi-v1.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 44 file(s) in batches
[Workspace Diagnostics] Completed in 57ms: 44 processed, 0 skipped, 44 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 4ms: 5 processed, 0 skipped, 1 report(s)
[Workspace Diagnostics] Processing 22 file(s) in batches
[Workspace Diagnostics] Completed in 32ms: 22 processed, 0 skipped, 22 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 3ms: 5 processed, 0 skipped, 1 report(s)
[Workspace Diagnostics] Processing 22 file(s) in batches
[Workspace Diagnostics] Completed in 31ms: 22 processed, 0 skipped, 22 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 3ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-document-valid.yaml
[OpenAPI Service] Returning 1 diagnostic(s) (0 schema, 1 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-document-valid.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-document-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-document-valid.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 23 file(s) in batches
[Workspace Diagnostics] Completed in 28ms: 23 processed, 0 skipped, 23 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 3ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-duplicate-operation-ids.yaml
[OpenAPI Service] Returning 12 diagnostic(s) (0 schema, 12 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-duplicate-operation-ids.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-duplicate-operation-ids.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-duplicate-operation-ids.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 23 file(s) in batches
[Workspace Diagnostics] Completed in 27ms: 23 processed, 0 skipped, 23 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 3ms: 5 processed, 0 skipped, 1 report(s)
[Workspace Diagnostics] Processing 23 file(s) in batches
[Workspace Diagnostics] Completed in 31ms: 23 processed, 0 skipped, 23 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 3ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-multi-file.yaml
[OpenAPI Service] Returning 4 diagnostic(s) (0 schema, 4 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-multi-file.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-multi-file.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-multi-file.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 23 file(s) in batches
[Workspace Diagnostics] Completed in 29ms: 23 processed, 0 skipped, 23 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 2ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-audience-is-missing.yaml
[OpenAPI Service] Returning 1 diagnostic(s) (0 schema, 1 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-audience-is-missing.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-audience-is-missing.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-audience-is-missing.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 23 file(s) in batches
[Workspace Diagnostics] Completed in 32ms: 23 processed, 0 skipped, 23 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 4ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-root-valid.yaml
[OpenAPI Service] Returning 0 diagnostic(s) (0 schema, 0 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-root-valid.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-root-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-root-valid.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 23 file(s) in batches
[Workspace Diagnostics] Completed in 28ms: 23 processed, 0 skipped, 23 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 2ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-missing.yaml
[OpenAPI Service] Returning 1 diagnostic(s) (0 schema, 1 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-missing.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-missing.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-error-when-missing.yaml does not match group "generic-rule" patterns
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[Workspace Diagnostics] Processing 24 file(s) in batches
[Workspace Diagnostics] Completed in 28ms: 24 processed, 0 skipped, 24 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 3ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-ref-cycle-main.yaml
[OpenAPI Service] Returning 1 diagnostic(s) (0 schema, 1 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-ref-cycle-main.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-ref-cycle-main.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-ref-cycle-main.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 24 file(s) in batches
[Workspace Diagnostics] Completed in 27ms: 24 processed, 0 skipped, 24 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 2ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-tags-should-error-when-tags-are-not-alphabetically-sort.yaml
[OpenAPI Service] Returning 3 diagnostic(s) (0 schema, 3 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-tags-should-error-when-tags-are-not-alphabetically-sort.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-tags-should-error-when-tags-are-not-alphabetically-sort.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-tags-should-error-when-tags-are-not-alphabetically-sort.yaml does not match group "generic-rule" patterns
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-pass-when-valid.yaml
[OpenAPI Service] Returning 1 diagnostic(s) (0 schema, 1 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-pass-when-valid.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-pass-when-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-sailpoint-api-should-pass-when-valid.yaml does not match group "generic-rule" patterns
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-valid.yaml
[OpenAPI Service] Returning 96 diagnostic(s) (0 schema, 96 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-valid.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-valid.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 26 file(s) in batches
[Workspace Diagnostics] Completed in 31ms: 26 processed, 0 skipped, 26 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 2ms: 5 processed, 0 skipped, 1 report(s)
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-unique-operation-ids.yaml
[OpenAPI Service] Returning 13 diagnostic(s) (0 schema, 13 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-unique-operation-ids.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-unique-operation-ids.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-unique-operation-ids.yaml does not match group "generic-rule" patterns
[Language Plugin] createVirtualCode(file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml, yaml)
[Language Plugin] Virtual code created - id: openapi, languageId: yaml, mappings count: 1, first mapping data: {"verification":true,"definition":true}
[OpenAPI Service] provideDiagnostics called for: volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-warnings.yaml
[OpenAPI Service] Returning 17 diagnostic(s) (0 schema, 17 rule) for volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-warnings.yaml
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-warnings.yaml does not match group "schema-validation" patterns
[Additional Validation] File volar-embedded-content://openapi/file%253A%252F%252F%252FUsers%252Fluke.hagar%252FDocuments%252FGitHub%252Ftelescope%252Fpackages%252Ftest-files%252Ftest-warnings.yaml does not match group "generic-rule" patterns
[Workspace Diagnostics] Processing 27 file(s) in batches
[Workspace Diagnostics] Completed in 27ms: 27 processed, 0 skipped, 27 report(s)
[Additional Validation] Added config file: file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/.telescope/config.yaml
[Additional Validation] Group "schema-validation": patterns = [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": scanning for files matching 1 pattern(s): [**/custom-schema-*.yaml]
[Additional Validation] Group "schema-validation": found 67 potential file(s)
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "schema-validation": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Group "generic-rule": patterns = [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": scanning for files matching 1 pattern(s): [**/custom-generic-*.yaml]
[Additional Validation] Group "generic-rule": found 67 potential file(s)
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-minimal.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-standalone.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v4.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/api-v5.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-openapi-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/missing-path-parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.0.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/openapi-3.2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-document-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-duplicate-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-info-should-error-when-info-section-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-a.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file1.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2-unique.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/id-unique-file2.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file-refs/version-ref-isolation-other.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-multi-file.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-b.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-ref-cycle-main.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-errors.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-root-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-audience-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-error-when-version-is-missing.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-sailpoint-api-should-pass-when-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-tags-should-error-when-tags-are-not-alphabetically-sort.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-unique-operation-ids.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-valid.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/test-warnings.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/examples.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/parameters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/components/responses.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets-with-filters.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/user-by-id.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v1/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v2/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets-with-bad-ref.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/pets.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/user-missing-path-param.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/paths/users.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/A.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/B.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Cycle.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/Pet.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/schemas/User.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": skipping file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/v3/security/schemes.yaml - does not match group patterns
[Additional Validation] Group "generic-rule": 2 file(s) added, 0 wrong format skipped, 0 excluded, 65 no match
[Additional Validation] Found 5 file(s) to validate
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-invalid.yaml does not match group "generic-rule" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml with group "schema-validation"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-schema-valid.yaml does not match group "generic-rule" patterns
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-invalid.yaml with group "generic-rule"
[Additional Validation] File file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml does not match group "schema-validation" patterns
[Additional Validation] Validating file file:///Users/luke.hagar/Documents/GitHub/telescope/packages/test-files/custom-generic-valid.yaml with group "generic-rule"
[Additional Validation] Workspace diagnostics completed in 2ms: 5 processed, 0 skipped, 1 report(s)