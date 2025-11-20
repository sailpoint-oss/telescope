import { defineRule, getValueAtPointer, type Rule } from "lens";

const parameterExample: Rule = defineRule({
	meta: {
		id: "parameter-example",
		number: 304,
		type: "problem",
		docs: {
			description:
				"Parameters must provide an example value via example, examples, or schema.example",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		const checkParameter = (
			uri: string,
			paramPointer: string,
			param: unknown,
		): void => {
			if (!param || typeof param !== "object" || "$ref" in param) return;

			const paramObj = param as Record<string, unknown>;
			if (paramObj.example !== undefined) return;

			const examples = paramObj.examples;
			if (
				examples &&
				typeof examples === "object" &&
				!Array.isArray(examples) &&
				Object.keys(examples).length > 0
			) {
				return;
			}

			const schemaPointer = `${paramPointer}/schema`;
			const schema = getValueAtPointer(
				ctx.project.docs.get(uri)?.ast,
				schemaPointer,
			);
			if (!schema || typeof schema !== "object" || "$ref" in schema) {
				const range = ctx.locate(uri, paramPointer);
				if (!range) return;
				ctx.report({
					message:
						"Parameters must provide an example value via `example`, `examples`, or `schema.example`",
					severity: "error",
					uri,
					range,
				});
				return;
			}

			const schemaObj = schema as Record<string, unknown>;
			if (schemaObj.example !== undefined) return;

			const range = ctx.locate(uri, paramPointer);
			if (!range) return;
			ctx.report({
				message:
					"Referenced parameter schemas must expose an example via `example` or `examples`",
				severity: "error",
				uri,
				range,
			});
		};

		return {
			Parameter(parameterRef) {
				// This visitor runs on ALL parameters (components, path-level, operation-level, fragments)
				const doc = ctx.project.docs.get(parameterRef.uri);
				if (!doc) return;

				const param = getValueAtPointer(doc.ast, parameterRef.pointer);
				checkParameter(parameterRef.uri, parameterRef.pointer, param);
			},
		};
	},
});

export default parameterExample;
