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

	if (schema.type === "array" && schema.items) {
		const itemsPointer = `${basePointer}/items`;
		walkSchema(schema.items, itemsPointer, visitor);
	}

	if (schema.allOf && Array.isArray(schema.allOf)) {
		for (let i = 0; i < schema.allOf.length; i++) {
			const allOfItem = schema.allOf[i];
			const allOfPointer = `${basePointer}/allOf/${i}`;
			walkSchema(allOfItem, allOfPointer, visitor);
		}
	}
}

const schemaStructure: Rule = defineRule({
	meta: {
		id: "schema-structure",
		number: 508,
		type: "problem",
		docs: {
			description:
				"Detects invalid OpenAPI schema structures including allOf conflicts and missing array items",
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
					// Check for allOf with conflicting properties
					if (
						current.allOf &&
						Array.isArray(current.allOf) &&
						current.allOf.length > 0
					) {
						const hasType = current.type !== undefined;
						const hasNullable = current.nullable === true;
						const hasProperties =
							current.properties !== undefined &&
							current.properties !== null &&
							typeof current.properties === "object" &&
							Object.keys(current.properties).length > 0;

						if (hasType) {
							const range = ctx.locate(schemaRef.uri, currentPointer);
							if (!range) return;
							ctx.report({
								message:
									"allOf cannot be used with 'type' at the same level. Type should be declared within the allOf schemas or omitted entirely.",
								severity: "error",
								uri: schemaRef.uri,
								range,
							});
						}

						if (hasNullable) {
							const range = ctx.locate(schemaRef.uri, currentPointer);
							if (!range) return;
							ctx.report({
								message:
									"allOf cannot be used with 'nullable' at the same level. Nullable should be declared within the allOf schemas if needed.",
								severity: "error",
								uri: schemaRef.uri,
								range,
							});
						}

						if (hasProperties) {
							const range = ctx.locate(schemaRef.uri, currentPointer);
							if (!range) return;
							ctx.report({
								message:
									"allOf cannot be used with 'properties' at the same level. Properties should be declared within the allOf schemas or the schema should omit allOf.",
								severity: "error",
								uri: schemaRef.uri,
								range,
							});
						}
					}

					// Check for array schema issues
					if (current.type === "array") {
						if (current.items === undefined) {
							const itemsPointer = `${currentPointer}/items`;
							const range =
								ctx.locate(schemaRef.uri, itemsPointer) ??
								ctx.locate(schemaRef.uri, currentPointer);
							if (!range) return;
							ctx.report({
								message:
									"Array schemas must define 'items' to specify the array element type.",
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

export default schemaStructure;
