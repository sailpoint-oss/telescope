import { accessor, defineRule, type Rule } from "../../api.js";

/**
 * Operation Tags Format Rule
 *
 * Validates tag format and uniqueness (best practices):
 * - Tags should be Title Case (start with uppercase)
 * - Tags should use spaces rather than punctuation
 * - Tags should not have leading/trailing whitespace
 * - Tags should not be duplicated
 *
 * Note: Tag existence is checked by sailpoint/operations/tags-required
 */
const operationTags: Rule = defineRule({
	meta: {
		id: "operation-tags-format",
		number: 402,
		type: "suggestion",
		description:
			"Operation tags should be Title Case with no duplicates or whitespace",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Operation(op) {
				const $ = accessor(op.node);
				const tags = $.getArray<unknown>("tags");

				// Skip if no tags (existence is checked by sailpoint rule)
				if (!tags || tags.length === 0) return;

				const seen = new Set<string>();
				tags.forEach((tag, index) => {
					const tagRef = {
						uri: op.uri,
						pointer: `${op.pointer}/tags/${index}`,
						node: tag,
					};

					if (typeof tag !== "string") {
						ctx.reportHere(tagRef, {
							message: "Tags must be strings",
							severity: "warning",
						});
						return;
					}

					const trimmed = tag.trim();
					if (trimmed.length === 0) {
						ctx.reportHere(tagRef, {
							message: "Tags cannot be blank",
							severity: "warning",
						});
						return;
					}

					// Check for leading/trailing whitespace
					if (trimmed !== tag) {
						ctx.reportHere(tagRef, {
							message: "Remove leading or trailing whitespace from tag names",
							severity: "info",
						});
					}

					// Check if tag name starts with an uppercase letter
					if (!/^[A-Z]/.test(trimmed)) {
						ctx.reportHere(tagRef, {
							message: "Tag names should start with an uppercase letter (Title Case)",
							severity: "info",
						});
					}

					// Check if tag name uses spaces rather than punctuation
					if (/[^\w ]/.test(trimmed)) {
						ctx.reportHere(tagRef, {
							message: "Tag names should use spaces rather than punctuation",
							severity: "info",
						});
					}

					// Check for duplicates
					if (seen.has(trimmed.toLowerCase())) {
						ctx.reportHere(tagRef, {
							message: `Duplicate tag "${trimmed}" detected`,
							severity: "warning",
						});
					} else {
						seen.add(trimmed.toLowerCase());
					}
				});
			},
		};
	},
});

export default operationTags;
