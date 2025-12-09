import { defineRule, type Rule } from "../../api.js";

/**
 * Parameter Required Explicit Rule (SailPoint)
 *
 * Requires that parameters explicitly declare whether they are required.
 * This is a SailPoint business requirement - OpenAPI spec says required defaults to false.
 */
const parameterRequiredExplicit: Rule = defineRule({
	meta: {
		id: "parameter-required-explicit",
		number: 317,
		type: "problem",
		description: "Parameters must explicitly declare whether they are required",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Parameter(param) {
				// Skip $ref parameters - use typed method
				if (param.isRef()) return;

				// Check if required field is defined (not just truthy)
				// We need to check for field existence, not just value
				const node = param.node as Record<string, unknown> | null;
				if (!node || typeof node !== "object") return;

				if (!("required" in node)) {
					ctx.reportAt(param, "required", {
						message:
							"Parameters must explicitly declare whether they are required",
						severity: "error",
					});
				}
			},
		};
	},
});

export default parameterRequiredExplicit;
