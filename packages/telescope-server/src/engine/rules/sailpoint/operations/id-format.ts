import { accessor, defineRule, type Rule } from "../../api.js";

const OPERATION_ID_PATTERN = /^[a-z]+[A-Za-z0-9]*$/;
const ALLOWED_VERBS = new Set([
	"list",
	"get",
	"create",
	"update",
	"delete",
	"patch",
	"search",
	"submit",
	"approve",
	"reject",
	"trigger",
	"validate",
	"preview",
	"import",
	"export",
	"assign",
	"revoke",
	"generate",
	"schedule",
	"cancel",
]);

/**
 * SailPoint Operation ID Format Rule
 *
 * Validates that operationId follows the camelCase {verb}{Resource} pattern.
 */
const operationIdFormat: Rule = defineRule({
	meta: {
		id: "operation-id-format",
		number: 404,
		type: "problem",
		description:
			"operationId must be camelCase with verb + Resource (e.g. listAccessProfiles)",
	},
	check(ctx) {
		return {
			Operation(op) {
				const $ = accessor(op.node);
				const operationId = $.getString("operationId");

				// Check if operationId exists
				if (!operationId?.trim()) {
					ctx.reportAt(op, "operationId", {
						message:
							"Operations must define an operationId matching {verb}{Resource}",
						severity: "error",
					});
					return;
				}

				// Check camelCase pattern with uppercase resource name
				if (!OPERATION_ID_PATTERN.test(operationId) || !/[A-Z]/.test(operationId)) {
					ctx.reportAt(op, "operationId", {
						message:
							"operationId must be camelCase starting with a verb followed by a resource name (e.g. listAccessProfiles)",
						severity: "error",
					});
					return;
				}

				// Check verb is from allowed list
				const verbMatch = operationId.match(/^[a-z]+/);
				const verb = verbMatch ? verbMatch[0] : undefined;
				if (!verb || !ALLOWED_VERBS.has(verb)) {
					ctx.reportAt(op, "operationId", {
						message: `operationId verb should be one of: ${Array.from(ALLOWED_VERBS).join(", ")}. Found "${verb ?? ""}"`,
						severity: "warning",
					});
				}
			},
		};
	},
});

export default operationIdFormat;
