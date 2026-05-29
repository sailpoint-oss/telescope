package rulesets

import brbridge "github.com/sailpoint-oss/barrelman/rulesets/bridge"

// NormalizeRuleID resolves deprecated aliases and returns the canonical rule
// ID. The mapping is owned by barrelman/rulesets/bridge; this wrapper exists
// so existing telescope call sites can be migrated gradually.
func NormalizeRuleID(id string) string {
	return brbridge.Canonical(id)
}
