import { defineRule, type Rule } from "../../api.js";

/**
 * Schema Example Required Rule (SailPoint)
 *
 * Requires schema properties to include example values (except object and array types).
 * This is a SailPoint business requirement - OpenAPI spec says examples are optional.
 *
 * Uses the recursive Schema visitor - called for every nested schema.
 */
const schemaExampleRequired: Rule = defineRule({
	meta: {
		id: "schema-example-required",
		number: 304,
		type: "problem",
		description:
			"Schema properties must include example values (except object and array types)",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Schema(schema) {
				// Skip $ref schemas - use typed method
				if (schema.isRef()) return;

				// Skip object and array types - use typed methods
				if (schema.isObject() || schema.isArray()) return;

				// Check if example is missing - use typed method
				if (!schema.hasExample()) {
					ctx.reportAt(schema, "example", {
						message: "Schema must include an example value",
						severity: "error",
					});
				}
			},
		};
	},
});

export default schemaExampleRequired;
