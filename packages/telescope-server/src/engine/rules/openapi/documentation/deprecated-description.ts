import { defineRule, type Rule } from "../../api.js";

/**
 * Operation Deprecated Description Rule
 *
 * Validates that deprecated operations include a description explaining
 * the deprecation reason, alternative endpoints, or migration path.
 */
const operationDeprecatedDescription: Rule = defineRule({
	meta: {
		id: "operation-deprecated-description",
		number: 152,
		type: "suggestion",
		description: "Deprecated operations should explain deprecation reason",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Operation(op) {
				// Only check deprecated operations - use typed method
				if (!op.deprecated()) return;

				// Get description - use typed method
				const description = op.description();

				// Check if description exists and mentions deprecation
				if (!description?.trim()) {
					ctx.reportAt(op, "description", {
						message:
							"Deprecated operation should have a description explaining the deprecation reason and alternatives",
						severity: "info",
					});
					return;
				}

				// Check if description mentions deprecation-related keywords
				const deprecationKeywords = [
					"deprecated",
					"deprecate",
					"obsolete",
					"legacy",
					"superseded",
					"replaced",
					"use instead",
					"migrate",
					"migration",
					"alternative",
					"removal",
					"removed",
					"sunset",
				];

				const lowerDesc = description.toLowerCase();
				const hasDeprecationInfo = deprecationKeywords.some((keyword) =>
					lowerDesc.includes(keyword),
				);

				if (!hasDeprecationInfo) {
					ctx.reportAt(op, "description", {
						message:
							"Deprecated operation description should mention deprecation reason, timeline, or alternatives",
						severity: "info",
					});
				}
			},
		};
	},
});

export default operationDeprecatedDescription;
