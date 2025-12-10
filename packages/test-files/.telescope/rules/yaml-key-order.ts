/**
 * Example Generic Rule: YAML Key Order
 *
 * This is a generic rule that demonstrates validation without OpenAPI context.
 * It checks that certain keys appear in a specific order in YAML/JSON documents.
 *
 * Generic rules:
 * - Use defineGenericRule() instead of defineRule()
 * - Don't have access to OpenAPI-specific visitors (Operation, Schema, etc.)
 * - Work on any YAML/JSON document, not just OpenAPI
 * - Have access to raw text and parsed content
 */
import { defineGenericRule } from "telescope-server";

// Expected key order for OpenAPI documents
const PREFERRED_KEY_ORDER = [
	"openapi",
	"info",
	"servers",
	"security",
	"tags",
	"paths",
	"components",
	"webhooks",
	"externalDocs",
];

export default defineGenericRule({
	meta: {
		id: "custom-yaml-key-order",
		type: "suggestion",
		docs: {
			description: "Root-level keys should be in standard order",
			recommended: false,
		},
		fileFormats: ["yaml", "yml", "json"],
	},
	create(ctx) {
		return {
			Document({ node }) {
				// Only check root-level OpenAPI documents
				if (!node || typeof node !== "object" || Array.isArray(node)) {
					return;
				}

				const data = node as Record<string, unknown>;

				// Only apply to OpenAPI documents
				if (typeof data.openapi !== "string") {
					return;
				}

				const actualKeys = Object.keys(data).filter(
					(k) => !k.startsWith("x-"), // Ignore extensions
				);

				// Find keys that are out of order
				let lastIndex = -1;
				for (const key of actualKeys) {
					const preferredIndex = PREFERRED_KEY_ORDER.indexOf(key);
					if (preferredIndex === -1) continue; // Unknown key, skip

					if (preferredIndex < lastIndex) {
						// This key should have appeared earlier
						const expectedBefore = PREFERRED_KEY_ORDER[lastIndex];
						ctx.report({
							uri: ctx.file.uri,
							message: `Key "${key}" should appear before "${expectedBefore}"`,
							severity: "info",
							// Use a default range since we don't have findKeyRange
							// In a real implementation, you'd parse the raw text to find the key position
							range: {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 0 },
							},
						});
					}
					lastIndex = Math.max(lastIndex, preferredIndex);
				}
			},
		};
	},
});
