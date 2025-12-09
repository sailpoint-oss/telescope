/**
 * Schema Array Items Rule
 *
 * Validates that array schemas define an items property.
 * Array schemas without items are ambiguous about element types.
 */

import { defineRule, type Rule } from "../../api.js";

const schemaArrayItems: Rule = defineRule({
	meta: {
		id: "schema-array-items",
		number: 509,
		type: "suggestion",
		description: "Array schemas should define 'items' to specify the element type",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			Schema(schema) {
				// Skip $ref schemas - use typed method
				if (schema.isRef()) return;

				// Check for array schema without items - use typed methods
				if (schema.isArray() && !schema.hasItems()) {
					ctx.reportAt(schema, "items", {
						message:
							"Array schemas should define 'items' to specify the array element type.",
						severity: "warning",
					});
				}
			},
		};
	},
});

export default schemaArrayItems;
