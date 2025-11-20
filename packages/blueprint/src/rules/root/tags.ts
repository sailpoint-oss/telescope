import { defineRule, getValueAtPointer, type Rule } from "lens";

const HTML_TAG_PATTERN = /<[^>]+>/;
const INVALID_ENTITY_PATTERN = /&(?!amp;|lt;|gt;|quot;|apos;)/;

const rootTags: Rule = defineRule({
	meta: {
		id: "root-tags",
		number: 403,
		type: "problem",
		docs: {
			description:
				"Tags array must be present at root level and sorted alphabetically by name",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
		contextRequirements: {
			requiresRoot: true,
		},
	},
	create(ctx) {
		return {
			Document({ uri }) {
				const doc = ctx.project.docs.get(uri);
				if (!doc) return;

				const tagsPointer = "#/tags";
				const tags = getValueAtPointer(doc.ast, tagsPointer);

				if (!Array.isArray(tags)) {
					const range = ctx.locate(uri, tagsPointer) ??
						ctx.locate(uri, "#") ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						};
					ctx.report({
						message: "Tags array must be present at the root level",
						severity: "error",
						uri,
						range,
					});
					return;
				}

				const names = tags.map((tag) => {
					if (tag && typeof tag === "object" && "name" in tag) {
						return typeof tag.name === "string" ? tag.name : "";
					}
					return "";
				});
				const sorted = [...names].sort((a, b) => a.localeCompare(b));

				for (let index = 0; index < names.length; index += 1) {
					if (names[index] !== sorted[index]) {
						const tagPointer = `${tagsPointer}/${index}`;
						const range = ctx.locate(uri, tagPointer);
						if (!range) return;
						ctx.report({
							message: "Tags must be sorted alphabetically by name",
							severity: "error",
							uri,
							range,
						});
						break;
					}
				}

				// Validate that all tags have descriptions with proper length and no HTML
				for (let index = 0; index < tags.length; index += 1) {
					const tag = tags[index];
					if (!tag || typeof tag !== "object") continue;

					const tagPointer = `${tagsPointer}/${index}`;
					const descriptionPointer = `${tagPointer}/description`;
					const description = getValueAtPointer(doc.ast, descriptionPointer);

					// Check if description exists
					if (
						!description ||
						typeof description !== "string" ||
						description.trim().length === 0
					) {
						const range =
							ctx.locate(uri, descriptionPointer) ??
							ctx.locate(uri, tagPointer);
						if (!range) continue;
						ctx.report({
							message: "Tags must include a descriptive explanation",
							severity: "error",
							uri,
							range,
						});
						continue;
					}

					// Check description length (should be at least 25 characters like operations)
					const normalized = description.trim();
					if (normalized.length < 25) {
						const range = ctx.locate(uri, descriptionPointer);
						if (!range) continue;
						ctx.report({
							message:
								"Tag descriptions should be detailed and exceed 25 characters",
							severity: "warning",
							uri,
							range,
						});
					}

					// Check for HTML tags
					if (HTML_TAG_PATTERN.test(description)) {
						const range = ctx.locate(uri, descriptionPointer);
						if (!range) continue;
						ctx.report({
							message: "Tag descriptions must not include raw HTML tags.",
							severity: "error",
							uri,
							range,
						});
						continue;
					}

					// Check for invalid HTML entities
					if (INVALID_ENTITY_PATTERN.test(description)) {
						const range = ctx.locate(uri, descriptionPointer);
						if (!range) continue;
						ctx.report({
							message:
								"Tag descriptions contain HTML entities that must be escaped or removed.",
							severity: "error",
							uri,
							range,
						});
					}
				}
			},
		};
	},
});

export default rootTags;
