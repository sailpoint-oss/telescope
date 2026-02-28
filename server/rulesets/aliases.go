package rulesets

// DeprecatedAliases maps old Telescope rule IDs to their new Spectral-aligned
// names. Used to maintain backward compatibility in .telescope.yaml configs.
var DeprecatedAliases = map[string]string{
	"operation-operationid": "operation-operationId",
	"operationid-unique":    "operation-operationId-unique",
	"no-trailing-slash":     "path-keys-no-trailing-slash",
	"template-valid":        "path-declarations-must-exist",
	"params-match":          "path-params",
	"servers-defined":       "oas3-api-servers",
	"structural-validation": "oas3-schema",
}

// NormalizeRuleID resolves deprecated aliases and returns the canonical rule ID.
func NormalizeRuleID(id string) string {
	if canonical, ok := DeprecatedAliases[id]; ok {
		return canonical
	}
	return id
}
