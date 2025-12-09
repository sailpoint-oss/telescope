import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Additional Properties Defined Rule
 *
 * Suggests that object schemas explicitly define additionalProperties.
 * In OpenAPI 3.0, additionalProperties defaults to true, which may
 * allow unexpected properties. Being explicit improves API contracts.
 */
const additionalPropertiesDefined: Rule = defineRule({
	meta: {
		id: "additional-properties-defined",
		number: 311,
		type: "suggestion",
		description: "Object schemas should explicitly define additionalProperties",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Schema(schemaRef) {
				const $ = accessor(schemaRef.node);

				// Skip $ref schemas
				if ($.has("$ref")) return;

				// Only check object schemas with properties
				const type = $.getString("type");
				if (type !== "object") return;

				// Skip if no properties defined (might be a free-form object)
				if (!$.has("properties")) return;

				// Skip if additionalProperties is explicitly defined
				if ($.has("additionalProperties")) return;

				// Skip if this is a composition schema (allOf, oneOf, anyOf)
				if ($.has("allOf") || $.has("oneOf") || $.has("anyOf")) return;

				ctx.reportAt(schemaRef, "additionalProperties", {
					message:
						"Object schema should explicitly set additionalProperties to true or false",
					severity: "info",
				});
			},
		};
	},
});

export default additionalPropertiesDefined;

