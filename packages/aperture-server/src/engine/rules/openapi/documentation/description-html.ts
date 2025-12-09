import {
	accessor,
	defineRule,
	type Rule,
	validateField,
	validators,
} from "../../api.js";

const HTML_TAG_PATTERN = /<[^>]+>/;
const INVALID_ENTITY_PATTERN = /&(?!amp;|lt;|gt;|quot;|apos;)/;

/**
 * Operation Description HTML Rule
 *
 * Validates that operation descriptions do not contain raw HTML tags or entities.
 */
const operationDescriptionHtml: Rule = defineRule({
	meta: {
		id: "operation-description-html",
		number: 405,
		type: "suggestion",
		description:
			"Operation descriptions must not contain raw HTML tags or entities",
		defaultSeverity: "warning",
	},
	check(ctx) {
		return {
			Operation(op) {
				const $ = accessor(op.node);
				const description = $.getString("description");

				if (!description) return;

				// Check for HTML tags
				const hasHtmlTags = validateField(
					ctx,
					op,
					"description",
					validators.forbidPatterns(
						[HTML_TAG_PATTERN],
						"Descriptions must not include raw HTML tags.",
					),
				);
				if (!hasHtmlTags) return;

				// Check for invalid HTML entities
				validateField(
					ctx,
					op,
					"description",
					validators.forbidPatterns(
						[INVALID_ENTITY_PATTERN],
						"Descriptions contain HTML entities that must be escaped or removed.",
					),
				);
			},
		};
	},
});

export default operationDescriptionHtml;
