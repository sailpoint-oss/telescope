import { defineRule, validators, type Rule } from "../../api.js";

/**
 * Schema Description Required Rule (SailPoint)
 *
 * Requires all schemas to include descriptive text.
 * This is a SailPoint business requirement - OpenAPI spec says description is optional.
 *
 * Uses the recursive Schema visitor - called for every nested schema
 * including properties, items, allOf members, etc.
 */
const schemaDescriptionRequired: Rule = defineRule({
	meta: {
		id: "schema-description-required",
		number: 303,
		type: "problem",
		description: "Schema properties must include descriptive text (SailPoint requirement)",
		defaultSeverity: "error",
	},
	check(ctx) {
		// Create a validator for descriptions
		const requireDescription = validators.required(
			"Schema properties must include descriptive text"
		);

		return {
			Schema(schema) {
				// Skip $ref schemas - use enriched accessor
				if (schema.isRef()) return;

				// Use enriched accessor for description
				const description = schema.description();
				if (!description?.trim()) {
					ctx.reportAt(schema, "description", {
						message: requireDescription(description, "description").message!,
						severity: "error",
					});
				}
			},
		};
	},
});

export default schemaDescriptionRequired;

