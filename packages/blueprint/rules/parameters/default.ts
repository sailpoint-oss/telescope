import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const parameterDefault: Rule = defineRule({
	meta: {
		id: "parameter-default",
		number: 310,
		type: "problem",
		docs: {
			description: "Optional boolean parameters must provide a default value",
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

				const required = getValueAtPointer(
					doc.ast,
					`${parameterRef.pointer}/required`,
				);
				if (required !== false) return;

				const schemaPointer = `${parameterRef.pointer}/schema`;
				const schema = getValueAtPointer(doc.ast, schemaPointer);
				if (!schema || typeof schema !== "object" || "$ref" in schema) {
					const range = ctx.locate(parameterRef.uri, parameterRef.pointer);
					if (!range) return;
					ctx.report({
						message:
							"Optional boolean parameters must define a schema with a default",
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
					return;
				}

				const schemaObj = schema as Record<string, unknown>;
				if (schemaObj.type === "boolean" && schemaObj.default === undefined) {
					const defaultPointer = `${schemaPointer}/default`;
					const range =
						ctx.locate(parameterRef.uri, defaultPointer) ??
						ctx.locate(parameterRef.uri, schemaPointer);
					if (!range) return;
					ctx.report({
						message: "Optional boolean parameters must specify a default",
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
				}
			},
		};
	},
});

export default parameterDefault;
