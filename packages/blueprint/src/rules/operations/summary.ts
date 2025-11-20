import {
	defineRule,
	getValueAtPointer,
	joinPointer,
	type Rule,
	splitPointer,
} from "lens";

const operationSummary: Rule = defineRule({
	meta: {
		id: "operation-summary",
		number: 305,
		type: "problem",
		docs: {
			description: "Operations must include a concise summary (≤5 words)",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Operation(op) {
				const doc = ctx.project.docs.get(op.uri);
				if (!doc) return;

				const summaryPointer = joinPointer([
					...splitPointer(op.pointer),
					"summary",
				]);
				const summary = getValueAtPointer(doc.ast, summaryPointer);

				if (
					!summary ||
					typeof summary !== "string" ||
					summary.trim().length === 0
				) {
					const range =
						ctx.locate(op.uri, summaryPointer) ??
						ctx.locate(op.uri, op.pointer);
					if (!range) return;
					ctx.report({
						message: "Operations must include a short summary (≤5 words)",
						severity: "error",
						uri: op.uri,
						range,
					});
					return;
				}

				const wordCount = summary.trim().split(/\s+/).length;
				if (wordCount > 5) {
					const range = ctx.locate(op.uri, summaryPointer);
					if (!range) return;
					ctx.report({
						message: `Summaries should be no longer than 5 words (found ${wordCount})`,
						severity: "warning",
						uri: op.uri,
						range,
					});
				}
			},
		};
	},
});

export default operationSummary;
