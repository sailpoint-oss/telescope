import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const parameterRequired: Rule = defineRule({
	meta: {
		id: "parameter-required",
		number: 317,
		type: "problem",
		docs: {
			description:
				"Parameters must explicitly declare whether they are required",
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

				const requiredPointer = `${parameterRef.pointer}/required`;
				const required = getValueAtPointer(doc.ast, requiredPointer);
				if (required === undefined) {
					const range =
						ctx.locate(parameterRef.uri, requiredPointer) ??
						ctx.locate(parameterRef.uri, parameterRef.pointer);
					if (!range) return;
					ctx.report({
						message:
							"Parameters must explicitly declare whether they are required",
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
				}
			},
		};
	},
});

export default parameterRequired;
