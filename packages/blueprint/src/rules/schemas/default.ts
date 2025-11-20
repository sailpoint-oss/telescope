import { defineRule, getValueAtPointer, type Rule } from "lens";

function walkSchema(
	node: unknown,
	basePointer: string,
	visitor: (
		schema: Record<string, unknown>,
		pointer: string,
		isRequired: boolean,
	) => void,
	required?: string[],
): void {
	if (!node || typeof node !== "object" || "$ref" in node) return;

	const schema = node as Record<string, unknown>;
	const isRequired =
		required?.includes(basePointer.split("/").pop() ?? "") ?? false;

	if (
		schema.type === "object" &&
		schema.properties &&
		typeof schema.properties === "object"
	) {
		const requiredList = Array.isArray(schema.required)
			? (schema.required as string[])
			: [];
		const properties = schema.properties as Record<string, unknown>;
		for (const [propName, propSchema] of Object.entries(properties)) {
			const propPointer = `${basePointer}/properties/${propName}`;
			walkSchema(propSchema, propPointer, visitor, requiredList);
		}
	}

	visitor(schema, basePointer, isRequired);
}

const schemaDefault: Rule = defineRule({
	meta: {
		id: "schema-default",
		number: 310,
		type: "problem",
		docs: {
			description: "Optional boolean properties must define a default value",
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

				const requiredList = Array.isArray(
					(schema as Record<string, unknown>).required,
				)
					? ((schema as Record<string, unknown>).required as string[])
					: [];

				walkSchema(
					schema,
					schemaRef.pointer,
					(current, currentPointer, isRequired) => {
						if (currentPointer === schemaRef.pointer) return; // Skip root, only check properties
						const propName = currentPointer.split("/").pop();
						if (!propName) return;

						const isPropertyRequired = requiredList.includes(propName);
						if (isPropertyRequired) return; // Skip required properties

						if (current.type === "boolean" && current.default === undefined) {
							const defaultPointer = `${currentPointer}/default`;
							const range =
								ctx.locate(schemaRef.uri, defaultPointer) ??
								ctx.locate(schemaRef.uri, currentPointer);
							if (!range) return;
							ctx.report({
								message:
									"Optional boolean properties must define a default value",
								severity: "error",
								uri: schemaRef.uri,
								range,
							});
						}
					},
					requiredList,
				);
			},
		};
	},
});

export default schemaDefault;
