import { defineRule, getValueAtPointer, type Rule } from "lens";

function walkSchema(
	node: unknown,
	basePointer: string,
	visitor: (schema: Record<string, unknown>, pointer: string) => void,
): void {
	if (!node || typeof node !== "object" || "$ref" in node) return;

	const schema = node as Record<string, unknown>;
	visitor(schema, basePointer);

	// Handle allOf composition
	if (schema.allOf && Array.isArray(schema.allOf)) {
		for (let i = 0; i < schema.allOf.length; i++) {
			const allOfItem = schema.allOf[i];
			const allOfPointer = `${basePointer}/allOf/${i}`;
			walkSchema(allOfItem, allOfPointer, visitor);
		}
	}

	// Handle oneOf composition
	if (schema.oneOf && Array.isArray(schema.oneOf)) {
		for (let i = 0; i < schema.oneOf.length; i++) {
			const oneOfItem = schema.oneOf[i];
			const oneOfPointer = `${basePointer}/oneOf/${i}`;
			walkSchema(oneOfItem, oneOfPointer, visitor);
		}
	}

	// Handle anyOf composition
	if (schema.anyOf && Array.isArray(schema.anyOf)) {
		for (let i = 0; i < schema.anyOf.length; i++) {
			const anyOfItem = schema.anyOf[i];
			const anyOfPointer = `${basePointer}/anyOf/${i}`;
			walkSchema(anyOfItem, anyOfPointer, visitor);
		}
	}

	// Handle object properties (schema has properties implies object type, even without explicit type)
	if (schema.properties && typeof schema.properties === "object") {
		const properties = schema.properties as Record<string, unknown>;
		for (const [propName, propSchema] of Object.entries(properties)) {
			const propPointer = `${basePointer}/properties/${propName}`;
			walkSchema(propSchema, propPointer, visitor);
		}
	}

	// Handle additionalProperties (can be boolean or schema object)
	// Works for both explicit object type and implicit (properties present)
	if (
		(schema.type === "object" || schema.properties) &&
		schema.additionalProperties
	) {
		if (
			typeof schema.additionalProperties === "object" &&
			!Array.isArray(schema.additionalProperties) &&
			!("$ref" in schema.additionalProperties)
		) {
			const additionalPropsPointer = `${basePointer}/additionalProperties`;
			walkSchema(schema.additionalProperties, additionalPropsPointer, visitor);
		}
	}

	// Handle array items
	if (schema.type === "array" && schema.items) {
		const itemsPointer = `${basePointer}/items`;
		walkSchema(schema.items, itemsPointer, visitor);
	}

	// Handle patternProperties (OpenAPI 3.1+)
	if (
		(schema.type === "object" || schema.properties) &&
		schema.patternProperties &&
		typeof schema.patternProperties === "object"
	) {
		const patternProperties = schema.patternProperties as Record<
			string,
			unknown
		>;
		for (const [pattern, patternSchema] of Object.entries(patternProperties)) {
			// Pattern keys may contain special characters, encode them properly
			const patternPointer = `${basePointer}/patternProperties/${pattern
				.replace(/~/g, "~0")
				.replace(/\//g, "~1")}`;
			walkSchema(patternSchema, patternPointer, visitor);
		}
	}
}

const schemaDescription: Rule = defineRule({
	meta: {
		id: "schema-description",
		number: 303,
		type: "problem",
		docs: {
			description: "Schema properties must include descriptive text",
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
					if (
						!current.description ||
						typeof current.description !== "string" ||
						current.description.trim().length === 0
					) {
						const descriptionPointer = `${currentPointer}/description`;
						const range =
							ctx.locate(schemaRef.uri, descriptionPointer) ??
							ctx.locate(schemaRef.uri, currentPointer);
						if (!range) return;
						ctx.report({
							message: "Schema properties must include descriptive text",
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

export default schemaDescription;
