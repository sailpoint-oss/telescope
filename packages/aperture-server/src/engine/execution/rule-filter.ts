import type { ProjectContext, Rule } from "../rules/types.js";

/**
 * Filter rules based on context.
 * Since contextRequirements have been removed, all rules are now allowed to run.
 * This function is kept for backwards compatibility.
 */
export function filterRulesByContext(
	rules: Rule[],
	_context: ProjectContext,
): Rule[] {
	// All rules can now run in any context
	return rules;
}
