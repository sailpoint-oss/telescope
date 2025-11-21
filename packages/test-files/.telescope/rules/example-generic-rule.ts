/**
 * Example generic rule for non-OpenAPI YAML/JSON files.
 * This rule checks that all objects have a "version" field.
 *
 * To use this rule, add it to your telescope.config.yaml:
 * jsonYamlValidation:
 *   customRules:
 *     - ./example-generic-rule.ts
 */

import { defineGenericRule } from "lens";

export default defineGenericRule({
	meta: {
		id: "custom-version-required",
		docs: {
			description: "All objects must have a version field",
			recommended: false,
		},
		type: "problem",
		fileFormats: ["yaml", "json"],
	},
	create(ctx) {
		return {
			Document(ref) {
				// Traverse the document and check for version field
				function checkObject(obj: unknown, pointer: string): void {
					if (typeof obj === "object" && obj !== null && !Array.isArray(obj)) {
						const objRecord = obj as Record<string, unknown>;
						if (!("version" in objRecord)) {
							// Find the range for this object
							const range = ctx.offsetToRange(0, 100) ?? {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 0 },
							};

							ctx.report({
								message: `Object at ${pointer} must have a "version" field`,
								uri: ref.uri,
								range,
								severity: "error",
							});
						}

						// Recursively check nested objects
						for (const [key, value] of Object.entries(objRecord)) {
							if (typeof value === "object" && value !== null) {
								checkObject(value, `${pointer}/${key}`);
							}
						}
					} else if (Array.isArray(obj)) {
						// Check array elements
						for (let i = 0; i < obj.length; i++) {
							checkObject(obj[i], `${pointer}/${i}`);
						}
					}
				}

				checkObject(ref.node, ref.pointer);
			},
		};
	},
});
