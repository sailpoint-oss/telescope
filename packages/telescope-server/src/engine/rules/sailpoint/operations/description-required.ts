import {
	defineRule,
	validateField,
	validators,
	type Rule,
} from "../../api.js";

/**
 * Placeholder patterns that indicate incomplete documentation.
 */
const placeholderPatterns = [
	/^TODO:/i,
	/^FIXME:/i,
	/^XXX:/i,
	/^TBD\b/i,
	/placeholder/i,
	/describe.*here/i,
	/add.*description/i,
];

/**
 * Operation Description Required Rule (SailPoint)
 *
 * Requires that operations have meaningful descriptions.
 * This is a SailPoint business requirement - OpenAPI spec says description is optional.
 *
 * Validates:
 * - Description must exist
 * - Description must not contain placeholder text
 * - Description should be at least 25 characters
 */
const operationDescriptionRequired: Rule = defineRule({
	meta: {
		id: "operation-description-required",
		number: 400,
		type: "problem",
		description: "Operations must include meaningful descriptions (SailPoint requirement)",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Operation(op) {
				// Use enriched accessor method
				const description = op.description();

				// Check if description exists
				if (!description?.trim()) {
					ctx.reportAt(op, "description", {
						message: "Operations must include a descriptive explanation",
						severity: "error",
					});
					return;
				}

				// Check for placeholder text
				const hasPlaceholder = validateField(
					ctx,
					op,
					"description",
					validators.forbidPatterns(
						placeholderPatterns,
						"Operation descriptions must not contain placeholder text"
					)
				);
				if (!hasPlaceholder) return;

				// Check minimum length
				validateField(
					ctx,
					op,
					"description",
					validators.minLength(
						25,
						"Operation descriptions should be detailed and exceed 25 characters",
						"warning"
					)
				);
			},
		};
	},
});

export default operationDescriptionRequired;

