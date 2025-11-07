import type { Rule, ProjectContext } from "./types";
import { isRootDocument } from "loader";

/**
 * Filter rules based on context requirements.
 * Returns only rules whose context requirements are satisfied.
 */
export function filterRulesByContext(
	rules: Rule[],
	context: ProjectContext,
): Rule[] {
	return rules.filter((rule) => {
		const requirements = rule.meta.contextRequirements;
		if (!requirements) {
			// No requirements means rule can run in any context
			return true;
		}

		// Check if root is required
		if (requirements.requiresRoot) {
			const hasRoot = Array.from(context.docs.values()).some((doc) =>
				isRootDocument(doc.ast),
			);
			if (!hasRoot) return false;
		}

		// Check if paths section is required
		if (requirements.requiresPaths) {
			const hasPaths = Array.from(context.docs.values()).some((doc) => {
				const ast = doc.ast as Record<string, unknown>;
				return ast && typeof ast === "object" && "paths" in ast;
			});
			if (!hasPaths) return false;
		}

		// Check if components section is required
		if (requirements.requiresComponents) {
			const hasComponents = Array.from(context.docs.values()).some((doc) => {
				const ast = doc.ast as Record<string, unknown>;
				return ast && typeof ast === "object" && "components" in ast;
			});
			if (!hasComponents) return false;
		}

		// Check for specific sections
		if (requirements.requiresSpecificSection) {
			for (const section of requirements.requiresSpecificSection) {
				const hasSection = Array.from(context.docs.values()).some((doc) => {
					const ast = doc.ast as Record<string, unknown>;
					return ast && typeof ast === "object" && section in ast;
				});
				if (!hasSection) return false;
			}
		}

		return true;
	});
}
