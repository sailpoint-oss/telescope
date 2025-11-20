import type { Rule } from "./types.js";

export const defineRule = <T extends Rule>(rule: T): T => {
	// Automatically set ruleType to "openapi" if not already set
	if (!rule.meta.ruleType) {
		rule.meta.ruleType = "openapi";
	}
	return rule;
};

