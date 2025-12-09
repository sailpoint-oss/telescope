import { defineRule, type Rule } from "../../api.js";

/**
 * Enum Description Rule
 *
 * Suggests that schemas with enum values include a description
 * explaining what each value means. This improves API documentation.
 */
const enumDescription: Rule = defineRule({
	meta: {
		id: "enum-description",
		number: 312,
		type: "suggestion",
		description: "Enum schemas should have descriptions explaining the values",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Schema(schema) {
				// Skip $ref schemas - use typed method
				if (schema.isRef()) return;

				// Only check schemas with enum - use typed method
				const enumValues = schema.enum();
				if (!enumValues || enumValues.length === 0) return;

				// Check if description exists - use typed method
				const description = schema.description();
				if (!description?.trim()) {
					ctx.reportAt(schema, "description", {
						message:
							"Enum schema should include a description explaining the possible values",
						severity: "info",
					});
					return;
				}

				// Check if description mentions the enum values (basic check)
				// This is a softer check - we just want to encourage documenting values
				const hasMultipleValues = enumValues.length > 2;
				const descriptionMentionsValues = enumValues.some(
					(v) =>
						typeof v === "string" &&
						description.toLowerCase().includes(v.toLowerCase()),
				);

				if (hasMultipleValues && !descriptionMentionsValues) {
					ctx.reportAt(schema, "description", {
						message:
							"Consider documenting what each enum value represents in the description",
						severity: "hint",
					});
				}
			},
		};
	},
});

export default enumDescription;
