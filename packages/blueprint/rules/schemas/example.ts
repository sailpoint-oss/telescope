import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

const SKIP_EXAMPLE_TYPES = new Set(["object", "array"]);

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
}

const schemaExample: Rule = defineRule({
	meta: {
		id: "schema-example",
		number: 304,
		type: "problem",
		docs: {
			description:
				"Schema properties must include example values (except object and array types)",
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
					const type = current.type as string | undefined;
					if (SKIP_EXAMPLE_TYPES.has(type ?? "")) return;

					if (current.example === undefined) {
						const examplePointer = `${currentPointer}/example`;
						const range =
							ctx.locate(schemaRef.uri, examplePointer) ??
							ctx.locate(schemaRef.uri, currentPointer);
						if (!range) return;
						ctx.report({
							message: "Schema must include an example value",
							severity: "error",
							uri: schemaRef.uri,
							range,
						});
					}
				});
			},
		};
	},
});

export default schemaExample;
