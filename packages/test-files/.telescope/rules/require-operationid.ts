/**
 * Example Custom Rule: Require Operation ID
 *
 * This is a simple rule that demonstrates the basic structure of a custom
 * OpenAPI rule. It checks that every operation has an operationId.
 *
 * This rule demonstrates:
 * - Basic rule definition with defineRule()
 * - Using the Operation visitor
 * - Reporting diagnostics with ctx.report()
 * - Locating ranges with ctx.locate()
 */
import {
	defineRule,
	getValueAtPointer,
	joinPointer,
	splitPointer,
} from "aperture-server";

export default defineRule({
	meta: {
		id: "custom-require-operationid",
		number: 1000,
		description: "Every operation must have an operationId",
		type: "problem",
		fileFormats: ["yaml", "yml", "json"],
	},
	check(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const operationIdPointer = joinPointer([
					...splitPointer(op.pointer),
					"operationId",
				]);
				const operationId = getValueAtPointer(doc.ast, operationIdPointer);

				if (
					!operationId ||
					typeof operationId !== "string" ||
					!operationId.trim()
				) {
					const range = ctx.locate(op.uri, op.pointer);
					if (!range) return;

					ctx.report({
						message: "Operation must have an operationId",
						severity: "error",
						uri: op.uri,
						range,
					});
				}
			},
		};
	},
});
