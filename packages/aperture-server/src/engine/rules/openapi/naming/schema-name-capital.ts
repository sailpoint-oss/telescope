import { defineRule, joinPointer, splitPointer, type Rule } from "../../api.js";

/**
 * Component Schema Name Capital Rule
 *
 * Validates that schema names in components start with a capital letter.
 */
const componentSchemaNameCapital: Rule = defineRule({
	meta: {
		id: "component-schema-name-capital",
		number: 509,
		type: "suggestion",
		description: "Schema names in components must start with a capital letter",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Component(componentRef) {
				// Check if this is a schema component
				const segments = splitPointer(componentRef.pointer);
				if (
					segments.length < 3 ||
					segments[0] !== "components" ||
					segments[1] !== "schemas"
				) {
					return;
				}

				// Extract the schema name (last segment)
				const schemaName = segments[segments.length - 1];
				if (!schemaName) return;

				// Check if the name starts with a capital letter
				const firstChar = schemaName[0];
				if (!firstChar || firstChar !== firstChar.toUpperCase()) {
					// Get the parent pointer (components/schemas) to find the key range
					const parentSegments = segments.slice(0, -1);
					const parentPointer = joinPointer(parentSegments);

					// Use the framework helper to find the exact range of the key name
					const keyRange = ctx.findKeyRange(
						componentRef.uri,
						parentPointer,
						schemaName,
					);

					// Fallback to value range if key range not found
					const range =
						keyRange ?? ctx.locate(componentRef.uri, componentRef.pointer);
					if (!range) return;

					ctx.report({
						message: `Schema names in components must start with a capital letter. Found: "${schemaName}"`,
						severity: "error",
						uri: componentRef.uri,
						range,
					});
				}
			},
		};
	},
});

export default componentSchemaNameCapital;
