/**
 * OpenAPI Base Schemas - Shared across all OpenAPI 3.x versions
 *
 * These schemas are IDENTICAL across OpenAPI 3.0, 3.1, and 3.2.
 * Version-specific schemas are defined in their respective modules.
 *
 * @module engine/schemas/openapi-base
 */
import { z } from "zod";

// ============================================================================
// Contact Object
// ============================================================================

/**
 * Contact Object - Contact information for the exposed API.
 * Identical across all OpenAPI 3.x versions.
 */
export const ContactSchema = z
	.object({
		name: z
			.string()
			.describe("The identifying name of the contact person/organization.")
			.optional()
			.meta({
				title: "name",
				examples: ["API Support", "Developer Team", "John Smith"],
			}),
		url: z
			.url()
			.describe(
				"The URL pointing to the contact information. Must be a valid URL.",
			)
			.optional()
			.meta({
				title: "url",
				examples: [
					"https://www.example.com/support",
					"https://developer.example.com",
				],
			}),
		email: z
			.email()
			.describe(
				"The email address of the contact person/organization. Must be a valid email format.",
			)
			.optional()
			.meta({
				title: "email",
				examples: ["support@example.com", "api@company.io", "dev-team@org.com"],
			}),
	})
	.meta({
		title: "Contact",
		description:
			"Contact information for the exposed API. Provides ways for API consumers to reach the maintainers.",
		examples: [
			{
				name: "API Support",
				url: "https://example.com/support",
				email: "support@example.com",
			},
		],
	});

export type Contact = z.infer<typeof ContactSchema>;

// ============================================================================
// License Object
// ============================================================================

/**
 * License Object - License information for the exposed API.
 * Identical across all OpenAPI 3.x versions.
 */
export const LicenseSchema = z
	.object({
		name: z
			.string()
			.describe(
				"REQUIRED. The license name used for the API (e.g., 'Apache 2.0', 'MIT').",
			)
			.meta({
				title: "name",
				examples: ["Apache 2.0", "MIT", "BSD-3-Clause", "GPL-3.0"],
			}),
		identifier: z
			.string()
			.describe(
				"An SPDX license expression for the API. Mutually exclusive with 'url'. See https://spdx.org/licenses/",
			)
			.optional()
			.meta({
				title: "identifier",
				examples: ["Apache-2.0", "MIT", "BSD-3-Clause", "GPL-3.0-only"],
			}),
		url: z
			.url()
			.describe(
				"A URL to the license used for the API. Mutually exclusive with 'identifier'.",
			)
			.optional()
			.meta({
				title: "url",
				examples: [
					"https://www.apache.org/licenses/LICENSE-2.0.html",
					"https://opensource.org/licenses/MIT",
				],
			}),
	})
	.meta({
		title: "License",
		description:
			"License information for the exposed API. Use either 'identifier' (SPDX) or 'url', not both.",
		examples: [
			{ name: "Apache 2.0", identifier: "Apache-2.0" },
			{ name: "MIT", url: "https://opensource.org/licenses/MIT" },
		],
	});

export type License = z.infer<typeof LicenseSchema>;

// ============================================================================
// External Documentation Object
// ============================================================================

/**
 * External Documentation Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const ExternalDocumentationSchema = z
	.object({
		description: z
			.string()
			.describe(
				"A description of the target documentation. CommonMark syntax MAY be used for rich text.",
			)
			.optional()
			.meta({
				title: "description",
				examples: [
					"Find more info here",
					"Complete API documentation",
					"Authentication guide",
				],
			}),
		url: z
			.url()
			.describe("REQUIRED. The URL for the target documentation.")
			.meta({
				title: "url",
				examples: [
					"https://docs.example.com",
					"https://wiki.example.com/api-guide",
					"https://github.com/org/repo/wiki",
				],
			}),
	})
	.meta({
		title: "ExternalDocumentation",
		description:
			"Allows referencing an external resource for extended documentation.",
		examples: [
			{ description: "Find more info here", url: "https://docs.example.com" },
		],
	});

export type ExternalDocumentation = z.infer<typeof ExternalDocumentationSchema>;

// ============================================================================
// Reference Objects
// ============================================================================

/**
 * Reference Object - Internal JSON Pointer reference.
 * Identical across all OpenAPI 3.x versions.
 */
