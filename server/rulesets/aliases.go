package rulesets

// DeprecatedAliases maps legacy rule IDs to their canonical replacements.
// Used to keep existing .telescope.yaml configs working while the default
// catalogs and diagnostics move to SailPoint guideline IDs.
var DeprecatedAliases = map[string]string{
	"operation-operationid":        "operation-operationId",
	"operationid-unique":           "operation-operationId-unique",
	"no-trailing-slash":            "path-keys-no-trailing-slash",
	"template-valid":               "path-declarations-must-exist",
	"params-match":                 "path-params",
	"servers-defined":              "oas3-api-servers",
	"structural-validation":        "oas3-schema",
	"operation-operationId":        "sp-122",
	"operation-operationId-unique": "sp-122",
	"operation-tags":               "sp-123",
	"parameter-description":        "sp-115",
	"security-global-or-operation": "sp-300",
	"server-url-https":             "sp-304",
	"missing-error-responses":      "sp-403",
	"missing-pagination":           "sp-602",
}

// NormalizeRuleID resolves deprecated aliases and returns the canonical rule ID.
func NormalizeRuleID(id string) string {
	if canonical, ok := DeprecatedAliases[id]; ok {
		return canonical
	}
	return id
}
