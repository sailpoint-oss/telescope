import { defineRule, type Rule } from "../../api.js";

const ALLOWED_INTEGER_FORMATS = new Set(["int32", "int64"]);
const ALLOWED_NUMBER_FORMATS = new Set(["float", "double"]);

/**
 * Numeric Format Rule (SailPoint)
 *
 * Requires that integer and number types declare valid formats.
 * This is a SailPoint business requirement - OpenAPI spec says format is optional.
 *
 * Valid formats:
 * - integer: int32 or int64
 * - number: float or double
 *
 * Uses the Schema visitor to check all schemas including parameter schemas.
 */
const numericFormat: Rule = defineRule({
	meta: {
		id: "numeric-format",
		number: 171,
		type: "problem",
		description:
			"Integer and number types must declare valid formats (int32/int64 or float/double)",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Schema(schema) {
				// Skip $ref schemas - use enriched accessor
				if (schema.isRef()) return;

				// Use enriched accessors for type and format
				const type = schema.type();
				const format = schema.format() ?? "";

				if (type === "integer" && !ALLOWED_INTEGER_FORMATS.has(format)) {
					ctx.reportAt(schema, "format", {
						message: "Integer types must declare format int32 or int64",
						severity: "error",
					});
				}

				if (type === "number" && !ALLOWED_NUMBER_FORMATS.has(format)) {
					ctx.reportAt(schema, "format", {
						message: "Number types must declare format float or double",
						severity: "error",
					});
				}
			},
		};
	},
});

export default numericFormat;