export const InternalRefSchema = z
	.object({
		$ref: z
			.string()
			.regex(/^#.*/)
			.describe(
				"REQUIRED. Internal JSON Pointer reference starting with '#'. Points to a reusable component within the same document.",
			)
			.meta({
				title: "$ref",
				examples: [
					"#/components/schemas/Pet",
					"#/components/schemas/Error",
					"#/components/responses/NotFound",
					"#/components/parameters/PageParam",
					"#/components/requestBodies/UserInput",
				],
			}),
		summary: z
			.string()
			.describe(
				"A short summary which by default SHOULD override that of the referenced component.",
			)
			.optional()
			.meta({
				title: "summary",
				examples: ["A pet in the store", "Standard error response"],
			}),
		description: z
			.string()
			.describe(
				"A description which by default SHOULD override that of the referenced component. CommonMark syntax MAY be used.",
			)
			.optional()
			.meta({
				title: "description",
				examples: ["Detailed description of the referenced component"],
			}),
	})
	.strict()
	.meta({
		title: "InternalRef",
		description:
			"Internal reference using JSON Pointer syntax. Must start with '#' and point to a path within the same document.",
		examples: [
			{ $ref: "#/components/schemas/Pet" },
			{
				$ref: "#/components/responses/NotFound",
				summary: "Not found response",
			},
		],
	});

export type InternalRef = z.infer<typeof InternalRefSchema>;

/**
 * Reference Object - URL reference.
 * Identical across all OpenAPI 3.x versions.
 */
export const UrlRefSchema = z
	.object({
		$ref: z
			.string()
			.regex(/^https?:\/\//)
			.describe(
				"REQUIRED. External URL reference starting with 'http://' or 'https://'. Can include a JSON Pointer fragment.",
			)
			.meta({
				title: "$ref",
				examples: [
					"https://api.example.com/schemas/Pet.yaml",
					"https://raw.githubusercontent.com/org/repo/main/common/Error.yaml",
					"https://api.example.com/common.yaml#/components/schemas/Error",
				],
			}),
		summary: z
			.string()
			.optional()
			.meta({ title: "summary", examples: ["External pet schema"] }),
		description: z
			.string()
			.optional()
			.meta({
				title: "description",
				examples: ["Referenced from external API"],
			}),
	})
	.strict()
	.meta({
		title: "UrlRef",
		description:
			"External URL reference to a schema hosted at a remote location. Supports JSON Pointer fragments.",
		examples: [
			{ $ref: "https://api.example.com/schemas/Pet.yaml" },
			{ $ref: "https://api.example.com/common.yaml#/components/schemas/Error" },
		],
	});

export type UrlRef = z.infer<typeof UrlRefSchema>;

/**
 * Reference Object - File reference.
 * Identical across all OpenAPI 3.x versions.
 */
export const FileRefSchema = z
	.object({
		$ref: z
			.string()
			.describe(
				"REQUIRED. Relative file reference path. Can include JSON Pointer fragment after '#'.",
			)
			.meta({
				title: "$ref",
				examples: [
					"./schemas/Pet.yaml",
					"../common/Error.yaml",
					"components/schemas/User.yaml",
					"./paths/pets.yaml#/get",
					"schemas/Order.yaml#/properties/id",
				],
			}),
		summary: z
			.string()
			.optional()
			.meta({
				title: "summary",
				examples: ["Pet schema from shared components"],
			}),
		description: z
			.string()
			.optional()
			.meta({ title: "description", examples: ["Defined in external file"] }),
	})
	.strict()
	.meta({
		title: "FileRef",
		description:
			"Relative file reference. Path is resolved relative to the current document. Supports JSON Pointer fragments.",
		examples: [
			{ $ref: "./schemas/Pet.yaml" },
			{ $ref: "../common/Error.yaml#/properties/message" },
		],
	});

export type FileRef = z.infer<typeof FileRefSchema>;

/**
 * Reference Object - Union of all reference types.
 * Identical across all OpenAPI 3.x versions.
 */
export const ReferenceSchema = z
	.union([InternalRefSchema, UrlRefSchema, FileRefSchema])
	.meta({
		title: "Reference",
		description:
			"Reference Object. Use $ref to reference other components. Supports internal (#/...), file (./...), and URL (https://...) references.",
		examples: [
			{ $ref: "#/components/schemas/Pet" },
			{ $ref: "./schemas/User.yaml" },
		],
	});

export type Reference = z.infer<typeof ReferenceSchema>;

// ============================================================================
// Security Requirement Object
// ============================================================================

/**
 * Security Requirement Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const SecurityRequirementSchema = z
	.record(z.string(), z.array(z.string()))
	.meta({
		title: "SecurityRequirement",
		description:
			"Security requirement object. Keys are security scheme names from components/securitySchemes. Values are arrays of required scopes (empty for non-OAuth2).",
		examples: [
			{ api_key: [] },
			{ bearerAuth: [] },
			{ oauth2: ["read:pets", "write:pets"] },
			{ basicAuth: [], api_key: [] },
		],
	});

export type SecurityRequirement = z.infer<typeof SecurityRequirementSchema>;

// ============================================================================
// XML Object
// ============================================================================

/**
 * XML Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const XMLSchema = z
	.object({
		name: z
			.string()
			.describe(
				"Replaces the name of the element/attribute used for the described schema property.",
			)
			.optional()
			.meta({
				title: "name",
				examples: ["animal", "item", "user-data"],
			}),
		namespace: z
			.url()
			.describe("The URI of the namespace definition.")
			.optional()
			.meta({
				title: "namespace",
				examples: ["http://example.com/schema/pet", "urn:example:animals"],
			}),
		prefix: z
			.string()
			.describe("The prefix to be used for the name.")
			.optional()
			.meta({
				title: "prefix",
				examples: ["smp", "ns1", "pet"],
			}),
		attribute: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"When true, the property is serialized as an XML attribute instead of an element. Default: false.",
			)
			.meta({
				title: "attribute",
				examples: [true, false],
			}),
		wrapped: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"Only for arrays. When true, wraps the array in an outer element. Default: false.",
			)
			.meta({
				title: "wrapped",
				examples: [true, false],
			}),
	})
	.meta({
		title: "XML",
		description:
			"Metadata for fine-tuned XML serialization. Controls element names, namespaces, prefixes, and array wrapping.",
		examples: [
			{ name: "animal", prefix: "pet", namespace: "http://example.com/pet" },
			{ wrapped: true, name: "tags" },
		],
	});

export type XML = z.infer<typeof XMLSchema>;

// ============================================================================
// OAuth Flow Object (Base)
// ============================================================================

/**
 * OAuth Flow Object (Base).
 * Identical across all OpenAPI 3.x versions.
 */
export const OAuthFlowSchema = z
	.object({
		authorizationUrl: z
			.url()
			.describe(
				"REQUIRED for implicit and authorizationCode flows. The authorization URL for this OAuth2 flow.",
			)
			.optional()
			.meta({
				title: "authorizationUrl",
				examples: [
					"https://auth.example.com/oauth/authorize",
					"https://login.example.com/oauth2/v2.0/authorize",
				],
			}),
		tokenUrl: z
			.url()
			.describe(
				"REQUIRED for password, clientCredentials, and authorizationCode flows. The token URL for this OAuth2 flow.",
			)
			.optional()
			.meta({
				title: "tokenUrl",
				examples: [
					"https://auth.example.com/oauth/token",
					"https://login.example.com/oauth2/v2.0/token",
				],
			}),
		refreshUrl: z
			.url()
			.describe("The URL to be used for obtaining refresh tokens.")
			.optional()
			.meta({
				title: "refreshUrl",
				examples: ["https://auth.example.com/oauth/refresh"],
			}),
		scopes: z
			.record(z.string(), z.string())
			.describe(
				"REQUIRED. Map of scope names to descriptions. Keys are scope names, values are descriptions.",
			)
			.meta({
				title: "scopes",
				examples: [
					{
						"read:pets": "Read access to pets",
						"write:pets": "Write access to pets",
					},
					{
						"user:email": "Access user email",
						"user:profile": "Access user profile",
					},
				],
			}),
	})
	.meta({
		title: "OAuthFlow",
		description:
			"Configuration for an OAuth 2.0 flow. Required fields depend on the flow type (implicit, password, clientCredentials, authorizationCode).",
		examples: [
			{
				authorizationUrl: "https://auth.example.com/oauth/authorize",
				tokenUrl: "https://auth.example.com/oauth/token",
				scopes: {
					"read:pets": "Read access to pets",
					"write:pets": "Write access to pets",
				},
			},
		],
	});

export type OAuthFlow = z.infer<typeof OAuthFlowSchema>;
