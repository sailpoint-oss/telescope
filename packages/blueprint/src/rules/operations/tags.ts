import {
	defineRule,
	getValueAtPointer,
	joinPointer,
	type Rule,
	splitPointer,
} from "lens";

const operationTags: Rule = defineRule({
	meta: {
		id: "operation-tags",
		number: 402,
		type: "problem",
		docs: {
			description:
				"Operations must have at least one Title Case tag with no duplicates or whitespace",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const tagsPointer = joinPointer([...splitPointer(op.pointer), "tags"]);
				const tags = getValueAtPointer(doc.ast, tagsPointer);

				if (!Array.isArray(tags) || tags.length === 0) {
					const range =
						ctx.locate(op.uri, tagsPointer) ?? ctx.locate(op.uri, op.pointer);
					if (!range) return;
					ctx.report({
						message: "Operations must provide at least one tag",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				const seen = new Set<string>();
				tags.forEach((tag, index) => {
					const tagPointer = joinPointer([
						...splitPointer(tagsPointer),
						String(index),
					]);
					const range = ctx.locate(op.uri, tagPointer);
					if (!range) return;

					if (typeof tag !== "string") {
						ctx.report({
							message: "Tags must be strings",
							severity: "error",
							uri: op.uri,
							range,
						});
						return;
					}

					const trimmed = tag.trim();
					if (trimmed.length === 0) {
						ctx.report({
							message: "Tags cannot be blank",
							severity: "error",
							uri: op.uri,
							range,
						});
						return;
					}

					if (trimmed !== tag) {
						ctx.report({
							message: "Remove leading or trailing whitespace from tag names",
							severity: "warning",
							uri: op.uri,
							range,
						});
					}

					// Check if tag name starts with an uppercase letter
					if (!/^[A-Z]/.test(trimmed)) {
						ctx.report({
							message: "Tag names should start with an uppercase letter",
							severity: "error",
							uri: op.uri,
							range,
						});
					}

					// Check if tag name uses spaces rather than punctuation
					if (/[^\w ]/.test(trimmed)) {
						ctx.report({
							message: "Tag names should use spaces rather than punctuation",
							severity: "error",
							uri: op.uri,
							range,
						});
					}

					if (seen.has(trimmed)) {
						ctx.report({
							message: `Duplicate tag "${trimmed}" detected`,
							severity: "warning",
							uri: op.uri,
							range,
						});
					} else {
						seen.add(trimmed);
					}
				});
			},
		};
	},
});

export default operationTags;
