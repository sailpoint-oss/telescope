/**
 * Example custom OpenAPI rule.
 * This rule checks that all operations have a summary field.
 *
 * To use this rule, add it to your .telescope/config.yaml:
 * openapi:
 *   rules:
 *     - rule: example-custom-openapi-rule.ts
 */

import { defineRule } from "telescope-server";

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
				const operation = op.node;
				if (
					typeof operation === "object" &&
					operation !== null &&
					!("summary" in operation)
				) {
					ctx.report({
						message: "Operation must have a summary field",
						uri: op.uri,
						range: ctx.locate(op.uri, op.pointer) ?? {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 0 },
						},
						severity: "error",
					});
				}
			},
		};
	},
});
