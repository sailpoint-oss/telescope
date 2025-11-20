import { defineRule, getValueAtPointer, type Rule } from "lens";

const ALLOWED_INTEGER_FORMATS = new Set(["int32", "int64"]);
const ALLOWED_NUMBER_FORMATS = new Set(["float", "double"]);

const parameterFormats: Rule = defineRule({
	meta: {
		id: "parameter-formats",
		number: 171,
		type: "problem",
		docs: {
			description: "Integer and number parameters must specify valid formats",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		const checkSchema = (
			uri: string,
			schemaPointer: string,
			schema: unknown,
		): void => {
			if (!schema || typeof schema !== "object" || "$ref" in schema) return;

			const schemaObj = schema as Record<string, unknown>;
			const type = schemaObj.type;
			const format = schemaObj.format;

			if (type === "integer") {
				if (!ALLOWED_INTEGER_FORMATS.has((format as string) ?? "")) {
					const formatPointer = `${schemaPointer}/format`;
					const range =
						ctx.locate(uri, formatPointer) ?? ctx.locate(uri, schemaPointer);
					if (!range) return;
					ctx.report({
						message: "Integer parameters must specify format int32 or int64",
						severity: "error",
						uri,
						range,
					});
				}
			}

			if (type === "number") {
				if (!ALLOWED_NUMBER_FORMATS.has((format as string) ?? "")) {
					const formatPointer = `${schemaPointer}/format`;
					const range =
						ctx.locate(uri, formatPointer) ?? ctx.locate(uri, schemaPointer);
					if (!range) return;
					ctx.report({
						message: "Number parameters must specify format float or double",
						severity: "error",
						uri,
						range,
					});
				}
			}

			if (type === "array" && schemaObj.items) {
				const items = schemaObj.items;
				if (items && typeof items === "object" && !("$ref" in items)) {
					const itemsPointer = `${schemaPointer}/items`;
					checkSchema(uri, itemsPointer, items);
				}
			}
		};

		return {
			Parameter(parameterRef) {
				// This visitor runs on ALL parameters (components, path-level, operation-level, fragments)
				const doc = ctx.project.docs.get(parameterRef.uri);
				if (!doc) return;

				const schemaPointer = `${parameterRef.pointer}/schema`;
				const schema = getValueAtPointer(doc.ast, schemaPointer);
				checkSchema(parameterRef.uri, schemaPointer, schema);
			},
		};
	},
});

export default parameterFormats;
