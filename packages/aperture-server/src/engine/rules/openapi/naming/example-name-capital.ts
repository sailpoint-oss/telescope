import { defineRule, joinPointer, splitPointer, type Rule } from "../../api.js";

/**
 * Component Example Name Capital Rule
 *
 * Validates that example names in components start with a capital letter.
 */
const componentExampleNameCapital: Rule = defineRule({
	meta: {
		id: "component-example-name-capital",
		number: 510,
		type: "suggestion",
		description: "Example names in components must start with a capital letter",
		defaultSeverity: "info",
	},
	check(ctx) {
		return {
			Example(exampleRef) {
				// Check if this is a component example
				const segments = splitPointer(exampleRef.pointer);
				if (
					segments.length < 3 ||
					segments[0] !== "components" ||
					segments[1] !== "examples"
				) {
					return;
				}

				// Extract the example name (last segment)
				const exampleName = segments[segments.length - 1];
				if (!exampleName) return;

				// Check if the name starts with a capital letter
				const firstChar = exampleName[0];
				if (!firstChar || firstChar !== firstChar.toUpperCase()) {
					// Get the parent pointer (components/examples) to find the key range
					const parentSegments = segments.slice(0, -1);
					const parentPointer = joinPointer(parentSegments);

					// Use the framework helper to find the exact range of the key name
					const keyRange = ctx.findKeyRange(
						exampleRef.uri,
						parentPointer,
						exampleName,
					);

					// Fallback to value range if key range not found
					const range =
						keyRange ?? ctx.locate(exampleRef.uri, exampleRef.pointer);
					if (!range) return;

					ctx.report({
						message: `Example names in components must start with a capital letter. Found: "${exampleName}"`,
						severity: "error",
						uri: exampleRef.uri,
						range,
					});
				}
			},
		};
	},
});

export default componentExampleNameCapital;
