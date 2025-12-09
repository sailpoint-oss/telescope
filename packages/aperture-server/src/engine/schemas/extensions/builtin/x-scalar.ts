/**
 * Scalar OpenAPI Extensions
 *
 * Scalar extensions for API documentation and client configuration.
 * @see https://github.com/scalar/scalar
 */

import { defineExtension } from "../index.js";
import type { ExtensionSchemaMeta } from "../types.js";

/**
 * x-scalar-environments: Define multiple named environments for API clients.
 */
export const xScalarEnvironments: ExtensionSchemaMeta = defineExtension({
	name: "x-scalar-environments",
	scope: ["root"],
	description:
		"Define multiple named environments (production, staging, etc.) with their own variables",
	url: "https://github.com/scalar/scalar/blob/main/documentation/openapi.md",
	schema: (Type) =>
		Type.Record(
			Type.String(),
			Type.Object({
				description: Type.Optional(Type.String()),
				color: Type.Optional(Type.String()),
				variables: Type.Optional(
					Type.Record(
						Type.String(),
						Type.Union([
							Type.String(),
							Type.Object({
								description: Type.Optional(Type.String()),
								default: Type.String(),
							}),
						]),
					),
				),
			}),
		),
});

/**
 * x-scalar-active-environment: Specify the default active environment.
 */
export const xScalarActiveEnvironment: ExtensionSchemaMeta = defineExtension({
	name: "x-scalar-active-environment",
	scope: ["root"],
	description:
		"Specify which environment from x-scalar-environments should be active by default",
	url: "https://github.com/scalar/scalar/blob/main/documentation/openapi.md",
	schema: (Type) => Type.String({ minLength: 1 }),
});

/**
 * x-scalar-sdk-installation: Custom SDK installation instructions.
 */
export const xScalarSdkInstallation: ExtensionSchemaMeta = defineExtension({
	name: "x-scalar-sdk-installation",
	scope: ["info"],
	description:
		"Define custom SDK installation instructions for different programming languages",
	url: "https://github.com/scalar/scalar/blob/main/documentation/openapi.md",
	schema: (Type) =>
		Type.Array(
			Type.Object({
				lang: Type.String(),
				description: Type.Optional(Type.String()),
				source: Type.Optional(Type.String()),
			}),
		),
});

/**
 * x-scalar-stability: Indicate endpoint stability level.
 */
export const xScalarStability: ExtensionSchemaMeta = defineExtension({
	name: "x-scalar-stability",
	scope: ["operation"],
	description:
		"Indicate the stability level of an endpoint (stable, experimental, deprecated)",
	url: "https://github.com/scalar/scalar/blob/main/documentation/openapi.md",
	schema: (Type) =>
		Type.Union([
			Type.Literal("stable"),
			Type.Literal("experimental"),
			Type.Literal("deprecated"),
			Type.Literal("alpha"),
			Type.Literal("beta"),
		]),
});

/**
 * x-displayName: Override display name for tags (shared with Redocly).
 */
export const xScalarDisplayName: ExtensionSchemaMeta = defineExtension({
	name: "x-displayName",
	scope: ["tag"],
	description:
		"Override the display name of a tag for more user-friendly documentation",
	url: "https://github.com/scalar/scalar/blob/main/documentation/openapi.md",
	schema: (Type) => Type.String({ minLength: 1 }),
});

/**
 * x-codeSamples: Add code samples to operations (shared with Redocly).
 */
export const xScalarCodeSamples: ExtensionSchemaMeta = defineExtension({
	name: "x-codeSamples",
	scope: ["operation"],
	description:
		"Provide code samples for various programming languages and SDKs",
	url: "https://github.com/scalar/scalar/blob/main/documentation/openapi.md",
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
 * x-scalar-icon: Custom icon for the API reference.
 */
export const xScalarIcon: ExtensionSchemaMeta = defineExtension({
	name: "x-scalar-icon",
	scope: ["root", "tag"],
	description: "Specify a custom icon for the API reference or specific tags",
	url: "https://github.com/scalar/scalar/blob/main/packages/openapi-types/README.md",
	schema: (Type) => Type.String({ minLength: 1 }),
});

/**
 * All Scalar extensions.
 */
export const scalarExtensions: ExtensionSchemaMeta[] = [
	xScalarEnvironments,
	xScalarActiveEnvironment,
	xScalarSdkInstallation,
	xScalarStability,
	xScalarDisplayName,
	xScalarCodeSamples,
	xScalarIcon,
];
