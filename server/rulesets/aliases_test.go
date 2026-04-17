package rulesets_test

import (
	"testing"

	"github.com/sailpoint-oss/telescope/server/rulesets"
)

func TestNormalizeRuleID(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		// Deprecated aliases resolve to canonical SailPoint slugs via the bridge.
		{"operation-operationid", "sailpoint-operation-id-camel-case"},
		{"operationid-unique", "sailpoint-operation-id-unique"},
		{"no-trailing-slash", "path-keys-no-trailing-slash"},
		{"template-valid", "path-declarations-must-exist"},
		{"params-match", "path-params"},
		{"servers-defined", "oas3-api-servers"},
		{"structural-validation", "oas3-schema"},
		{"operation-operationId", "sailpoint-operation-id-camel-case"},
		{"operation-operationId-unique", "sailpoint-operation-id-unique"},
		{"operation-tags", "sailpoint-operation-single-tag"},
		{"parameter-description", "sailpoint-parameter-description"},
		{"security-global-or-operation", "sailpoint-operation-security-required"},
		{"server-url-https", "sailpoint-server-url-https"},
		{"missing-error-responses", "sailpoint-operation-4xx-response"},
		{"missing-pagination", "sailpoint-collection-offset-pagination"},

		// sp-NNN numeric codes resolve to their canonical SailPoint slug.
		{"sp-122", "sailpoint-operation-id-camel-case"},
		{"sp-123", "sailpoint-operation-single-tag"},
		{"sp-300", "sailpoint-security-oauth2-required"},

		// Canonical names pass through unchanged.
		{"sailpoint-operation-id-camel-case", "sailpoint-operation-id-camel-case"},
		{"path-keys-no-trailing-slash", "path-keys-no-trailing-slash"},
		{"oas3-api-servers", "oas3-api-servers"},
		{"oas3-schema", "oas3-schema"},

		// Unknown IDs pass through unchanged.
		{"custom-rule", "custom-rule"},
		{"info-contact", "info-contact"},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := rulesets.NormalizeRuleID(tt.input)
			if got != tt.want {
				t.Errorf("NormalizeRuleID(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}
