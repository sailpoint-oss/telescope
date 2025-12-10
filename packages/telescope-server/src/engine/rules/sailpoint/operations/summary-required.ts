import { accessor, defineRule, validateField, validators, type Rule } from "../../api.js";

/**
 * Operation Summary Required Rule (SailPoint)
 *
 * Requires that operations have concise summaries (≤5 words).
 * This is a SailPoint business requirement - OpenAPI spec says summary is optional.
 */
const operationSummaryRequired: Rule = defineRule({
	meta: {
		id: "operation-summary-required",
		number: 305,
		type: "problem",
		description: "Operations must include a concise summary (≤5 words)",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Operation(op) {
				const $ = accessor(op.node);
				const summary = $.getString("summary");

				// Check if summary exists
				if (!summary?.trim()) {
					ctx.reportAt(op, "summary", {
						message: "Operations must include a short summary (≤5 words)",
						severity: "error",
					});
					return;
				}

				// Check word count
				validateField(
					ctx,
					op,
					"summary",
					validators.maxWords(
						5,
						"Summaries should be no longer than 5 words (found {count})",
						"warning"
					)
				);
			},
		};
	},
});

export default operationSummaryRequired;

