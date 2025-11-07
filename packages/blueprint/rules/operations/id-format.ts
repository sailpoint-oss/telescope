import { defineRule, type Rule } from "engine";
import { joinPointer, splitPointer, getValueAtPointer } from "loader";

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

const operationIdFormat: Rule = defineRule({
	meta: {
		id: "operation-id-format",
		number: 404,
		type: "problem",
		docs: {
			description:
				"operationId must be camelCase with verb + Resource (e.g. listAccessProfiles)",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const operationIdPointer = joinPointer([
					...splitPointer(op.pointer),
					"operationId",
				]);
				const operationId = getValueAtPointer(doc.ast, operationIdPointer);

				if (typeof operationId !== "string" || !operationId.trim()) {
					const range =
						ctx.locate(op.uri, operationIdPointer) ??
						ctx.locate(op.uri, op.pointer);
					if (!range) return;
					ctx.report({
						message:
							"Operations must define an operationId matching {verb}{Resource}",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				if (
					!OPERATION_ID_PATTERN.test(operationId) ||
					!/[A-Z]/.test(operationId)
				) {
					const range = ctx.locate(op.uri, operationIdPointer);
					if (!range) return;
					ctx.report({
						message:
							"operationId must be camelCase starting with a verb followed by a resource name (e.g. listAccessProfiles)",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				const verbMatch = operationId.match(/^[a-z]+/);
				const verb = verbMatch ? verbMatch[0] : undefined;
				if (!verb || !ALLOWED_VERBS.has(verb)) {
					const range = ctx.locate(op.uri, operationIdPointer);
					if (!range) return;
					ctx.report({
						message: `operationId verb should be one of: ${Array.from(
							ALLOWED_VERBS,
						).join(", ")}. Found "${verb ?? ""}"`,
						severity: "warning",
						uri: op.uri,
						range,
					});
				}
			},
		};
	},
});

export default operationIdFormat;
