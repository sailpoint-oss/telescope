import {
	defineRule,
	getValueAtPointer,
	joinPointer,
	type Rule,
	splitPointer,
} from "lens";

const HTML_TAG_PATTERN = /<[^>]+>/;
const INVALID_ENTITY_PATTERN = /&(?!amp;|lt;|gt;|quot;|apos;)/;

const operationDescriptionHtml: Rule = defineRule({
	meta: {
		id: "operation-description-html",
		number: 405,
		type: "problem",
		docs: {
			description:
				"Operation descriptions must not contain raw HTML tags or entities",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const descriptionPointer = joinPointer([
					...splitPointer(op.pointer),
					"description",
				]);
				const description = getValueAtPointer(doc.ast, descriptionPointer);

				if (!description || typeof description !== "string") return;

				if (HTML_TAG_PATTERN.test(description)) {
					const range = ctx.locate(op.uri, descriptionPointer);
					if (!range) return;
					ctx.report({
						message: "Descriptions must not include raw HTML tags.",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				if (INVALID_ENTITY_PATTERN.test(description)) {
					const range = ctx.locate(op.uri, descriptionPointer);
					if (!range) return;
					ctx.report({
						message:
							"Descriptions contain HTML entities that must be escaped or removed.",
						severity: "error",
						uri: op.uri,
						range,
					});
				}
			},
		};
	},
});

export default operationDescriptionHtml;
