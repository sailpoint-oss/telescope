import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const parameterDescription: Rule = defineRule({
	meta: {
		id: "parameter-description",
		number: 303,
		type: "problem",
		docs: {
			description:
				"Parameters must include descriptive explanations (at least 8 characters)",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Parameter(parameterRef) {
				// This visitor runs on ALL parameters (components, path-level, operation-level, fragments)
				const doc = ctx.project.docs.get(parameterRef.uri);
				if (!doc) return;

				const param = getValueAtPointer(doc.ast, parameterRef.pointer);
				if (!param || typeof param !== "object" || "$ref" in param) return;

				const descriptionPointer = `${parameterRef.pointer}/description`;
				const description = getValueAtPointer(doc.ast, descriptionPointer);

				if (
					!description ||
					typeof description !== "string" ||
					description.trim().length === 0
				) {
					const range =
						ctx.locate(parameterRef.uri, descriptionPointer) ??
						ctx.locate(parameterRef.uri, parameterRef.pointer);
					if (!range) return;
					ctx.report({
						message: "Parameters must include a descriptive explanation",
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
					return;
				}

				const trimmed = description.trim();
				if (trimmed.length < 8) {
					const range = ctx.locate(parameterRef.uri, descriptionPointer);
					if (!range) return;
					ctx.report({
						message:
							"Parameter descriptions must be at least 8 characters long",
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
				}
			},
		};
	},
});

export default parameterDescription;
