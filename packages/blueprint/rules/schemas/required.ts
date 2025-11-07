import { defineRule, type Rule } from "engine";
import { getValueAtPointer } from "loader";

function hasObjectProperties(schema: unknown): boolean {
	if (!schema || typeof schema !== "object" || "$ref" in schema) return false;
	const schemaObj = schema as Record<string, unknown>;
	return (
		schemaObj.type === "object" &&
		schemaObj.properties !== undefined &&
		typeof schemaObj.properties === "object" &&
		Object.keys(schemaObj.properties as Record<string, unknown>).length > 0
	);
}

function validateRequiredProperties(
	schema: unknown,
	pointer: string,
	uri: string,
	ctx: {
		locate: (
			uri: string,
			pointer: string,
		) => {
			start: { line: number; character: number };
			end: { line: number; character: number };
		} | null;
		report: (diag: any) => void;
	},
	doc: { ast: unknown },
): void {
	if (!schema || typeof schema !== "object" || "$ref" in schema) return;
	const schemaObj = schema as Record<string, unknown>;

	const required = Array.isArray(schemaObj.required)
		? (schemaObj.required as string[])
		: [];
	const properties =
		schemaObj.properties && typeof schemaObj.properties === "object"
			? (schemaObj.properties as Record<string, unknown>)
			: {};

	// Validate that all required properties exist in properties
	for (const requiredProp of required) {
		if (!(requiredProp in properties)) {
			const requiredPointer = `${pointer}/required`;
			const requiredArray = getValueAtPointer(doc.ast, requiredPointer);
			let range = ctx.locate(uri, requiredPointer);

			// Try to find the specific item in the required array
			if (Array.isArray(requiredArray)) {
				const index = requiredArray.indexOf(requiredProp);
				if (index >= 0) {
					const itemPointer = `${requiredPointer}/${index}`;
					range = ctx.locate(uri, itemPointer) || range;
				}
			}

			if (!range) {
				range = ctx.locate(uri, pointer) || {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 0 },
				};
			}

			ctx.report({
				message: `Property '${requiredProp}' is listed in required array but is not defined in properties object`,
				severity: "error",
				uri,
				range,
			});
		}
	}
}

const schemaRequired: Rule = defineRule({
	meta: {
		id: "schema-required",
		number: 317,
		type: "problem",
		docs: {
			description:
				"Object schemas with properties must declare a required array, and all required properties must exist in properties",
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

				if (!hasObjectProperties(schema)) return;

				const required = getValueAtPointer(
					doc.ast,
					`${schemaRef.pointer}/required`,
				);
				if (!Array.isArray(required)) {
					const requiredPointer = `${schemaRef.pointer}/required`;
					const range =
						ctx.locate(schemaRef.uri, requiredPointer) ??
						ctx.locate(schemaRef.uri, schemaRef.pointer);
					if (!range) return;
					ctx.report({
						message:
							"Object schemas must declare a required array (may be empty)",
						severity: "error",
						uri: schemaRef.uri,
						range,
					});
					return;
				}

				// Validate that required properties exist in properties
				validateRequiredProperties(
					schema,
					schemaRef.pointer,
					schemaRef.uri,
					ctx,
					doc,
				);
			},
		};
	},
});

export default schemaRequired;
