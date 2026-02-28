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
		// Deprecated aliases resolve to canonical names
		{"operation-operationid", "operation-operationId"},
		{"operationid-unique", "operation-operationId-unique"},
		{"no-trailing-slash", "path-keys-no-trailing-slash"},
		{"template-valid", "path-declarations-must-exist"},
		{"params-match", "path-params"},
		{"servers-defined", "oas3-api-servers"},
		{"structural-validation", "oas3-schema"},

		// Canonical names pass through unchanged
		{"operation-operationId", "operation-operationId"},
		{"operation-operationId-unique", "operation-operationId-unique"},
		{"path-keys-no-trailing-slash", "path-keys-no-trailing-slash"},
		{"oas3-api-servers", "oas3-api-servers"},
		{"oas3-schema", "oas3-schema"},

		// Unknown IDs pass through unchanged
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

func TestDeprecatedAliasesAreBidirectional(t *testing.T) {
	for old, canonical := range rulesets.DeprecatedAliases {
		if old == canonical {
			t.Errorf("alias %q maps to itself", old)
		}
		if canonical == "" {
			t.Errorf("alias %q maps to empty string", old)
		}
	}
}
