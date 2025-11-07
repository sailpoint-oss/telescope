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

	if (schema.allOf && Array.isArray(schema.allOf)) {
		for (let i = 0; i < schema.allOf.length; i++) {
			const allOfItem = schema.allOf[i];
			const allOfPointer = `${basePointer}/allOf/${i}`;
			walkSchema(allOfItem, allOfPointer, visitor);
		}
	}
}

const schemaAllofMixedTypes: Rule = defineRule({
	meta: {
		id: "schema-allof-mixed-types",
		number: 506,
		type: "problem",
		docs: {
			description: "allOf compositions must not mix incompatible schema types",
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
					if (!current.allOf || !Array.isArray(current.allOf)) return;

					const allOf = current.allOf as unknown[];
					if (allOf.length < 2) return;

					const declaredTypes = new Set<string>();
					for (const item of allOf) {
						if (!item || typeof item !== "object") continue;
						const itemObj = item as Record<string, unknown>;
						if ("$ref" in itemObj) {
							// Try to resolve
							try {
								const resolved = ctx.project.resolver.deref<
									Record<string, unknown>
								>(
									{ uri: schemaRef.uri, pointer: currentPointer },
									itemObj.$ref as string,
								);
								if (resolved?.type && typeof resolved.type === "string") {
									declaredTypes.add(resolved.type);
								}
							} catch {
								// Resolution errors are reported elsewhere
							}
						} else {
							const type = itemObj.type;
							if (type && typeof type === "string") {
								declaredTypes.add(type);
							}
						}
					}

					if (declaredTypes.size > 1) {
						const types = Array.from(declaredTypes).sort();
						const allOfPointer = `${currentPointer}/allOf`;
						const range =
							ctx.locate(schemaRef.uri, allOfPointer) ??
							ctx.locate(schemaRef.uri, currentPointer);
						if (!range) return;
						ctx.report({
							message: `allOf must not mix incompatible types: ${types.join(
								", ",
							)}. All schemas in allOf should use compatible types or omit type declarations.`,
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

export default schemaAllofMixedTypes;
