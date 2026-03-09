package rulesets

// Merge combines multiple rulesets, with later rulesets taking priority.
func Merge(rulesets ...*RuleSet) *RuleSet {
	merged := &RuleSet{
		Rules: make(map[string]RuleDefinition),
	}
	for _, rs := range rulesets {
		if rs == nil {
			continue
		}
		for id, def := range rs.Rules {
			merged.Rules[id] = def
		}
	}
	return merged
}

// BuildEnabledMap converts a resolved ruleset into a map of rule ID -> enabled.
func BuildEnabledMap(rs *RuleSet) map[string]bool {
	if rs == nil {
		return nil
	}
	enabled := make(map[string]bool, len(rs.Rules))
	for id, def := range rs.Rules {
		if def.Severity == "off" || def.Severity == "false" {
			enabled[id] = false
		} else {
			enabled[id] = true
		}
	}
	return enabled
}

// BuildSeverityOverrides extracts severity overrides from a resolved ruleset.
func BuildSeverityOverrides(rs *RuleSet) []SeverityOverride {
	if rs == nil {
		return nil
	}
	var overrides []SeverityOverride
	for id, def := range rs.Rules {
		sev, ok := ParseSeverity(def.Severity)
		if !ok {
			continue
		}
		overrides = append(overrides, SeverityOverride{
			RuleID:   id,
			Severity: sev,
			Disabled: sev == 0,
		})
	}
	return overrides
}
