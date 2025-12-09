/**
 * Speakeasy OpenAPI Extensions
 *
 * Speakeasy extensions for SDK generation configuration.
 * @see https://speakeasy.com/docs
 */

import { defineExtension } from "../index.js";
import type { ExtensionSchemaMeta } from "../types.js";

/**
 * x-speakeasy-entity: Marks a schema as a distinct entity for SDK generation.
 * Can be a boolean to enable/disable or a string for custom naming.
 */
export const xSpeakeasyEntity: ExtensionSchemaMeta = defineExtension({
	name: "x-speakeasy-entity",
	scope: ["schema"],
	description:
		"Marks a schema as a distinct entity for SDK generation, affecting how types are generated",
	url: "https://speakeasy.com/docs/customize-sdks/entities",
	schema: (Type) => Type.Union([Type.Boolean(), Type.String()]),
});

/**
 * x-speakeasy-name-override: Override the generated name for an operation or schema.
 */
export const xSpeakeasyNameOverride: ExtensionSchemaMeta = defineExtension({
	name: "x-speakeasy-name-override",
	scope: ["operation", "schema", "parameter"],
	description:
		"Override the generated name for an operation, schema, or parameter in SDKs",
	url: "https://speakeasy.com/docs/customize-sdks/method-names",
	schema: (Type) => Type.String({ minLength: 1 }),
});

/**
 * x-speakeasy-group: Group operations together in the generated SDK.
 */
export const xSpeakeasyGroup: ExtensionSchemaMeta = defineExtension({
	name: "x-speakeasy-group",
	scope: ["operation"],
	description: "Group operations together under a namespace in generated SDKs",
	url: "https://speakeasy.com/docs/customize-sdks/namespaces",
	schema: (Type) => Type.String({ minLength: 1 }),
});

/**
 * x-speakeasy-ignore: Exclude an operation or schema from SDK generation.
 */
export const xSpeakeasyIgnore: ExtensionSchemaMeta = defineExtension({
	name: "x-speakeasy-ignore",
	scope: ["operation", "schema", "parameter"],
	description: "Exclude an operation, schema, or parameter from SDK generation",
	url: "https://speakeasy.com/docs/customize-sdks/ignore",
	schema: (Type) => Type.Boolean(),
});

/**
 * x-speakeasy-retries: Configure retry behavior for an operation.
 */
export const xSpeakeasyRetries: ExtensionSchemaMeta = defineExtension({
	name: "x-speakeasy-retries",
	scope: ["operation", "root"],
	description: "Configure automatic retry behavior for failed requests",
	url: "https://speakeasy.com/docs/customize-sdks/retries",
	schema: (Type) =>
		Type.Object({
			strategy: Type.Optional(
				Type.Union([Type.Literal("backoff"), Type.Literal("none")]),
			),
			backoff: Type.Optional(
				Type.Object({
					initialInterval: Type.Optional(
						Type.Number({ exclusiveMinimum: 0 }),
					),
					maxInterval: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
					maxElapsedTime: Type.Optional(
						Type.Number({ exclusiveMinimum: 0 }),
					),
					exponent: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
				}),
			),
			statusCodes: Type.Optional(
				Type.Array(Type.Union([Type.Number(), Type.String()])),
			),
			retryConnectionErrors: Type.Optional(Type.Boolean()),
		}),
});

/**
 * x-speakeasy-errors: Define custom error types for an operation.
 */
export const xSpeakeasyErrors: ExtensionSchemaMeta = defineExtension({
	name: "x-speakeasy-errors",
	scope: ["operation"],
	description: "Define which response status codes should be treated as errors",
	url: "https://speakeasy.com/docs/customize-sdks/errors",
	schema: (Type) => Type.Array(Type.Union([Type.Number(), Type.String()])),
});

/**
 * x-speakeasy-deprecation-message: Custom deprecation message.
 */
export const xSpeakeasyDeprecationMessage: ExtensionSchemaMeta =
	defineExtension({
		name: "x-speakeasy-deprecation-message",
		scope: ["operation", "schema", "parameter"],
		description: "Custom message shown when a deprecated element is used",
		schema: (Type) => Type.String({ minLength: 1 }),
	});

/**
 * x-speakeasy-pagination: Configure pagination for list operations.
 */
export const xSpeakeasyPagination: ExtensionSchemaMeta = defineExtension({
	name: "x-speakeasy-pagination",
	scope: ["operation"],
	description: "Configure automatic pagination handling for list operations",
	url: "https://speakeasy.com/docs/customize-sdks/pagination",
	schema: (Type) =>
		Type.Object({
			type: Type.Union([
				Type.Literal("offsetLimit"),
				Type.Literal("cursor"),
				Type.Literal("link"),
			]),
			inputs: Type.Optional(
				Type.Array(
					Type.Object({
						name: Type.String(),
						in: Type.Union([
							Type.Literal("parameters"),
							Type.Literal("requestBody"),
						]),
						type: Type.Optional(
							Type.Union([
								Type.Literal("offset"),
								Type.Literal("limit"),
								Type.Literal("cursor"),
								Type.Literal("page"),
							]),
						),
					}),
				),
			),
			outputs: Type.Optional(
				Type.Array(
					Type.Object({
						name: Type.String(),
						in: Type.Union([Type.Literal("body"), Type.Literal("headers")]),
						type: Type.Optional(
							Type.Union([
								Type.Literal("nextCursor"),
								Type.Literal("nextPage"),
								Type.Literal("results"),
							]),
						),
					}),
				),
			),
		}),
});

/**
 * All Speakeasy extensions.
 */
export const speakeasyExtensions: ExtensionSchemaMeta[] = [
	xSpeakeasyEntity,
	xSpeakeasyNameOverride,
	xSpeakeasyGroup,
	xSpeakeasyIgnore,
	xSpeakeasyRetries,
	xSpeakeasyErrors,
	xSpeakeasyDeprecationMessage,
	xSpeakeasyPagination,
];
