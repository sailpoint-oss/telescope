/**
 * OpenAPI Base Schemas - Shared across all OpenAPI 3.x versions
 *
 * These schemas are IDENTICAL across OpenAPI 3.0, 3.1, and 3.2.
 * Version-specific schemas are defined in their respective modules.
 *
 * @module engine/schemas/openapi-base
 */
import { z } from "zod";
import { withExtensions } from "./schema-helpers.js";

// ============================================================================
// Contact Object
// ============================================================================

/**
 * Contact Object - Contact information for the exposed API.
 * Identical across all OpenAPI 3.x versions.
 */
export const ContactSchema = withExtensions({
	name: z
		.string()
		.meta({
			title: "name",
			examples: ["API Support", "Developer Team", "John Smith"],
		})
		.describe("The identifying name of the contact person/organization.")
		.optional(),
	url: z
		.string()
		.url()
		.meta({
			title: "url",
			examples: [
				"https://www.example.com/support",
				"https://developer.example.com",
			],
		})
		.describe(
			"The URL pointing to the contact information. Must be a valid URL.",
		)
		.optional(),
	email: z
		.string()
		.email()
		.meta({
			title: "email",
			examples: ["support@example.com", "api@company.io", "dev-team@org.com"],
		})
		.describe(
			"The email address of the contact person/organization. Must be a valid email format.",
		)
		.optional(),
})
	.meta({ title: "Contact" })
	.describe(
		"Contact information for the exposed API. Provides ways for API consumers to reach the maintainers.",
	);

export type Contact = z.infer<typeof ContactSchema>;

// ============================================================================
// License Object
// ============================================================================

/**
 * License Object - License information for the exposed API.
 * Identical across all OpenAPI 3.x versions.
 */
export const LicenseSchema = withExtensions({
	name: z
		.string()
		.meta({
			title: "name",
			examples: ["Apache 2.0", "MIT", "BSD-3-Clause", "GPL-3.0"],
		})
		.describe(
			"REQUIRED. The license name used for the API (e.g., 'Apache 2.0', 'MIT').",
		),
	identifier: z
		.string()
		.meta({
			title: "identifier",
			examples: ["Apache-2.0", "MIT", "BSD-3-Clause", "GPL-3.0-only"],
		})
		.describe(
			"An SPDX license expression for the API. Mutually exclusive with 'url'. See https://spdx.org/licenses/",
		)
		.optional(),
	url: z
		.string()
		.url()
		.meta({
			title: "url",
			examples: [
				"https://www.apache.org/licenses/LICENSE-2.0.html",
				"https://opensource.org/licenses/MIT",
			],
		})
		.describe(
			"A URL to the license used for the API. Mutually exclusive with 'identifier'.",
		)
		.optional(),
})
	.meta({ title: "License" })
	.describe(
		"License information for the exposed API. Use either 'identifier' (SPDX) or 'url', not both.",
	);

export type License = z.infer<typeof LicenseSchema>;

// ============================================================================
// External Documentation Object
// ============================================================================

/**
 * External Documentation Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const ExternalDocumentationSchema = withExtensions({
	description: z
		.string()
		.meta({
			title: "description",
			examples: [
				"Find more info here",
				"Complete API documentation",
				"Authentication guide",
			],
		})
		.describe(
			"A description of the target documentation. CommonMark syntax MAY be used for rich text.",
		)
		.optional(),
	url: z
		.string()
		.url()
		.meta({
			title: "url",
			examples: [
				"https://docs.example.com",
				"https://wiki.example.com/api-guide",
				"https://github.com/org/repo/wiki",
			],
		})
		.describe("REQUIRED. The URL for the target documentation."),
})
	.meta({ title: "ExternalDocumentation" })
	.describe(
		"Allows referencing an external resource for extended documentation.",
	);

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
			.meta({
				title: "$ref",
				examples: [
					"#/components/schemas/Pet",
					"#/components/schemas/Error",
					"#/components/responses/NotFound",
					"#/components/parameters/PageParam",
					"#/components/requestBodies/UserInput",
				],
			})
			.describe(
				"REQUIRED. Internal JSON Pointer reference starting with '#'. Points to a reusable component within the same document.",
			),
		summary: z
			.string()
			.meta({
				title: "summary",
				examples: ["A pet in the store", "Standard error response"],
			})
			.describe(
				"A short summary which by default SHOULD override that of the referenced component.",
			)
			.optional(),
		description: z
			.string()
			.meta({
				title: "description",
				examples: ["Detailed description of the referenced component"],
			})
			.describe(
				"A description which by default SHOULD override that of the referenced component. CommonMark syntax MAY be used.",
			)
			.optional(),
	})
	.strict()
	.meta({ title: "InternalRef" })
	.describe(
		"Internal reference using JSON Pointer syntax. Must start with '#' and point to a path within the same document.",
	);

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
			.meta({
				title: "$ref",
				examples: [
					"https://api.example.com/schemas/Pet.yaml",
					"https://raw.githubusercontent.com/org/repo/main/common/Error.yaml",
					"https://api.example.com/common.yaml#/components/schemas/Error",
				],
			})
			.describe(
				"REQUIRED. External URL reference starting with 'http://' or 'https://'. Can include a JSON Pointer fragment.",
			),
		summary: z
			.string()
			.meta({ title: "summary", examples: ["External pet schema"] })
			.optional(),
		description: z
			.string()
			.meta({
				title: "description",
				examples: ["Referenced from external API"],
			})
			.optional(),
	})
	.strict()
	.meta({ title: "UrlRef" })
	.describe(
		"External URL reference to a schema hosted at a remote location. Supports JSON Pointer fragments.",
	);

export type UrlRef = z.infer<typeof UrlRefSchema>;

/**
 * Reference Object - File reference.
 * Identical across all OpenAPI 3.x versions.
 */
