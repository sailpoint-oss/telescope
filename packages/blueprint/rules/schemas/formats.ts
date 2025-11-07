import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const ALLOWED_INTEGER_FORMATS = new Set(["int32", "int64"]);
const ALLOWED_NUMBER_FORMATS = new Set(["float", "double"]);

function walkSchema(
	node: unknown,
	basePointer: string,
	visitor: (schema: Record<string, unknown>, pointer: string) => void,
): void {
	if (!node || typeof node !== "object" || "$ref" in node) return;

	const schema = node as Record<string, unknown>;
	visitor(schema, basePointer);

	if (
		schema.type === "object" &&
		schema.properties &&
		typeof schema.properties === "object"
	) {
		const properties = schema.properties as Record<string, unknown>;
		for (const [propName, propSchema] of Object.entries(properties)) {
			const propPointer = `${basePointer}/properties/${propName}`;
			walkSchema(propSchema, propPointer, visitor);
		}
	}

	if (schema.type === "array" && schema.items) {
		const itemsPointer = `${basePointer}/items`;
		walkSchema(schema.items, itemsPointer, visitor);
	}
}

const schemaFormats: Rule = defineRule({
	meta: {
		id: "schema-formats",
		number: 171,
		type: "problem",
		docs: {
			description:
				"Integer and number schema properties must declare valid formats",
			recommended: true,
		},
		oas: ["2.0", "3.0", "3.1", "3.2"],
	},
	create(ctx) {
		return {
			Schema(schemaRef) {
				// This visitor runs on ALL schemas (components, fragments, inline)
				const doc = ctx.project.docs.get(schemaRef.uri);
				if (!doc) return;

				const schema = getValueAtPointer(doc.ast, schemaRef.pointer);
				if (!schema || typeof schema !== "object" || "$ref" in schema) return;

				walkSchema(schema, schemaRef.pointer, (current, currentPointer) => {
					const type = current.type;
					const format = current.format;

					if (type === "integer") {
						if (!ALLOWED_INTEGER_FORMATS.has((format as string) ?? "")) {
							const formatPointer = `${currentPointer}/format`;
							const range =
								ctx.locate(schemaRef.uri, formatPointer) ??
								ctx.locate(schemaRef.uri, currentPointer);
							if (!range) return;
							ctx.report({
								message:
									"Integer properties must declare format int32 or int64",
								severity: "error",
								uri: schemaRef.uri,
								range,
							});
						}
					}

					if (type === "number") {
						if (!ALLOWED_NUMBER_FORMATS.has((format as string) ?? "")) {
							const formatPointer = `${currentPointer}/format`;
							const range =
								ctx.locate(schemaRef.uri, formatPointer) ??
								ctx.locate(schemaRef.uri, currentPointer);
							if (!range) return;
							ctx.report({
								message:
									"Number properties must declare format float or double",
								severity: "error",
								uri: schemaRef.uri,
								range,
							});
						}
					}
				});
			},
		};
	},
});

export default schemaFormats;
