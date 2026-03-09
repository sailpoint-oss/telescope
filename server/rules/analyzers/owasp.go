package analyzers

import (
	"strings"

	"github.com/LukasParke/gossip"
	ctypes "github.com/sailpoint-oss/telescope/server/core/types"
	"github.com/sailpoint-oss/telescope/server/openapi"
	"github.com/sailpoint-oss/telescope/server/rules"
)

var (
	owaspNoHTTPBasicMeta                    = rules.RuleMeta{ID: "owasp-no-http-basic", Description: "Security scheme should not use HTTP basic auth.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-http-basic"}
	owaspNoAPIKeysInURLMeta                 = rules.RuleMeta{ID: "owasp-no-api-keys-in-url", Description: "API keys should not be in query or path.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-api-keys-in-url"}
	owaspNoCredentialsInURLMeta             = rules.RuleMeta{ID: "owasp-no-credentials-in-url", Description: "URLs should not contain credentials.", Severity: ctypes.SeverityError, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-credentials-in-url"}
	owaspAuthInsecureSchemesMeta            = rules.RuleMeta{ID: "owasp-auth-insecure-schemes", Description: "Should not use insecure auth schemes (negotiate, oauth).", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-auth-insecure-schemes"}
	owaspJWTBestPracticesMeta               = rules.RuleMeta{ID: "owasp-jwt-best-practices", Description: "JWT bearer tokens should follow best practices.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-jwt-best-practices"}
	owaspShortLivedAccessTokensMeta         = rules.RuleMeta{ID: "owasp-short-lived-access-tokens", Description: "OAuth2 flows should define refreshUrl for short-lived tokens.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-short-lived-access-tokens"}
	owaspProtectionGlobalUnsafeMeta         = rules.RuleMeta{ID: "owasp-protection-global-unsafe", Description: "Unsafe operations should have security defined.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-protection-global-unsafe"}
	owaspProtectionGlobalSafeMeta           = rules.RuleMeta{ID: "owasp-protection-global-safe", Description: "All operations should have some security defined.", Severity: ctypes.SeverityInfo, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-protection-global-safe"}
	owaspDefineErrorResponses401Meta        = rules.RuleMeta{ID: "owasp-define-error-responses-401", Description: "Operations should define 401 responses.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-define-error-responses-401"}
	owaspDefineErrorResponses500Meta        = rules.RuleMeta{ID: "owasp-define-error-responses-500", Description: "Operations should define 500 responses.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-define-error-responses-500"}
	owaspRateLimitMeta                      = rules.RuleMeta{ID: "owasp-rate-limit", Description: "Responses should define rate limit headers.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-rate-limit"}
	owaspRateLimitRetryAfterMeta            = rules.RuleMeta{ID: "owasp-rate-limit-retry-after", Description: "429 responses should include Retry-After header.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-rate-limit-retry-after"}
	owaspRateLimitResponses429Meta          = rules.RuleMeta{ID: "owasp-rate-limit-responses-429", Description: "Operations should define a 429 Too Many Requests response.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-rate-limit-responses-429"}
	owaspDefineErrorValidationMeta          = rules.RuleMeta{ID: "owasp-define-error-validation", Description: "Operations should define 422/400 responses for input validation.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-define-error-validation"}
	owaspDefineCORSOriginMeta               = rules.RuleMeta{ID: "owasp-define-cors-origin", Description: "Responses should define Access-Control-Allow-Origin header.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-define-cors-origin"}
	owaspNoSchemeHTTPMeta                   = rules.RuleMeta{ID: "owasp-no-scheme-http", Description: "OAS 2.0 schemes must not include http.", Severity: ctypes.SeverityError, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-scheme-http"}
	owaspNoServerHTTPMeta                   = rules.RuleMeta{ID: "owasp-no-server-http", Description: "Server URLs must use HTTPS.", Severity: ctypes.SeverityError, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-server-http"}
	owaspNoNumericIDsMeta                   = rules.RuleMeta{ID: "owasp-no-numeric-ids", Description: "Avoid integer IDs; use UUIDs or random strings.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-numeric-ids"}
	owaspNoAdditionalPropertiesMeta         = rules.RuleMeta{ID: "owasp-no-additionalProperties", Description: "Object schemas should restrict additional properties.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-additionalProperties"}
	owaspConstrainedAdditionalPropsMeta     = rules.RuleMeta{ID: "owasp-constrained-additionalProperties", Description: "Additional properties should have constraints.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-constrained-additionalProperties"}
	owaspNoUnevaluatedPropertiesMeta        = rules.RuleMeta{ID: "owasp-no-unevaluatedProperties", Description: "Object schemas should set unevaluatedProperties to false (OAS 3.1+).", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-no-unevaluatedProperties"}
	owaspConstrainedUnevaluatedPropsMeta    = rules.RuleMeta{ID: "owasp-constrained-unevaluatedProperties", Description: "Unevaluated properties schema should have maxProperties.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-constrained-unevaluatedProperties"}
	owaspStringLimitMeta                    = rules.RuleMeta{ID: "owasp-string-limit", Description: "String schemas should define maxLength.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-string-limit"}
	owaspStringRestrictedMeta               = rules.RuleMeta{ID: "owasp-string-restricted", Description: "String schemas should specify format, pattern, enum, or const.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-string-restricted"}
	owaspArrayLimitMeta                     = rules.RuleMeta{ID: "owasp-array-limit", Description: "Array schemas should define maxItems.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-array-limit"}
	owaspIntegerLimitMeta                   = rules.RuleMeta{ID: "owasp-integer-limit", Description: "Integer schemas should define minimum and maximum bounds (OAS 3.1+).", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-integer-limit"}
	owaspIntegerLimitLegacyMeta             = rules.RuleMeta{ID: "owasp-integer-limit-legacy", Description: "Integer schemas should define minimum and maximum (OAS 2.0/3.0).", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-integer-limit-legacy"}
	owaspIntegerFormatMeta                  = rules.RuleMeta{ID: "owasp-integer-format", Description: "Integer schemas should specify format (int32 or int64).", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-integer-format"}
	owaspAdminSecurityUniqueMeta            = rules.RuleMeta{ID: "owasp-admin-security-unique", Description: "Admin endpoints should use distinct security schemes.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-admin-security-unique"}
	owaspConcerningURLParameterMeta         = rules.RuleMeta{ID: "owasp-concerning-url-parameter", Description: "Parameters with URL-like names may be vulnerable to SSRF.", Severity: ctypes.SeverityInfo, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-concerning-url-parameter"}
	owaspInventoryAccessMeta                = rules.RuleMeta{ID: "owasp-inventory-access", Description: "Server objects should declare x-internal to indicate intended audience.", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-inventory-access"}
	owaspInventoryEnvironmentMeta           = rules.RuleMeta{ID: "owasp-inventory-environment", Description: "Server descriptions should state the environment (production, staging, etc.).", Severity: ctypes.SeverityWarning, Category: rules.CategoryOWASP, Recommended: false, DocURL: rules.DocBaseURL + "owasp-inventory-environment"}
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
					r.At(openapi.LocOrFallback(op.ResponsesLoc, op.Loc), "%s for %s %s", msg, strings.ToUpper(method), path)
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
					r.At(headerDiagLoc(resp), "Response %s for %s %s should include rate limit headers", code, strings.ToUpper(method), path)
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
				r.At(openapi.LocOrFallback(op.ResponsesLoc, op.Loc), "Operation %s %s with request body should define 400 or 422 response", strings.ToUpper(method), path)
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
			if schema.Type == "object" && len(schema.Properties) > 0 &&
				schema.AdditionalProperties == nil && !schema.AdditionalPropertiesFalse {
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
				!schema.HasConst &&
				schema.Format != "date" && schema.Format != "date-time" && schema.Format != "uuid" &&
				schema.Format != "email" && schema.Format != "uri" && schema.Format != "binary" {
				r.At(schema.Loc, "String schema at %s should define maxLength", pointer)
			}
		},
	).Register(s)

	// --- New OWASP rules below ---

	// API2: short-lived-access-tokens — OAuth2 flows (except clientCredentials) must define refreshUrl
	rules.Define("owasp-short-lived-access-tokens", owaspShortLivedAccessTokensMeta).SecuritySchemes(
		func(name string, ss *openapi.SecurityScheme, r *rules.Reporter) {
			if ss.Flows == nil {
				return
			}
			type namedFlow struct {
				name string
				flow *openapi.OAuthFlow
			}
			// clientCredentials is excluded per OWASP guidance (machine-to-machine)
			flows := []namedFlow{
				{"implicit", ss.Flows.Implicit},
				{"password", ss.Flows.Password},
				{"authorizationCode", ss.Flows.AuthorizationCode},
			}
			for _, nf := range flows {
				if nf.flow != nil && nf.flow.RefreshURL == "" {
					r.At(nf.flow.Loc, "OAuth2 %s flow in '%s' should define refreshUrl for short-lived tokens", nf.name, name)
				}
			}
		},
	).Register(s)

	// API3: no-unevaluatedProperties — OAS 3.1+ object schemas must set unevaluatedProperties: false
	rules.Define("owasp-no-unevaluatedProperties", owaspNoUnevaluatedPropertiesMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			walkAllSchemas(idx, func(name string, schema *openapi.Schema, pointer string) {
				if schema.Type == "object" && len(schema.Properties) > 0 &&
					schema.UnevaluatedProperties == nil && !schema.UnevaluatedPropertiesFalse {
					r.At(schema.Loc, "Schema at %s should set unevaluatedProperties to false", pointer)
				}
			})
		},
	).Register(s)

	// API3: constrained-unevaluatedProperties — unevaluatedProperties schema must have maxProperties
	rules.Define("owasp-constrained-unevaluatedProperties", owaspConstrainedUnevaluatedPropsMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			walkAllSchemas(idx, func(name string, schema *openapi.Schema, pointer string) {
				if schema.UnevaluatedProperties != nil && schema.MaxProperties == nil {
					r.At(schema.Loc, "Schema at %s with unevaluatedProperties schema should define maxProperties", pointer)
				}
			})
		},
	).Register(s)

	// API4: rate-limit-retry-after — 429 responses must include Retry-After header
	rules.Define("owasp-rate-limit-retry-after", owaspRateLimitRetryAfterMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			resp, ok := op.Responses["429"]
			if !ok {
				return
			}
			for header := range resp.Headers {
				if strings.EqualFold(header, "Retry-After") {
					return
				}
			}
			r.At(headerDiagLoc(resp), "429 response for %s %s should include Retry-After header", strings.ToUpper(method), path)
		},
	).Register(s)

	// API4: rate-limit-responses-429 — Operations should define a 429 response
	registerResponseCheck(owaspRateLimitResponses429Meta, "429", "Missing 429 Too Many Requests response")

	// API4: array-limit — Array schemas must define maxItems
	rules.Define("owasp-array-limit", owaspArrayLimitMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "array" && schema.MaxItems == nil {
				r.At(schema.Loc, "Array schema at %s should define maxItems", pointer)
			}
		},
	).Register(s)

	// API4: string-restricted — String schemas should have format, pattern, enum, or const
	rules.Define("owasp-string-restricted", owaspStringRestrictedMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "string" && schema.Format == "" && schema.Pattern == "" &&
				schema.Enum == nil && !schema.HasConst {
				r.At(schema.Loc, "String schema at %s should specify format, pattern, enum, or const", pointer)
			}
		},
	).Register(s)

	// API4: integer-limit — Integer schemas must have min/max bounds (OAS 3.1+)
	rules.Define("owasp-integer-limit", owaspIntegerLimitMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version31 && idx.Document.ParsedVersion != openapi.Version32 {
				return
			}
			walkAllSchemas(idx, func(name string, schema *openapi.Schema, pointer string) {
				if schema.Type != "integer" {
					return
				}
				hasLower := schema.Minimum != nil || schema.ExclusiveMinimum != nil
				hasUpper := schema.Maximum != nil || schema.ExclusiveMaximum != nil
				if !hasLower || !hasUpper {
					r.At(schema.Loc, "Integer schema at %s should define minimum/exclusiveMinimum and maximum/exclusiveMaximum", pointer)
				}
			})
		},
	).Register(s)

	// API4: integer-limit-legacy — Integer schemas must have minimum and maximum (OAS 2.0/3.0)
	rules.Define("owasp-integer-limit-legacy", owaspIntegerLimitLegacyMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version20 && idx.Document.ParsedVersion != openapi.Version30 {
				return
			}
			walkAllSchemas(idx, func(name string, schema *openapi.Schema, pointer string) {
				if schema.Type == "integer" && (schema.Minimum == nil || schema.Maximum == nil) {
					r.At(schema.Loc, "Integer schema at %s should define minimum and maximum", pointer)
				}
			})
		},
	).Register(s)

	// API4: integer-format — Integer schemas must specify format (int32 or int64)
	rules.Define("owasp-integer-format", owaspIntegerFormatMeta).Schemas(
		func(name string, schema *openapi.Schema, pointer string, r *rules.Reporter) {
			if schema.Type == "integer" && schema.Format == "" {
				r.At(schema.Loc, "Integer schema at %s should specify format (int32 or int64)", pointer)
			}
		},
	).Register(s)

	// API5: admin-security-unique — Admin endpoints should use different/additional security
	rules.Define("owasp-admin-security-unique", owaspAdminSecurityUniqueMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			globalSchemes := securitySchemeNames(idx.Document.Security)
			if len(globalSchemes) == 0 {
				return
			}
			for path, item := range idx.Document.Paths {
				if !isAdminPath(path) {
					continue
				}
				for _, mo := range item.Operations() {
					opSchemes := securitySchemeNames(mo.Operation.Security)
					if len(opSchemes) == 0 {
						continue // checked by other rules
					}
					if sameSchemes(globalSchemes, opSchemes) {
						r.At(mo.Operation.Loc, "Admin operation %s %s uses the same security as non-admin endpoints", strings.ToUpper(mo.Method), path)
					}
				}
			}
		},
	).Register(s)

	// API7: concerning-url-parameter — Flag parameters with URL-like names for SSRF review
	rules.Define("owasp-concerning-url-parameter", owaspConcerningURLParameterMeta).Parameters(
		func(param *openapi.Parameter, r *rules.Reporter) {
			nameLower := strings.ToLower(param.Name)
			for _, pattern := range urlParameterPatterns {
				if strings.Contains(nameLower, pattern) {
					r.At(param.NameLoc, "Parameter '%s' has a URL-like name; review for SSRF risk", param.Name)
					return
				}
			}
		},
	).Register(s)

	// API8: define-cors-origin — Responses should define Access-Control-Allow-Origin header
	rules.Define("owasp-define-cors-origin", owaspDefineCORSOriginMeta).Operations(
		func(path, method string, op *openapi.Operation, r *rules.Reporter) {
			for code, resp := range op.Responses {
				if !strings.HasPrefix(code, "2") {
					continue
				}
				hasCORS := false
				for header := range resp.Headers {
					if strings.EqualFold(header, "Access-Control-Allow-Origin") {
						hasCORS = true
						break
					}
				}
				if !hasCORS {
					r.At(headerDiagLoc(resp), "Response %s for %s %s should define Access-Control-Allow-Origin header", code, strings.ToUpper(method), path)
				}
			}
		},
	).Register(s)

	// API8: no-scheme-http — OAS 2.0 schemes must not include http
	rules.Define("owasp-no-scheme-http", owaspNoSchemeHTTPMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if idx.Document.ParsedVersion != openapi.Version20 {
				return
			}
			for _, scheme := range idx.Document.Schemes {
				if strings.EqualFold(scheme, "http") {
					r.AtRange(ctypes.FileStartRange, "OAS 2.0 schemes must not include 'http'; use 'https'")
					return
				}
			}
		},
	).Register(s)

	// API8: no-server-http — OAS 3.x server URLs must use HTTPS
	rules.Define("owasp-no-server-http", owaspNoServerHTTPMeta).Custom(
		func(idx *openapi.Index, r *rules.Reporter) {
			if !idx.IsOpenAPI() || idx.Document.ParsedVersion == openapi.Version20 {
				return
			}
			for _, srv := range idx.Document.Servers {
				if srv.URL == "" {
					continue
				}
				lower := strings.ToLower(srv.URL)
				if strings.HasPrefix(lower, "https://") || strings.HasPrefix(lower, "wss://") {
					continue
				}
				r.At(srv.URLLoc, "Server URL '%s' must use https:// or wss://", srv.URL)
			}
		},
	).Register(s)

	// API9: inventory-access — Server objects should declare x-internal
	rules.Define("owasp-inventory-access", owaspInventoryAccessMeta).Servers(
		func(server *openapi.Server, r *rules.Reporter) {
			if _, ok := server.Extensions["x-internal"]; !ok {
				r.At(server.Loc, "Server '%s' should declare x-internal: true or false", server.URL)
			}
		},
	).Register(s)

	// API9: inventory-environment — Server descriptions should state the environment
	rules.Define("owasp-inventory-environment", owaspInventoryEnvironmentMeta).Servers(
		func(server *openapi.Server, r *rules.Reporter) {
			desc := strings.ToLower(server.Description.Text)
			for _, term := range environmentTerms {
				if strings.Contains(desc, term) {
					return
				}
			}
			r.At(server.Loc, "Server '%s' description should include environment (production, staging, etc.)", server.URL)
		},
	).Register(s)
}

// walkAllSchemas is a helper that walks all schemas (component and inline)
// with a simple callback, used by Custom() rules that need version context.
func walkAllSchemas(idx *openapi.Index, fn func(name string, schema *openapi.Schema, pointer string)) {
	doc := idx.Document
	if doc.Components != nil {
		for name, schema := range doc.Components.Schemas {
			fn(name, schema, "components/schemas/"+name)
		}
	}
	for path, item := range doc.Paths {
		for _, mo := range item.Operations() {
			for _, p := range mo.Operation.Parameters {
				if p.Schema != nil {
					fn("", p.Schema, "paths"+path+"/"+mo.Method+"/parameters/"+p.Name)
				}
			}
			if mo.Operation.RequestBody != nil {
				for mt, media := range mo.Operation.RequestBody.Content {
					if media.Schema != nil {
						fn("", media.Schema, "paths"+path+"/"+mo.Method+"/requestBody/"+mt)
					}
				}
			}
			for code, resp := range mo.Operation.Responses {
				for mt, media := range resp.Content {
					if media.Schema != nil {
						fn("", media.Schema, "paths"+path+"/"+mo.Method+"/responses/"+code+"/"+mt)
					}
				}
			}
		}
	}
}

// headerDiagLoc returns the best diagnostic location for a missing-header rule:
// the headers key if present, otherwise the status code key, otherwise the response itself.
func headerDiagLoc(resp *openapi.Response) openapi.Loc {
	if resp.HeadersLoc.Range != (ctypes.Range{}) {
		return resp.HeadersLoc
	}
	return openapi.LocOrFallback(resp.CodeLoc, resp.Loc)
}

var urlParameterPatterns = []string{"callback", "redirect", "_url", "-url", "returnurl", "next_url", "target"}

var environmentTerms = []string{"production", "staging", "development", "sandbox", "local", "test", "qa", "dev", "prod", "uat"}

func isAdminPath(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "/admin") || strings.Contains(lower, "/internal")
}

func securitySchemeNames(reqs []openapi.SecurityRequirement) []string {
	seen := make(map[string]bool)
	for _, req := range reqs {
		for _, e := range req.Entries {
			seen[e.Name] = true
		}
	}
	names := make([]string, 0, len(seen))
	for n := range seen {
		names = append(names, n)
	}
	return names
}

func sameSchemes(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	set := make(map[string]bool, len(a))
	for _, s := range a {
		set[s] = true
	}
	for _, s := range b {
		if !set[s] {
			return false
		}
	}
	return true
}
