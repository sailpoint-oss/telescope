import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const VALID_IN_VALUES_30 = ["query", "header", "path", "cookie"] as const;
const VALID_IN_VALUES_20 = ["query", "header", "path", "formData", "body"] as const;

const parameterIn: Rule = defineRule({
	meta: {
		id: "parameter-in",
		number: 318,
		type: "problem",
		docs: {
			description:
				"Parameters must have a valid 'in' value (query, header, path, cookie for OpenAPI 3.x; query, header, path, formData, body for Swagger 2.0)",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Parameter(parameterRef) {
				const doc = ctx.project.docs.get(parameterRef.uri);
				if (!doc) return;

				const param = getValueAtPointer(doc.ast, parameterRef.pointer);
				if (!param || typeof param !== "object" || "$ref" in param) return;

				const inPointer = `${parameterRef.pointer}/in`;
				const inValue = getValueAtPointer(doc.ast, inPointer);

				// Check if 'in' is missing
				if (inValue === undefined || inValue === null) {
					const range =
						ctx.locate(parameterRef.uri, inPointer) ??
						ctx.locate(parameterRef.uri, parameterRef.pointer);
					if (!range) return;
					ctx.report({
						message: "Parameters must specify a valid 'in' value",
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
					return;
				}

				// Check if 'in' is a string
				if (typeof inValue !== "string") {
					const range = ctx.locate(parameterRef.uri, inPointer);
					if (!range) return;
					ctx.report({
						message: "Parameter 'in' value must be a string",
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
					return;
				}

				// Determine valid values based on OpenAPI version
				const version = ctx.project.version;
				const validValues =
					version === "2.0"
						? VALID_IN_VALUES_20
						: VALID_IN_VALUES_30;

				// Check if 'in' value is valid for the OpenAPI version
				if (!validValues.includes(inValue as any)) {
					const range = ctx.locate(parameterRef.uri, inPointer);
					if (!range) return;
					ctx.report({
						message: `Parameter 'in' value must be one of: ${validValues.join(", ")}. Found: ${inValue}`,
						severity: "error",
						uri: parameterRef.uri,
						range,
					});
				}
			},
		};
	},
});

export default parameterIn;