export const FileRefSchema = z
	.object({
		$ref: z
			.string()
			.meta({
				title: "$ref",
				examples: [
					"./schemas/Pet.yaml",
					"../common/Error.yaml",
					"components/schemas/User.yaml",
					"./paths/pets.yaml#/get",
					"schemas/Order.yaml#/properties/id",
				],
			})
			.describe(
				"REQUIRED. Relative file reference path. Can include JSON Pointer fragment after '#'.",
			),
		summary: z
			.string()
			.meta({
				title: "summary",
				examples: ["Pet schema from shared components"],
			})
			.optional(),
		description: z
			.string()
			.meta({ title: "description", examples: ["Defined in external file"] })
			.optional(),
	})
	.strict()
	.meta({ title: "FileRef" })
	.describe(
		"Relative file reference. Path is resolved relative to the current document. Supports JSON Pointer fragments.",
	);

export type FileRef = z.infer<typeof FileRefSchema>;

/**
 * Reference Object - Union of all reference types.
 * Identical across all OpenAPI 3.x versions.
 */
export const ReferenceSchema = z
	.union([InternalRefSchema, UrlRefSchema, FileRefSchema])
	.meta({
		title: "Reference",
		examples: [
			{ $ref: "#/components/schemas/Pet" },
			{ $ref: "./schemas/User.yaml" },
		],
	})
	.describe(
		"Reference Object. Use $ref to reference other components. Supports internal (#/...), file (./...), and URL (https://...) references.",
	);

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
		examples: [
			{ api_key: [] },
			{ bearerAuth: [] },
			{ oauth2: ["read:pets", "write:pets"] },
			{ basicAuth: [], api_key: [] },
		],
	})
	.describe(
		"Security requirement object. Keys are security scheme names from components/securitySchemes. Values are arrays of required scopes (empty for non-OAuth2).",
	);

export type SecurityRequirement = z.infer<typeof SecurityRequirementSchema>;

// ============================================================================
// XML Object
// ============================================================================

/**
 * XML Object.
 * Identical across all OpenAPI 3.x versions.
 */
export const XMLSchema = withExtensions({
	name: z
		.string()
		.meta({
			title: "name",
			examples: ["animal", "item", "user-data"],
		})
		.describe(
			"Replaces the name of the element/attribute used for the described schema property.",
		)
		.optional(),
	namespace: z
		.string()
		.url()
		.meta({
			title: "namespace",
			examples: ["http://example.com/schema/pet", "urn:example:animals"],
		})
		.describe("The URI of the namespace definition.")
		.optional(),
	prefix: z
		.string()
		.meta({
			title: "prefix",
			examples: ["smp", "ns1", "pet"],
		})
		.describe("The prefix to be used for the name.")
		.optional(),
	attribute: z
		.boolean()
		.default(false)
		.meta({
			title: "attribute",
			examples: [true, false],
		})
		.describe(
			"When true, the property is serialized as an XML attribute instead of an element. Default: false.",
		)
		.optional(),
	wrapped: z
		.boolean()
		.default(false)
		.meta({
			title: "wrapped",
			examples: [true, false],
		})
		.describe(
			"Only for arrays. When true, wraps the array in an outer element. Default: false.",
		)
		.optional(),
})
	.meta({ title: "XML" })
	.describe(
		"Metadata for fine-tuned XML serialization. Controls element names, namespaces, prefixes, and array wrapping.",
	);

export type XML = z.infer<typeof XMLSchema>;

// ============================================================================
// OAuth Flow Object (Base)
// ============================================================================

/**
 * OAuth Flow Object (Base).
 * Identical across all OpenAPI 3.x versions.
 */
export const OAuthFlowSchema = withExtensions({
	authorizationUrl: z
		.string()
		.url()
		.meta({
			title: "authorizationUrl",
			examples: [
				"https://auth.example.com/oauth/authorize",
				"https://login.example.com/oauth2/v2.0/authorize",
			],
		})
		.describe(
			"REQUIRED for implicit and authorizationCode flows. The authorization URL for this OAuth2 flow.",
		)
		.optional(),
	tokenUrl: z
		.string()
		.url()
		.meta({
			title: "tokenUrl",
			examples: [
				"https://auth.example.com/oauth/token",
				"https://login.example.com/oauth2/v2.0/token",
			],
		})
		.describe(
			"REQUIRED for password, clientCredentials, and authorizationCode flows. The token URL for this OAuth2 flow.",
		)
		.optional(),
	refreshUrl: z
		.string()
		.url()
		.meta({
			title: "refreshUrl",
			examples: ["https://auth.example.com/oauth/refresh"],
		})
		.describe("The URL to be used for obtaining refresh tokens.")
		.optional(),
	scopes: z
		.record(z.string(), z.string())
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
		})
		.describe(
			"REQUIRED. Map of scope names to descriptions. Keys are scope names, values are descriptions.",
		),
})
	.meta({ title: "OAuthFlow" })
	.describe(
		"Configuration for an OAuth 2.0 flow. Required fields depend on the flow type (implicit, password, clientCredentials, authorizationCode).",
	);

export type OAuthFlow = z.infer<typeof OAuthFlowSchema>;
