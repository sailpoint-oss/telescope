import { defineRule, type Rule } from "../../api.js";

const REQUIRED_ERROR_CODES = ["400", "401", "403", "429", "500"];

/**
 * Operation Error Responses Rule (SailPoint)
 *
 * Requires that operations document standard error responses.
 * This is a SailPoint business requirement - OpenAPI spec says these are optional.
 *
 * Required error codes: 400, 401, 403, 429, 500
 */
const operationErrorResponses: Rule = defineRule({
	meta: {
		id: "operation-error-responses",
		number: 151,
		type: "problem",
		description:
			"Operations must document standard error responses (400, 401, 403, 429, 500)",
		defaultSeverity: "error",
	},
	check(ctx) {
		return {
			Operation(op) {
				// Skip if no responses - use typed method
				if (!op.hasResponses()) return;

				// Check for missing success response - use typed method
				if (!op.hasSuccessResponse()) {
					ctx.reportAt(op, "responses", {
						message: "Operations must define at least one 2xx success response",
						severity: "error",
					});
				}

				// Check for missing error codes - use typed method
				const missingErrorCodes = REQUIRED_ERROR_CODES.filter(
					(code) => !op.hasResponse(code),
				);
				if (missingErrorCodes.length > 0) {
					ctx.reportAt(op, "responses", {
						message: `Operations must define the following error responses: [${missingErrorCodes.join(", ")}]`,
						severity: "error",
					});
				}
			},
		};
	},
});

export default operationErrorResponses;
