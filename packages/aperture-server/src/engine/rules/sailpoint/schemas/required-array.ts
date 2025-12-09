import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Check if schema is an object type with properties.
 */
function hasObjectProperties(schema: Record<string, unknown>): boolean {
	if ("$ref" in schema) return false;
	const properties = schema.properties;
	return (
		schema.type === "object" &&
		properties !== undefined &&
		typeof properties === "object" &&
		Object.keys(properties as Record<string, unknown>).length > 0
	);
}

/**
 * Schema Required Array Rule (SailPoint)
 *
 * Requires that object schemas with properties declare a required array,
 * and that all required properties exist in the properties object.
 * This is a SailPoint business requirement - OpenAPI spec says required is optional.
 */
const schemaRequiredArray: Rule = defineRule({
	meta: {
		id: "schema-required-array",
		number: 317,
		type: "problem",
		description:
			"Object schemas with properties must declare a required array, and all required properties must exist in properties",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Schema(schemaRef) {
				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				const raw = $.raw();
				if (!hasObjectProperties(raw)) return;

				const required = $.getArray<string>("required");
				if (!required) {
					ctx.reportAt(schemaRef, "required", {
						message:
							"Object schemas must declare a required array (may be empty)",
						severity: "error",
					});
					return;
				}

				// Validate that required properties exist in properties
				const properties = $.getObject("properties") ?? {};

				for (const requiredProp of required) {
					if (!(requiredProp in properties)) {
						// Try to find the specific item in the required array
						const index = required.indexOf(requiredProp);
						const fieldPath =
							index >= 0 ? ["required", String(index)] : ["required"];

						ctx.reportAt(schemaRef, fieldPath, {
							message: `Property '${requiredProp}' is listed in required array but is not defined in properties object`,
							severity: "error",
						});
					}
				}
			},
		};
	},
});

export default schemaRequiredArray;

