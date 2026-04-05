/**
 * Example custom OpenAPI rule.
 * This rule checks that all operations have a summary field.
 *
 * To use this rule, add it to your .telescope/config.yaml:
 * openapi:
 *   rules:
 *     - rule: example-custom-openapi-rule.ts
 */

import {
	defineRule,
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "@sailpoint-oss/telescope";

export default defineRule({
	meta: {
		id: "custom-operation-summary",
		number: 999, // Use a high number for custom rules
		description: "All operations must have a summary field",
		type: "problem",
		fileFormats: ["yaml", "yml", "json"],
	},
	check(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const summaryPointer = joinPointer([
					...splitPointer(op.pointer),
					"summary",
				]);
				const summary = getValueAtPointer(doc.ast, summaryPointer);

				if (typeof summary !== "string" || !summary.trim()) {
					const range =
						ctx.locate(op.uri, summaryPointer) ??
						ctx.locate(op.uri, op.pointer);
					if (!range) return;

					ctx.report({
						message: "Operation must have a summary field",
						uri: op.uri,
						range,
						severity: "error",
					});
				}
			},
		};
	},
});
