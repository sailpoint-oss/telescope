/**
 * Redocly OpenAPI Extensions
 *
 * Redocly extensions for API documentation and lifecycle management.
 * @see https://redocly.com/docs/cli/rules/
 */

import { defineExtension } from "../index.js";
import type { ExtensionSchemaMeta } from "../types.js";

/**
 * x-metadata: API lifecycle and ownership metadata.
 * Common pattern for tracking API status and team ownership.
 */
export const xMetadata: ExtensionSchemaMeta = defineExtension({
	name: "x-metadata",
	scope: ["info"],
	description:
		"API lifecycle and ownership metadata for tracking API status and team ownership",
	url: "https://redocly.com/docs/cli/custom-plugins/extended-types/",
	schema: (Type) =>
		Type.Object({
			lifecycle: Type.Optional(
				Type.Union([
					Type.Literal("development"),
					Type.Literal("staging"),
					Type.Literal("production"),
					Type.Literal("deprecated"),
				]),
			),
			"owner-team": Type.Optional(Type.String()),
			"owner-email": Type.Optional(Type.String({ format: "email" })),
		}),
});

/**
 * x-logo: Custom logo for API documentation.
 */
export const xLogo: ExtensionSchemaMeta = defineExtension({
	name: "x-logo",
	scope: ["info"],
	description: "Custom logo configuration for API documentation rendering",
	url: "https://redocly.com/docs/api-reference-docs/specification-extensions/",
	schema: (Type) =>
		Type.Object({
			url: Type.String({ format: "uri" }),
			altText: Type.Optional(Type.String()),
			backgroundColor: Type.Optional(Type.String()),
			href: Type.Optional(Type.String({ format: "uri" })),
		}),
});

/**
 * x-tagGroups: Group tags for better documentation organization.
 */
export const xTagGroups: ExtensionSchemaMeta = defineExtension({
	name: "x-tagGroups",
	scope: ["root"],
	description: "Group tags into categories for better documentation navigation",
	url: "https://redocly.com/docs/api-reference-docs/specification-extensions/x-tag-groups/",
	schema: (Type) =>
		Type.Array(
			Type.Object({
				name: Type.String(),
				tags: Type.Array(Type.String()),
			}),
		),
});

/**
 * x-displayName: Override display name for tags.
 */
export const xDisplayName: ExtensionSchemaMeta = defineExtension({
	name: "x-displayName",
	scope: ["tag"],
	description:
		"Override the display name of a tag in documentation (alternative to tag name)",
	url: "https://redocly.com/docs/api-reference-docs/specification-extensions/",
	schema: (Type) => Type.String({ minLength: 1 }),
});

/**
 * x-traitTag: Mark a tag as a trait (applies to multiple operations).
 */
export const xTraitTag: ExtensionSchemaMeta = defineExtension({
	name: "x-traitTag",
	scope: ["tag"],
	description:
		"Mark a tag as a trait that describes a common behavior across operations",
	url: "https://redocly.com/docs/api-reference-docs/specification-extensions/",
	schema: (Type) => Type.Boolean(),
});

/**
 * x-codeSamples: Add code samples to operations.
 */
export const xCodeSamples: ExtensionSchemaMeta = defineExtension({
	name: "x-codeSamples",
	scope: ["operation"],
	description: "Add code samples in various languages to demonstrate API usage",
	url: "https://redocly.com/docs/api-reference-docs/specification-extensions/x-code-samples/",
	schema: (Type) =>
		Type.Array(
			Type.Object({
				lang: Type.String(),
				label: Type.Optional(Type.String()),
				source: Type.String(),
			}),
		),
});

/**
 * x-internal: Mark an operation or schema as internal (not for public docs).
 */
export const xInternal: ExtensionSchemaMeta = defineExtension({
	name: "x-internal",
	scope: ["operation", "schema", "parameter", "pathItem"],
	description:
		"Mark an element as internal, excluding it from public documentation",
	url: "https://redocly.com/docs/api-reference-docs/specification-extensions/",
	schema: (Type) => Type.Boolean(),
});

/**
 * x-webhooks: Define webhooks (for OpenAPI 3.0 compatibility).
 */
export const xWebhooks: ExtensionSchemaMeta = defineExtension({
	name: "x-webhooks",
	scope: ["root"],
	description:
		"Define webhooks for OpenAPI 3.0 (native in 3.1+), describing callback URLs the API will call",
	url: "https://redocly.com/docs/api-reference-docs/specification-extensions/",
	schema: (Type) => Type.Record(Type.String(), Type.Unknown()),
});

/**
 * All Redocly extensions.
 */
export const redoclyExtensions: ExtensionSchemaMeta[] = [
	xMetadata,
	xLogo,
	xTagGroups,
	xDisplayName,
	xTraitTag,
	xCodeSamples,
	xInternal,
	xWebhooks,
];
