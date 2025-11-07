import { defineRule, type Rule } from "engine";
import { joinPointer, splitPointer, getValueAtPointer } from "loader";

const REQUIRED_ERROR_CODES = ["400", "401", "403", "429", "500"];

const operationResponses: Rule = defineRule({
	meta: {
		id: "operation-responses",
		number: 151,
		type: "problem",
		docs: {
			description:
				"Operations must document at least one 2xx success response and standard error responses (400, 401, 403, 429, 500)",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const responsesPointer = joinPointer([
					...splitPointer(op.pointer),
					"responses",
				]);
				const responses = getValueAtPointer(doc.ast, responsesPointer);

				if (
					!responses ||
					typeof responses !== "object" ||
					!(responses instanceof Object) ||
					Array.isArray(responses)
				) {
					const range =
						ctx.locate(op.uri, responsesPointer) ??
						ctx.locate(op.uri, op.pointer);
					if (!range) return;
					ctx.report({
						message:
							"Operations must document responses including success and standard errors",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				const responseKeys = Object.keys(responses);
				const hasSuccess = responseKeys.some((code) => code.startsWith("2"));

				if (!hasSuccess) {
					const range = ctx.locate(op.uri, responsesPointer);
					if (!range) return;
					ctx.report({
						message: "Operations must define at least one 2xx success response",
						severity: "error",
						uri: op.uri,
						range,
					});
				}

				const missingErrorCodes = REQUIRED_ERROR_CODES.filter(
					(code) => !(code in responses),
				);
				if (missingErrorCodes.length > 0) {
					const range = ctx.locate(op.uri, responsesPointer);
					if (!range) return;
					ctx.report({
						message: `Operations must define the following error responses: [${missingErrorCodes.join(
							", ",
						)}].`,
						severity: "error",
						uri: op.uri,
						range,
					});
				}
			},
		};
	},
});

export default operationResponses;
