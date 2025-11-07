import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

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

const schemaExampleKeys: Rule = defineRule({
	meta: {
		id: "schema-example-keys",
		number: 507,
		type: "problem",
		docs: {
			description:
				"Example keys in schema examples must be meaningful names between 6 and 20 characters",
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
					const examples = current.examples;
					if (
						!examples ||
						typeof examples !== "object" ||
						Array.isArray(examples)
					)
						return;

					const examplesObj = examples as Record<string, unknown>;
					for (const [key] of Object.entries(examplesObj)) {
						const examplePointer = `${currentPointer}/examples/${key}`;
						const range = ctx.locate(schemaRef.uri, examplePointer);
						if (!range) continue;

						if (key.length < 6) {
							ctx.report({
								message: `Example key "${key}" must be at least 6 characters long. Use descriptive names like "success-response" or "error-case".`,
								severity: "error",
								uri: schemaRef.uri,
								range,
							});
						} else if (key.length > 20) {
							ctx.report({
								message: `Example key "${key}" must be no more than 20 characters long. Use concise but descriptive names.`,
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

export default schemaExampleKeys;
