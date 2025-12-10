import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Boolean Default Rule (SailPoint)
 *
 * Requires that optional boolean properties define a default value.
 * This is a SailPoint business requirement - OpenAPI spec says default is optional.
 *
 * This rule checks:
 * - Schema properties that are type: boolean and not in the required array
 * - Parameters with boolean schemas where required: false
 */
const booleanDefault: Rule = defineRule({
	meta: {
		id: "boolean-default",
		number: 310,
		type: "problem",
		description: "Optional boolean properties must define a default value",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			// Check parameters with boolean schemas
			Parameter(parameterRef) {
				const $ = accessor(parameterRef.node);

				// Skip $ref parameters
				if ($.has("$ref")) return;

				// Only check optional parameters (required: false or not set)
				const required = $.getBoolean("required");
				if (required === true) return;

				// Get schema
				const schema = $.getObject("schema");
				if (!schema || "$ref" in schema) return;

				// Check if boolean type without default
				if (schema.type === "boolean" && !("default" in schema)) {
					ctx.reportAt(parameterRef, ["schema", "default"], {
						message: "Optional boolean parameters must specify a default value",
						severity: "error",
					});
				}
			},

			// Check schema properties
			Schema(schemaRef) {
				// Only check properties (not root schemas, items, compositions, etc.)
				if (schemaRef.location !== "properties") return;

				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				// Skip if property is required
				if (schemaRef.isRequired) return;

				// Check if it's an optional boolean without default
				if ($.getString("type") === "boolean" && !$.has("default")) {
					ctx.reportAt(schemaRef, "default", {
						message: "Optional boolean properties must define a default value",
						severity: "error",
					});
				}
			},
		};
	},
});

export default booleanDefault;
