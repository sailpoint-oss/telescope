package analyzers

import (
	"strings"

	"github.com/LukasParke/gossip"
	"github.com/LukasParke/gossip/protocol"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	owaspNoHTTPBasicMeta                    = rules.RuleMeta{ID: "owasp-no-http-basic", Description: "Security scheme should not use HTTP basic auth.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-http-basic"}
	owaspNoAPIKeysInURLMeta                 = rules.RuleMeta{ID: "owasp-no-api-keys-in-url", Description: "API keys should not be in query or path.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-api-keys-in-url"}
	owaspNoCredentialsInURLMeta             = rules.RuleMeta{ID: "owasp-no-credentials-in-url", Description: "URLs should not contain credentials.", Severity: protocol.SeverityError, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-credentials-in-url"}
	owaspAuthInsecureSchemesMeta            = rules.RuleMeta{ID: "owasp-auth-insecure-schemes", Description: "Should not use insecure auth schemes (negotiate, oauth).", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-auth-insecure-schemes"}
	owaspJWTBestPracticesMeta               = rules.RuleMeta{ID: "owasp-jwt-best-practices", Description: "JWT bearer tokens should follow best practices.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-jwt-best-practices"}
	owaspProtectionGlobalUnsafeMeta         = rules.RuleMeta{ID: "owasp-protection-global-unsafe", Description: "Unsafe operations should have security defined.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-protection-global-unsafe"}
	owaspProtectionGlobalSafeMeta           = rules.RuleMeta{ID: "owasp-protection-global-safe", Description: "All operations should have some security defined.", Severity: protocol.SeverityInformation, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-protection-global-safe"}
	owaspDefineErrorResponses401Meta        = rules.RuleMeta{ID: "owasp-define-error-responses-401", Description: "Operations should define 401 responses.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-define-error-responses-401"}
	owaspDefineErrorResponses500Meta        = rules.RuleMeta{ID: "owasp-define-error-responses-500", Description: "Operations should define 500 responses.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-define-error-responses-500"}
	owaspRateLimitMeta                      = rules.RuleMeta{ID: "owasp-rate-limit", Description: "Responses should define rate limit headers.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-rate-limit"}
	owaspDefineErrorValidationMeta          = rules.RuleMeta{ID: "owasp-define-error-validation", Description: "Operations should define 422/400 responses for input validation.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-define-error-validation"}
	owaspNoNumericIDsMeta                   = rules.RuleMeta{ID: "owasp-no-numeric-ids", Description: "Avoid integer IDs; use UUIDs or random strings.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-numeric-ids"}
	owaspNoAdditionalPropertiesMeta         = rules.RuleMeta{ID: "owasp-no-additionalProperties", Description: "Object schemas should restrict additional properties.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-additionalProperties"}
	owaspConstrainedAdditionalPropsMeta     = rules.RuleMeta{ID: "owasp-constrained-additionalProperties", Description: "Additional properties should have constraints.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-constrained-additionalProperties"}
	owaspStringLimitMeta                    = rules.RuleMeta{ID: "owasp-string-limit", Description: "String schemas should define maxLength.", Severity: protocol.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-string-limit"}
)

var rateLimitHeaders = []string{"x-ratelimit-limit", "x-rate-limit-limit", "ratelimit-limit", "ratelimit"}

func registerOWASPAnalyzers(s *gossip.Server) {
	rules.Define("owasp-no-http-basic", owaspNoHTTPBasicMeta).SecuritySchemes(
		func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "http" && strings.EqualFold(ss.Scheme, "basic") {
				r.At(ss.Loc, "Security scheme '%s' uses HTTP Basic; consider a stronger mechanism", name)
			}
		},
	).Register(s)

	rules.Define("owasp-no-api-keys-in-url", owaspNoAPIKeysInURLMeta).SecuritySchemes(
		func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "apiKey" && (ss.In == "query" || ss.In == "path") {
				r.At(ss.Loc, "Security scheme '%s' passes API key in %s; use header instead", name, ss.In)
			}
		},
	).Register(s)

	rules.Define("owasp-no-credentials-in-url", owaspNoCredentialsInURLMeta).Servers(
		func(server *openapi.Server, r *rules.Reporter) {
			if containsCredentials(server.URL) {
				r.At(server.URLLoc, "Server URL should not contain credentials")
			}
		},
	).Register(s)

	rules.Define("owasp-auth-insecure-schemes", owaspAuthInsecureSchemesMeta).SecuritySchemes(
		func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			insecure := map[string]bool{"negotiate": true, "oauth": true}
			if ss.Type == "http" && insecure[strings.ToLower(ss.Scheme)] {
				r.At(ss.Loc, "Security scheme '%s' uses insecure scheme '%s'", name, ss.Scheme)
			}
		},
	).Register(s)

	rules.Define("owasp-jwt-best-practices", owaspJWTBestPracticesMeta).SecuritySchemes(
		func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Type == "http" && strings.EqualFold(ss.Scheme, "bearer") && ss.BearerFormat == "" {
				r.At(ss.Loc, "Security scheme '%s' should specify bearerFormat (e.g., JWT)", name)
			}
		},
	).Register(s)

	rules.Define("owasp-protection-global-unsafe", owaspProtectionGlobalUnsafeMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			unsafeMethods := map[string]bool{"post": true, "put": true, "patch": true, "delete": true}
			for path, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					if unsafeMethods[mo.Method] && len(mo.Operation.Security) == 0 && len(idx.Document.Security) == 0 {
						r.At(mo.Operation.Loc, "Unsafe operation %s %s has no security", strings.ToUpper(mo.Method), path)
					}
				}
			}
		},
	).Register(s)

	rules.Define("owasp-protection-global-safe", owaspProtectionGlobalSafeMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if len(idx.Document.Security) > 0 {
				return
			}
			for path, item := range idx.Document.Paths {
				for _, mo := range item.Operations() {
					if len(mo.Operation.Security) == 0 {
						r.At(mo.Operation.Loc, "Operation %s %s has no security defined", strings.ToUpper(mo.Method), path)
					}
				}
			}
		},
	).Register(s)

	registerResponseCheck := func(meta rules.RuleMeta, code, msg string) {
		rules.Define(meta.ID, meta).Operations(
			func(path, method string, op *openapi.Operation, r *rules.Reporter) {
				if _, ok := op.Responses[code]; !ok {
					r.At(op.Loc, "%s for %s %s", msg, strings.ToUpper(method), path)
				}
			},
		).Register(s)
	}
	registerResponseCheck(owaspDefineErrorResponses401Meta, "401", "Missing 401 Unauthorized response")
	registerResponseCheck(owaspDefineErrorResponses500Meta, "500", "Missing 500 Internal Server Error response")

	rules.Define("owasp-rate-limit", owaspRateLimitMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			for code, resp := range op.Responses {
				if code != "200" && code != "201" {
					continue
				}
				hasRateLimit := false
				for header := range resp.Headers {
					hl := strings.ToLower(header)
					for _, rlh := range rateLimitHeaders {
						if hl == rlh {
							hasRateLimit = true
							break
						}
					}
				}
				if !hasRateLimit {
					r.At(resp.Loc, "Response %s for %s %s should include rate limit headers", code, strings.ToUpper(method), path)
				}
			}
		},
	).Register(s)

	rules.Define("owasp-define-error-validation", owaspDefineErrorValidationMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			if op.RequestBody == nil {
				return
			}
			_, has400 := op.Responses["400"]
			_, has422 := op.Responses["422"]
			if !has400 && !has422 {
				r.At(op.Loc, "Operation %s %s with request body should define 400 or 422 response", strings.ToUpper(method), path)
			}
		},
	).Register(s)

	rules.Define("owasp-no-numeric-ids", owaspNoNumericIDsMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			nameLower := strings.ToLower(name)
			if (strings.HasSuffix(nameLower, "id") || strings.HasSuffix(nameLower, "_id")) &&
				(schema.Type == "integer" || schema.Type == "number") {
				r.At(schema.Loc, "Schema '%s' at %s uses numeric ID; consider UUID", name, pointer)
			}
		},
	).Register(s)

	rules.Define("owasp-no-additionalProperties", owaspNoAdditionalPropertiesMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "object" && len(schema.Properties) > 0 && schema.AdditionalProperties == nil {
				r.At(schema.Loc, "Schema at %s should restrict additionalProperties", pointer)
			}
		},
	).Register(s)

	rules.Define("owasp-constrained-additionalProperties", owaspConstrainedAdditionalPropsMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.AdditionalProperties == nil || schema.AdditionalProperties.Type == "" {
				return
			}
			ap := schema.AdditionalProperties
			hasConstraints := ap.MaxLength != nil || ap.Maximum != nil || ap.MaxItems != nil ||
				len(ap.Enum) > 0 || ap.Pattern != ""
			if !hasConstraints {
				r.At(schema.Loc, "Additional properties at %s should have constraints (maxLength, maximum, etc.)", pointer)
			}
		},
	).Register(s)

	rules.Define("owasp-string-limit", owaspStringLimitMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "string" && schema.MaxLength == nil && schema.Enum == nil &&
				schema.Format != "date" && schema.Format != "date-time" && schema.Format != "uuid" &&
				schema.Format != "email" && schema.Format != "uri" && schema.Format != "binary" {
				r.At(schema.Loc, "String schema at %s should define maxLength", pointer)
			}
		},
	).Register(s)
}
