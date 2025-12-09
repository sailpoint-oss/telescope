/**
 * OpenAPI Base Schemas - Shared across all OpenAPI 3.x versions
 *
 * These schemas are IDENTICAL across OpenAPI 3.0, 3.1, and 3.2.
 * Version-specific schemas are defined in their respective modules.
 *
 * @module engine/schemas/openapi-base
 */
import { Type, type Static } from "typebox";

// ============================================================================
// Contact Object
// ============================================================================

/**
 * Contact Object - Contact information for the exposed API.
 * Identical across all OpenAPI 3.x versions.
 */
export const ContactSchema = Type.Object(
	{
		name: Type.Optional(
			Type.String({
				description: "The identifying name of the contact person/organization.",
			}),
		),
		url: Type.Optional(
			Type.String({
				format: "uri",
				description: "The URL pointing to the contact information.",
			}),
		),
		email: Type.Optional(
			Type.String({
				format: "email",
				description: "The email address of the contact person/organization.",
			}),
		),
	},
	{
		additionalProperties: true,
		description: "Contact information for the exposed API.",
	},
);

export type Contact = Static<typeof ContactSchema>;

// ============================================================================
// License Object
// ============================================================================

/**
 * License Object - License information for the exposed API.
 * Identical across all OpenAPI 3.x versions.
 */
export const LicenseSchema = Type.Object(
	{
		name: Type.String({ description: "The license name used for the API." }),
		identifier: Type.Optional(
			Type.String({ description: "An SPDX license expression for the API." }),
		),
		url: Type.Optional(
			Type.String({
				format: "uri",
				description: "A URL to the license used for the API.",
			}),
		),
	},
	{
		additionalProperties: true,
		description: "License information for the exposed API.",
	},
);

export type License = Static<typeof LicenseSchema>;

// ============================================================================
// External Documentation Object
// ============================================================================

/**
 * External Documentation Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const ExternalDocumentationSchema = Type.Object(
	{
		description: Type.Optional(
			Type.String({
				description: "A short description of the target documentation.",
			}),
		),
		url: Type.String({
			format: "uri",
			description: "The URL for the target documentation.",
		}),
	},
	{
		additionalProperties: true,
		description:
			"Allows referencing an external resource for extended documentation.",
	},
);

export type ExternalDocumentation = Static<typeof ExternalDocumentationSchema>;

// ============================================================================
// Reference Objects
// ============================================================================

/**
 * Reference Object - Internal JSON Pointer reference.
 * Identical across all OpenAPI 3.x versions.
 */
export const InternalRefSchema = Type.Object(
	{
		$ref: Type.String({
			pattern: "^#.*",
			description:
				"Internal JSON Pointer reference (e.g., #/components/schemas/User)",
		}),
		summary: Type.Optional(
			Type.String({
				description:
					"A short summary which by default SHOULD override that of the referenced component.",
			}),
		),
		description: Type.Optional(
			Type.String({
				description:
					"A description which by default SHOULD override that of the referenced component.",
			}),
		),
	},
	{
		additionalProperties: false,
		description: "Internal reference using JSON Pointer syntax.",
	},
);

export type InternalRef = Static<typeof InternalRefSchema>;

/**
 * Reference Object - URL reference.
 * Identical across all OpenAPI 3.x versions.
 */
export const UrlRefSchema = Type.Object(
	{
		$ref: Type.String({
			pattern: "^https?://",
			description: "URL reference (e.g., https://example.com/schemas/Pet.yaml)",
		}),
		summary: Type.Optional(Type.String()),
		description: Type.Optional(Type.String()),
	},
	{
		additionalProperties: false,
		description: "External URL reference.",
	},
);

export type UrlRef = Static<typeof UrlRefSchema>;

/**
 * Reference Object - File reference.
 * Identical across all OpenAPI 3.x versions.
 */
export const FileRefSchema = Type.Object(
	{
		$ref: Type.String({
			description:
				"Relative file reference (e.g., ./schemas/Pet.yaml, ../common/types.yaml, schemas/Pet.yaml)",
		}),
		summary: Type.Optional(Type.String()),
		description: Type.Optional(Type.String()),
	},
	{
		additionalProperties: false,
		description: "Relative file reference.",
	},
);

export type FileRef = Static<typeof FileRefSchema>;

/**
 * Reference Object - Union of all reference types.
 * Identical across all OpenAPI 3.x versions.
 */
export const ReferenceSchema = Type.Union(
	[InternalRefSchema, UrlRefSchema, FileRefSchema],
	{
		description:
			"A simple object to allow referencing other components in the specification.",
	},
);

export type Reference = Static<typeof ReferenceSchema>;

// ============================================================================
// Security Requirement Object
// ============================================================================

/**
 * Security Requirement Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const SecurityRequirementSchema = Type.Record(
	Type.String(),
	Type.Array(Type.String()),
	{
		description: "Lists the required security schemes for this operation.",
	},
);

export type SecurityRequirement = Static<typeof SecurityRequirementSchema>;

// ============================================================================
// XML Object
// ============================================================================

/**
 * XML Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const XMLSchema = Type.Object(
	{
		name: Type.Optional(
			Type.String({
				description:
					"Replaces the name of the element/attribute used for the described schema property.",
			}),
		),
		namespace: Type.Optional(
			Type.String({
				format: "uri",
				description: "The URI of the namespace definition.",
			}),
		),
		prefix: Type.Optional(
			Type.String({
				description: "The prefix to be used for the name.",
			}),
		),
		attribute: Type.Optional(
			Type.Boolean({
				default: false,
				description:
					"Declares whether the property definition translates to an attribute instead of an element.",
			}),
		),
		wrapped: Type.Optional(
			Type.Boolean({
				default: false,
				description:
					"May be used only for an array definition. Signifies whether the array is wrapped or not.",
			}),
		),
	},
	{
		additionalProperties: true,
		description:
			"A metadata object that allows for more fine-tuned XML model definitions.",
	},
);

export type XML = Static<typeof XMLSchema>;

// ============================================================================
// OAuth Flow Object (Base)
// ============================================================================

/**
 * OAuth Flow Object (Base).
 * Identical across all OpenAPI 3.x versions.
 */
export const OAuthFlowSchema = Type.Object(
	{
		authorizationUrl: Type.Optional(
			Type.String({
				format: "uri",
				description: "The authorization URL to be used for this flow.",
			}),
		),
		tokenUrl: Type.Optional(
			Type.String({
				format: "uri",
				description: "The token URL to be used for this flow.",
			}),
		),
		refreshUrl: Type.Optional(
			Type.String({
				format: "uri",
				description: "The URL to be used for obtaining refresh tokens.",
			}),
		),
		scopes: Type.Record(Type.String(), Type.String(), {
			description: "The available scopes for the OAuth2 security scheme.",
		}),
	},
	{
		additionalProperties: true,
		description: "Configuration details for a supported OAuth Flow.",
	},
);

export type OAuthFlow = Static<typeof OAuthFlowSchema>;

