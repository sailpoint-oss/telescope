import { defineRule, type Rule } from "../../api.js";

/**
 * Parameter Example Required Rule (SailPoint)
 *
 * Requires that parameters provide example values.
 * This is a SailPoint business requirement - OpenAPI spec says examples are optional.
 *
 * Valid example locations:
 * - `example` field
 * - `examples` object
 * - `schema.example` field
 */
const parameterExampleRequired: Rule = defineRule({
	meta: {
		id: "parameter-example-required",
		number: 304,
		type: "problem",
		description:
			"Parameters must provide an example value via example, examples, or schema.example",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Parameter(param) {
				// Skip $ref parameters - use enriched accessor
				if (param.isRef()) return;

				// Use enriched accessor that checks example, examples, and schema.example
				if (param.hasExample()) return;

				ctx.reportHere(param, {
					message:
						"Parameters must provide an example value via `example`, `examples`, or `schema.example`",
					severity: "error",
				});
			},
		};
	},
});

export default parameterExampleRequired;

