import { defineRule, type Rule } from "../../api.js";

/**
 * Tags Required Rule (SailPoint)
 *
 * Requires that operations have at least one tag.
 * This is a SailPoint business requirement - OpenAPI spec says tags are optional.
 *
 * This rule uses the declarative `fields` property for validation.
 */
const tagsRequired: Rule = defineRule({
	meta: {
		id: "tags-required",
		number: 420,
		type: "problem",
		description: "Operations must have at least one tag (SailPoint requirement)",
		defaultSeverity: "error",
	},
	fields: {
		Operation: {
			required: {
				tags: "Operations must provide at least one tag",
			},
		},
	},
});

export default tagsRequired;
