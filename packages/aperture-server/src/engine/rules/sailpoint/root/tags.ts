import {
	accessor,
	defineRule,
	validateField,
	validators,
	type Rule,
} from "../../api.js";

const HTML_TAG_PATTERN = /<[^>]+>/;
const INVALID_ENTITY_PATTERN = /&(?!amp;|lt;|gt;|quot;|apos;)/;

interface TagObject {
	name?: string;
	description?: string;
}

/**
 * SailPoint Root Tags Rule
 *
 * Validates that the tags array is present at root level, sorted alphabetically,
 * and each tag has a proper description.
 */
const rootTags: Rule = defineRule({
	meta: {
		id: "root-tags",
		number: 403,
		type: "problem",
		description:
			"Tags array must be present at root level and sorted alphabetically by name",
	},
	check(ctx) {
		return {
			Root({ uri, node, pointer }) {
				const $ = accessor(node);
				const tags = $.getArray<TagObject>("tags");

				if (!tags) {
					ctx.reportAt({ uri, pointer }, "tags", {
						message: "Tags array must be present at the root level",
						severity: "error",
					});
					return;
				}

				// Check alphabetical sorting
				const names = tags.map((tag) =>
					tag && typeof tag === "object" && typeof tag.name === "string"
						? tag.name
						: "",
				);
				const sorted = [...names].sort((a, b) => a.localeCompare(b));

				for (let index = 0; index < names.length; index++) {
					if (names[index] !== sorted[index]) {
						const tagRef = {
							uri,
							pointer: `#/tags/${index}`,
						};
						ctx.reportHere(tagRef, {
							message: "Tags must be sorted alphabetically by name",
							severity: "error",
						});
						break;
					}
				}

				// Validate each tag's description
				for (let index = 0; index < tags.length; index++) {
					const tag = tags[index];
					if (!tag || typeof tag !== "object") continue;

					const tagRef = {
						uri,
						pointer: `#/tags/${index}`,
						node: tag,
					};

					const description =
						typeof tag.description === "string" ? tag.description : undefined;

					// Check if description exists
					if (!description?.trim()) {
						ctx.reportAt(tagRef, "description", {
							message: "Tags must include a descriptive explanation",
							severity: "error",
						});
						continue;
					}

					// Check description length
					if (description.trim().length < 25) {
						ctx.reportAt(tagRef, "description", {
							message:
								"Tag descriptions should be detailed and exceed 25 characters",
							severity: "warning",
						});
					}

					// Check for HTML tags
					const hasNoHtml = validateField(
						ctx,
						tagRef,
						"description",
						validators.forbidPatterns(
							[HTML_TAG_PATTERN],
							"Tag descriptions must not include raw HTML tags.",
						),
					);
					if (!hasNoHtml) continue;

					// Check for invalid HTML entities
					validateField(
						ctx,
						tagRef,
						"description",
						validators.forbidPatterns(
							[INVALID_ENTITY_PATTERN],
							"Tag descriptions contain HTML entities that must be escaped or removed.",
						),
					);
				}
			},
		};
	},
});

export default rootTags;
