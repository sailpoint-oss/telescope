import { defineRule, type Rule } from "../../api.js";

/**
 * Schema Type Required Rule
 *
 * Validates that schemas explicitly declare a type property.
 * While OpenAPI allows schemas without type (implying "any"),
 * explicit types improve documentation and code generation.
 */
const schemaTypeRequired: Rule = defineRule({
	meta: {
		id: "schema-type-required",
		number: 308,
		type: "suggestion",
		description: "Schemas should explicitly declare a type",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Schema(schema) {
				// Skip $ref schemas - use typed method
				if (schema.isRef()) return;

				// Skip schemas with composition keywords - they define type through composition
				if (schema.isComposition()) return;

				// Skip schemas that are only constraints (like readOnly: true)
				// These might be combined with other schemas
				const raw = schema.node as Record<string, unknown>;
				if (!raw || typeof raw !== "object") return;

				const keys = Object.keys(raw);
				const metaOnlyKeys = new Set([
					"description",
					"title",
					"readOnly",
					"writeOnly",
					"deprecated",
					"externalDocs",
					"xml",
				]);
				const hasOnlyMetaKeys = keys.every((k) => metaOnlyKeys.has(k));
				if (hasOnlyMetaKeys && keys.length > 0) return;

				// Check if type is defined - use typed method
				if (!schema.hasType()) {
					ctx.reportAt(schema, "type", {
						message:
							"Schema should explicitly declare a type (string, number, integer, boolean, array, object)",
						severity: "warning",
					});
				}
			},
		};
	},
});

export default schemaTypeRequired;
