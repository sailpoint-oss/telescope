import {
	accessor,
	defineRule,
	validateField,
	validators,
	type Rule,
} from "../../api.js";

/**
 * Parameter Description Required Rule (SailPoint)
 *
 * Requires that parameters include descriptive explanations of at least 8 characters.
 * This is a SailPoint business requirement - OpenAPI spec says description is optional.
 */
const parameterDescriptionRequired: Rule = defineRule({
	meta: {
		id: "parameter-description-required",
		number: 303,
		type: "problem",
		description:
			"Parameters must include descriptive explanations (at least 8 characters)",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Parameter(parameterRef) {
				const $ = accessor(parameterRef.node);

				// Skip $ref parameters
				if ($.has("$ref")) return;

				const description = $.getString("description");

				// Check if description exists
				if (!description?.trim()) {
					ctx.reportAt(parameterRef, "description", {
						message: "Parameters must include a descriptive explanation",
						severity: "error",
					});
					return;
				}

				// Check minimum length
				validateField(
					ctx,
					parameterRef,
					"description",
					validators.minLength(
						8,
						"Parameter descriptions must be at least 8 characters long",
					),
				);
			},
		};
	},
});

export default parameterDescriptionRequired;

