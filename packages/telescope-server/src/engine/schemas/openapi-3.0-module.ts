/**
 * OpenAPI 3.0 Schema Module - Complete Zod schemas for OpenAPI 3.0
 *
 * This module contains ALL schemas specific to OpenAPI 3.0.x:
 * - openapi field pattern: "3.0.x"
 * - Includes `nullable` keyword for schemas
 * - No `webhooks` at root level
 * - No `jsonSchemaDialect` field
 * - Components without `pathItems`
 * - Standard HTTP methods only (no `query`)
 * - No streaming fields in MediaType
 * - No `defaultMapping` in Discriminator
 * - No `device` flow in OAuthFlows
 * - No `dataValue`/`serializedValue` in Example
 *
 * @module engine/schemas/openapi-3.0-module
 */
import { z } from "zod";
import {
	ApiKeyLocationSchema,
	HttpAuthSchemeSchema,
	IntegerFormatSchema,
	NumberFormatSchema,
	ParameterLocationSchema,
	ParameterStyleSchema,
	StringFormatSchema,
} from "./data-types/format-schemas.js";

// ============================================
// Base/Simple Schemas
// ============================================

export const Contact30Schema = z
	.object({
		name: z
			.string()
			.meta({
				title: "name",
				description: "The identifying name of the contact person/organization.",
				examples: ["API Support", "Developer Team", "John Smith"],
			})
			.optional(),
		url: z
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
			.email()
			.meta({
				title: "email",
				examples: ["support@example.com", "api@company.io"],
			})
			.describe("The email address of the contact person/organization.")
			.optional(),
	})
	.meta({
		title: "Contact",
		description: "Contact information for the exposed API.",
	});

export const License30Schema = z
	.object({
		name: z
			.string()
			.meta({
				title: "name",
				examples: ["Apache 2.0", "MIT", "BSD-3-Clause", "GPL-3.0"],
			})
			.describe("REQUIRED. The license name used for the API."),
		identifier: z
			.string()
			.meta({
				title: "identifier",
				examples: ["Apache-2.0", "MIT", "BSD-3-Clause", "GPL-3.0-only"],
			})
			.describe(
				"An SPDX license expression for the API. Mutually exclusive with 'url'.",
			)
			.optional(),
		url: z
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
	.meta({
		title: "License",
		description: "License information for the exposed API.",
		examples: [
			{ name: "Apache 2.0", identifier: "Apache-2.0" },
			{ name: "MIT", url: "https://opensource.org/licenses/MIT" },
		],
	});

export const Info30Schema = z
	.object({
		title: z
			.string()
			.meta({
				title: "title",
				examples: [
					"Pet Store API",
					"User Management Service",
					"Payment Gateway",
				],
			})
			.describe("REQUIRED. The title of the API."),
		version: z
			.string()
			.meta({
				title: "version",
				examples: ["1.0.0", "2.3.1", "0.1.0-beta", "1.0.0-rc.1"],
			})
			.describe(
				"REQUIRED. The version of the API document (not the OpenAPI spec version).",
			),
		description: z
			.string()
			.meta({
				title: "description",
				examples: [
					"A sample API for managing pets",
					"This API handles user authentication and profile management",
				],
			})
			.describe(
				"A description of the API. CommonMark syntax MAY be used for rich text.",
			)
			.optional(),
		termsOfService: z
			.url()
			.meta({
				title: "termsOfService",
				examples: ["https://example.com/terms", "https://api.example.com/tos"],
			})
			.describe("A URL to the Terms of Service for the API.")
			.optional(),
		contact: Contact30Schema.optional().meta({ title: "contact" }),
		license: License30Schema.optional().meta({ title: "license" }),
	})
	.meta({
		title: "Info",
		description:
			"Provides metadata about the API. REQUIRED fields: title, version.",
		examples: [
			{ title: "Pet Store API", version: "1.0.0", description: "A sample API" },
		],
	});

export const ServerVariable30Schema = z
	.object({
		enum: z
			.array(z.string())
			.meta({
				title: "enum",
				examples: [
					["https", "http"],
					["prod", "staging", "dev"],
					["8080", "443"],
				],
			})
			.describe("An enumeration of valid string values for this variable.")
			.optional(),
		default: z
			.string()
			.meta({
				title: "default",
				examples: ["https", "api.example.com", "443", "v1"],
			})
			.describe(
				"REQUIRED. The default value for substitution if not supplied.",
			),
		description: z
			.string()
			.meta({
				title: "description",
				examples: ["The API protocol", "Server environment", "Port number"],
			})
			.describe("An optional description for the server variable.")
			.optional(),
	})
	.meta({
		title: "ServerVariable",
		description:
			"A server variable for URL template substitution. Use {variableName} in the server URL.",
		examples: [
			{ default: "https", enum: ["https", "http"] },
			{
				default: "prod",
				enum: ["prod", "staging", "dev"],
				description: "Environment",
			},
		],
	});

export const Server30Schema = z
	.object({
		url: z
			.string()
			.meta({
				title: "url",
				examples: [
					"https://api.example.com/v1",
					"https://{environment}.api.example.com",
					"{scheme}://{host}:{port}/api",
					"/api/v1",
				],
			})
			.describe(
				"REQUIRED. A URL to the target host. Supports server variables in {braces}. May be relative.",
			),
		description: z
			.string()
			.meta({
				title: "description",
				examples: ["Production server", "Staging server", "Development server"],
			})
			.describe("An optional description of the server.")
			.optional(),
		variables: z
			.record(z.string(), ServerVariable30Schema)
			.meta({
				title: "variables",
				examples: [
					{
						environment: { default: "prod", enum: ["prod", "staging", "dev"] },
					},
				],
			})
			.describe("A map of server variables for URL template substitution.")
			.optional(),
	})
	.meta({
		title: "Server",
		description:
			"An object representing a Server. Use variables for environment-specific URLs.",
		examples: [
			{ url: "https://api.example.com/v1", description: "Production server" },
		],
	});

export const ExternalDocumentation30Schema = z
	.object({
		description: z
			.string()
			.meta({ title: "description" })
			.describe("A short description of the target documentation.")
			.optional(),
		url: z
			.url()
			.meta({ title: "url" })
			.describe("The URL for the target documentation."),
	})
	.meta({
		title: "ExternalDocumentation",
		description:
			"Allows referencing an external resource for extended documentation.",
		examples: [
			{ description: "Find more info here", url: "https://docs.example.com" },
		],
	});

export const Tag30Schema = z
	.object({
		name: z
			.string()
			.meta({
				title: "name",
				examples: ["pets", "users", "orders", "authentication", "admin"],
			})
			.describe("REQUIRED. The name of the tag."),
		description: z
			.string()
			.meta({
				title: "description",
				examples: [
					"Everything about your Pets",
					"Operations for user management",
					"Access to orders",
				],
			})
			.describe("A description for the tag. CommonMark syntax MAY be used.")
			.optional(),
		externalDocs: ExternalDocumentation30Schema.meta({
			title: "externalDocs",
		}).optional(),
	})
	.meta({
		title: "Tag",
		description:
			"Adds metadata to a tag used by operations. Tags group related operations.",
		examples: [{ name: "pets", description: "Everything about your Pets" }],
	});

// ============================================
// Reference Objects
// ============================================

export const InternalRef30Schema = z
	.object({
		$ref: z
			.string()
			.regex(/^#.*/)
			.meta({ title: "$ref" })
			.describe(
				"Internal JSON Pointer reference (e.g., #/components/schemas/User)",
			),
		summary: z
			.string()
			.describe(
				"A short summary which by default SHOULD override that of the referenced component.",
			)
			.optional()
			.meta({ title: "summary" }),
		description: z
			.string()
			.describe(
				"A description which by default SHOULD override that of the referenced component.",
			)
			.optional()
			.meta({ title: "description" }),
	})
	.meta({
		title: "InternalRef",
		description: "Internal reference using JSON Pointer syntax.",
		examples: [{ $ref: "#/components/schemas/Pet" }],
	});

export const UrlRef30Schema = z
	.object({
		$ref: z
			.string()
			.regex(/^https?:\/\//)
			.meta({ title: "$ref" })
			.describe("URL reference (e.g., https://example.com/schemas/Pet.yaml)"),
		summary: z.string().optional().meta({ title: "summary" }),
		description: z.string().optional().meta({ title: "description" }),
	})
	.meta({
		title: "UrlRef",
		description: "External URL reference.",
		examples: [{ $ref: "https://api.example.com/schemas/Pet.yaml" }],
	});

export const FileRef30Schema = z
	.object({
		$ref: z
			.string()
			.meta({ title: "$ref" })
			.describe(
				"Relative file reference (e.g., ./schemas/Pet.yaml, ../common/types.yaml, schemas/Pet.yaml)",
			),
		summary: z.string().optional().meta({ title: "summary" }),
		description: z.string().optional().meta({ title: "description" }),
	})
	.meta({
		title: "FileRef",
		description: "Relative file reference.",
		examples: [{ $ref: "./schemas/Pet.yaml" }],
	});

export const Reference30Schema = z
	.union([InternalRef30Schema, UrlRef30Schema, FileRef30Schema])
	.meta({
		title: "Reference",
		description:
			"A simple object to allow referencing other components in the specification.",
		examples: [
			{ $ref: "#/components/schemas/Pet" },
			{ $ref: "./schemas/User.yaml" },
		],
	});

export const SecurityRequirement30Schema = z
	.record(z.string(), z.array(z.string()))
	.meta({
		title: "SecurityRequirement",
		description: "Lists the required security schemes for this operation.",
		examples: [{ api_key: [] }, { oauth2: ["read:pets", "write:pets"] }],
	});

export const XML30Schema = z
	.object({
		name: z
			.string()
			.meta({ title: "name" })
			.describe(
				"Replaces the name of the element/attribute used for the described schema property.",
			)
			.optional(),
		namespace: z
			.url()
			.meta({ title: "namespace" })
			.describe("The URI of the namespace definition.")
			.optional(),
		prefix: z
			.string()
			.meta({ title: "prefix" })
			.describe("The prefix to be used for the name.")
			.optional(),
		attribute: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"Declares whether the property definition translates to an attribute instead of an element.",
			)
			.meta({ title: "attribute" }),
		wrapped: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"May be used only for an array definition. Signifies whether the array is wrapped or not.",
			)
			.meta({ title: "wrapped" }),
	})
	.meta({
		title: "XML",
		description:
			"A metadata object that allows for more fine-tuned XML model definitions.",
		examples: [{ name: "animal", wrapped: true }],
	});

export const Discriminator30Schema = z
	.object({
		propertyName: z
			.string()
			.meta({ title: "propertyName" })
			.describe(
				"The name of the property in the payload that will hold the discriminator value.",
			),
		mapping: z
			.record(z.string(), z.string())
			.meta({ title: "mapping" })
			.describe(
				"An object to hold mappings between payload values and schema names or references.",
			)
			.optional(),
	})
	.meta({
		title: "Discriminator",
		description:
			"When request bodies or response payloads may be one of a number of different schemas, a discriminator object can be used to aid in serialization, deserialization, and validation.",
		examples: [
			{ propertyName: "petType", mapping: { dog: "#/components/schemas/Dog" } },
		],
	});

export const OAuthFlow30Schema = z
	.object({
		authorizationUrl: z
			.url()
			.meta({ title: "authorizationUrl" })
			.describe("The authorization URL to be used for this flow.")
			.optional(),
		tokenUrl: z
			.url()
			.meta({ title: "tokenUrl" })
			.describe("The token URL to be used for this flow.")
			.optional(),
		refreshUrl: z
			.url()
			.meta({ title: "refreshUrl" })
			.describe("The URL to be used for obtaining refresh tokens.")
			.optional(),
		scopes: z
			.record(z.string(), z.string())
			.meta({ title: "scopes" })
			.describe("The available scopes for the OAuth2 security scheme."),
	})
	.meta({
		title: "OAuthFlow",
		description: "Configuration details for a supported OAuth Flow.",
		examples: [
			{
				authorizationUrl: "https://auth.example.com/authorize",
				tokenUrl: "https://auth.example.com/token",
				scopes: { "read:pets": "Read pets" },
			},
		],
	});

export const OAuthFlows30Schema = z
	.object({
		implicit: OAuthFlow30Schema.optional().meta({ title: "implicit" }),
		password: OAuthFlow30Schema.optional().meta({ title: "password" }),
		clientCredentials: OAuthFlow30Schema.meta({
			title: "clientCredentials",
		}).optional(),
		authorizationCode: OAuthFlow30Schema.meta({
			title: "authorizationCode",
		}).optional(),
	})
	.meta({
		title: "OAuthFlows",
		description: "Allows configuration of the supported OAuth Flows.",
		examples: [
			{
				implicit: {
					authorizationUrl: "https://auth.example.com/authorize",
					scopes: {},
				},
			},
		],
	});

// ============================================
// Schema Object (OpenAPI 3.0 - with nullable keyword)
// Uses z.any() for recursive parts to avoid circular reference issues
// ============================================

const baseSchemaFields30 = {
	// $ref - in OpenAPI 3.0, $ref is typically exclusive but we allow it for flexibility
	$ref: z
		.string()
		.meta({
			title: "$ref",
			examples: ["#/components/schemas/Pet", "./schemas/common.yaml#/Address"],
		})
		.describe("Reference to another schema.")
		.optional(),
	title: z
		.string()
		.meta({
			title: "title",
			examples: ["Pet", "User", "Order", "Error"],
		})
		.describe("A title for the schema, used for documentation.")
		.optional(),
	description: z
		.string()
		.meta({
			title: "description",
			examples: ["A pet in the store", "User account information"],
		})
		.describe("A description of the schema. CommonMark syntax MAY be used.")
		.optional(),
	default: z
		.unknown()
		.meta({
			title: "default",
			examples: ["default value", 0, false, null],
		})
		.describe("The default value for this schema.")
		.optional(),
	example: z
		.unknown()
		.meta({
			title: "example",
			examples: ["example value", { id: 1, name: "Example" }],
		})
		.describe("A free-form example of an instance for this schema.")
		.optional(),
	enum: z
		.array(z.unknown())
		.meta({
			title: "enum",
			examples: [
				["active", "pending", "inactive"],
				[1, 2, 3],
			],
		})
		.describe("An array of valid values for this schema.")
		.optional(),
	const: z
		.unknown()
		.meta({
			title: "const",
			examples: ["fixed_value", 42],
		})
		.describe("A constant value that this schema must match.")
		.optional(),
	discriminator: Discriminator30Schema.meta({
		title: "discriminator",
	}).optional(),
	xml: XML30Schema.optional().meta({ title: "xml" }),
	externalDocs: ExternalDocumentation30Schema.meta({
		title: "externalDocs",
	}).optional(),
	nullable: z
		.boolean()
		.meta({
			title: "nullable",
			examples: [true, false],
		})
		.describe(
			"OpenAPI 3.0: Set to true to allow null values. In 3.1+, use type arrays instead.",
		)
		.optional(),
	readOnly: z
		.boolean()
		.meta({
			title: "readOnly",
			examples: [true],
		})
		.describe(
			"When true, the property is only returned in responses, not accepted in requests.",
		)
		.optional(),
	writeOnly: z
		.boolean()
		.meta({
			title: "writeOnly",
			examples: [true],
		})
		.describe(
			"When true, the property is only accepted in requests, not returned in responses.",
		)
		.optional(),
	deprecated: z
		.boolean()
		.meta({
			title: "deprecated",
			examples: [true],
		})
		.describe(
			"When true, indicates this schema is deprecated and should be avoided.",
		)
		.optional(),
};

// Composition fields using z.any() to break circular reference
const compositionFields30 = {
	allOf: z.array(z.any()).optional().meta({ title: "allOf" }),
	oneOf: z.array(z.any()).optional().meta({ title: "oneOf" }),
	anyOf: z.array(z.any()).optional().meta({ title: "anyOf" }),
	not: z.any().optional().meta({ title: "not" }),
};

// ============================================
// Type-specific field definitions (for discriminated unions)
// ============================================

const stringSpecificFields30 = {
	format: StringFormatSchema.optional(),
	pattern: z
		.string()
		.meta({ title: "pattern" })
		.describe("A regular expression pattern the string must match.")
		.optional(),
	minLength: z.number().int().min(0).optional().meta({ title: "minLength" }),
	maxLength: z.number().int().min(0).optional().meta({ title: "maxLength" }),
};

const numberSpecificFields30 = {
	format: NumberFormatSchema.optional(),
	multipleOf: z.number().optional().meta({ title: "multipleOf" }),
	minimum: z.number().optional().meta({ title: "minimum" }),
	maximum: z.number().optional().meta({ title: "maximum" }),
	exclusiveMinimum: z.boolean().optional().meta({ title: "exclusiveMinimum" }),
	exclusiveMaximum: z.boolean().optional().meta({ title: "exclusiveMaximum" }),
};

const integerSpecificFields30 = {
	format: IntegerFormatSchema.optional(),
	multipleOf: z.number().optional().meta({ title: "multipleOf" }),
	minimum: z.number().optional().meta({ title: "minimum" }),
	maximum: z.number().optional().meta({ title: "maximum" }),
	exclusiveMinimum: z.boolean().optional().meta({ title: "exclusiveMinimum" }),
	exclusiveMaximum: z.boolean().optional().meta({ title: "exclusiveMaximum" }),
};

const arraySpecificFields30 = {
	items: z.any().optional().meta({ title: "items" }),
	minItems: z.number().int().min(0).optional().meta({ title: "minItems" }),
	maxItems: z.number().int().min(0).optional().meta({ title: "maxItems" }),
	uniqueItems: z.boolean().optional().meta({ title: "uniqueItems" }),
};

const objectSpecificFields30 = {
	properties: z
		.record(z.string(), z.any())
		.meta({ title: "properties" })
		.optional(),
	additionalProperties: z
		.union([z.any(), z.boolean()])
		.meta({ title: "additionalProperties" })
		.optional(),
	required: z.array(z.string()).optional().meta({ title: "required" }),
	minProperties: z
		.number()
		.int()
		.min(0)
		.meta({ title: "minProperties" })
		.optional(),
	maxProperties: z
		.number()
		.int()
		.min(0)
		.meta({ title: "maxProperties" })
		.optional(),
};

// ============================================
// Typed Schemas with REQUIRED type literal (for discriminated union)
// ============================================

const TypedStringSchema30 = z
	.object({
		type: z.literal("string").meta({ title: "type" }),
		...stringSpecificFields30,
		...baseSchemaFields30,
		...compositionFields30,
	})
	.meta({ title: "StringSchema" });

const TypedNumberSchema30 = z
	.object({
		type: z.literal("number").meta({ title: "type" }),
		...numberSpecificFields30,
		...baseSchemaFields30,
		...compositionFields30,
	})
	.meta({ title: "NumberSchema" });

const TypedIntegerSchema30 = z
	.object({
		type: z.literal("integer").meta({ title: "type" }),
		...integerSpecificFields30,
		...baseSchemaFields30,
		...compositionFields30,
	})
	.meta({ title: "IntegerSchema" });

const TypedBooleanSchema30 = z
	.object({
		type: z.literal("boolean").meta({ title: "type" }),
		...baseSchemaFields30,
		...compositionFields30,
	})
	.meta({ title: "BooleanSchema" });

const TypedArraySchema30 = z
	.object({
		type: z.literal("array").meta({ title: "type" }),
		...arraySpecificFields30,
		...baseSchemaFields30,
		...compositionFields30,
	})
	.meta({ title: "ArraySchema" });

const TypedObjectSchema30 = z
	.object({
		type: z.literal("object").meta({ title: "type" }),
		...objectSpecificFields30,
		...baseSchemaFields30,
		...compositionFields30,
	})
	.meta({ title: "ObjectSchema" });

/**
 * Discriminated union of typed schemas.
 * Uses "type" as the discriminator for clear error messages.
 */
const TypedSchema30 = z
	.discriminatedUnion("type", [
		TypedStringSchema30,
		TypedNumberSchema30,
		TypedIntegerSchema30,
		TypedBooleanSchema30,
		TypedArraySchema30,
		TypedObjectSchema30,
	])
	.meta({ title: "TypedSchema" });

/**
 * Flexible fallback schema for:
 * - Pure $ref schemas
 * - Composition schemas (allOf/oneOf/anyOf)
 * - Schemas with $ref combined with other keywords
 * - Any valid schema without explicit type
 *
 * Includes all possible schema fields to be maximally accepting.
 */
const FlexibleSchema30 = z
	.object({
		// Allow optional type for edge cases
		type: z.string().optional().meta({ title: "type" }),
		// Include all base fields (including $ref)
		...baseSchemaFields30,
		// Include all composition fields
		...compositionFields30,
		// Include all type-specific fields
		...stringSpecificFields30,
		...numberSpecificFields30,
		...arraySpecificFields30,
		...objectSpecificFields30,
	})
	.meta({ title: "FlexibleSchema" });

// Legacy exports - use the typed versions internally
export const StringSchema30 = TypedStringSchema30;
export const NumberSchema30 = TypedNumberSchema30;
export const IntegerSchema30 = TypedIntegerSchema30;
export const BooleanSchema30 = TypedBooleanSchema30;
export const ArraySchema30 = TypedArraySchema30;
export const ObjectSchema30 = TypedObjectSchema30;

/**
 * Schema Object union with proper ordering for better error messages.
 *
 * Order of checking:
 * 1. TypedSchema (discriminated union by type literal) - Clear type discrimination
 * 2. FlexibleSchema - Fallback for $ref, composition, and edge cases
 *
 * Note: Reference30Schema is NOT in this union - $ref is handled as a field in FlexibleSchema.
 */
export const SchemaObject30Schema = z
	.union([TypedSchema30, FlexibleSchema30])
	.meta({
		title: "SchemaObject",
		description:
			"The Schema Object allows the definition of input and output data types.",
		examples: [
			{ type: "string", format: "email" },
			{ type: "object", properties: { id: { type: "integer" } } },
		],
	});

// ============================================
// Example Object (OpenAPI 3.0 - no dataValue/serializedValue)
// ============================================

const ExampleObjectSchema30 = z
	.object({
		summary: z
			.string()
			.meta({ title: "summary" })
			.describe("Short description for the example.")
			.optional(),
		description: z
			.string()
			.meta({ title: "description" })
			.describe("Long description for the example.")
			.optional(),
		value: z
			.unknown()
			.meta({ title: "value" })
			.describe("Embedded literal example.")
			.optional(),
		externalValue: z
			.url()
			.meta({ title: "externalValue" })
			.describe("A URL that points to the literal example.")
			.optional(),
	})
	.meta({
		title: "Example",
		description: "Example Object",
		examples: [{ summary: "A sample", value: { id: 1, name: "Example" } }],
	});

export const Example30Schema = z
	.union([Reference30Schema, ExampleObjectSchema30])
	.meta({
		title: "Example",
		description: "Example Object",
		examples: [{ summary: "A sample", value: { id: 1, name: "Example" } }],
	});

// ============================================
// Link Object
// ============================================

const LinkObjectSchema30 = z
	.object({
		operationId: z
			.string()
			.meta({ title: "operationId" })
			.describe(
				"The name of an existing, resolvable OAS operation, as defined with a unique operationId.",
			)
			.optional(),
		operationRef: z
			.string()
			.meta({ title: "operationRef" })
			.describe("A relative or absolute URI reference to an OAS operation.")
			.optional(),
		parameters: z
			.record(z.string(), z.unknown())
			.meta({ title: "parameters" })
			.describe(
				"A map representing parameters to pass to an operation as specified with operationId or identified via operationRef.",
			)
			.optional(),
		requestBody: z
			.unknown()
			.meta({ title: "requestBody" })
			.describe(
				"A literal value or {expression} to use as a request body when calling the target operation.",
			)
			.optional(),
		description: z
			.string()
			.meta({ title: "description" })
			.describe("A description of the link.")
			.optional(),
		server: Server30Schema.optional().meta({ title: "server" }),
	})
	.meta({
		title: "Link",
		description:
			"The Link object represents a possible design-time link for a response.",
		examples: [
			{
				operationId: "getUserById",
				parameters: { userId: "$response.body#/id" },
			},
		],
	});

export const Link30Schema = z
	.union([Reference30Schema, LinkObjectSchema30])
	.meta({
		title: "Link",
		description:
			"The Link object represents a possible design-time link for a response.",
		examples: [
			{
				operationId: "getUserById",
				parameters: { userId: "$response.body#/id" },
			},
		],
	});

// ============================================
// Security Scheme Object (OpenAPI 3.0 - no mutualTLS)
// ============================================

const ApiKeySecurityScheme30 = z
	.object({
		type: z
			.literal("apiKey")
			.meta({
				title: "type",
				examples: ["apiKey"],
			})
			.describe("Must be 'apiKey' for API key authentication."),
		name: z
			.string()
			.meta({
				title: "name",
				examples: ["X-API-Key", "api_key", "Authorization", "X-Auth-Token"],
			})
			.describe(
				"REQUIRED. The name of the header, query, or cookie parameter.",
			),
		in: ApiKeyLocationSchema.describe(
			"REQUIRED. Location of the API key: 'header' (most common), 'query', or 'cookie'.",
		),
		description: z
			.string()
			.meta({
				title: "description",
				examples: [
					"API key for authentication. Get yours at https://example.com/keys",
				],
			})
			.describe("A description of the security scheme.")
			.optional(),
	})
	.meta({
		title: "ApiKeySecurityScheme",
		description: "API Key security scheme. Simple key-based authentication.",
		examples: [{ type: "apiKey", name: "X-API-Key", in: "header" }],
	});

const HttpSecurityScheme30 = z
	.object({
		type: z
			.literal("http")
			.meta({
				title: "type",
				examples: ["http"],
			})
			.describe("Must be 'http' for HTTP authentication."),
		scheme: HttpAuthSchemeSchema.describe(
			"REQUIRED. HTTP auth scheme (IANA registered). Common: 'bearer', 'basic'.",
		),
		bearerFormat: z
			.string()
			.meta({
				title: "bearerFormat",
				examples: ["JWT", "opaque", "Bearer"],
			})
			.describe(
				"Hint for bearer token format. Only applicable when scheme='bearer'.",
			)
			.optional(),
		description: z
			.string()
			.meta({
				title: "description",
				examples: ["Bearer token authentication using JWT"],
			})
			.describe("A description of the security scheme.")
			.optional(),
	})
	.meta({
		title: "HttpSecurityScheme",
		description: "HTTP authentication security scheme (Basic, Bearer, etc.).",
		examples: [{ type: "http", scheme: "bearer", bearerFormat: "JWT" }],
	});

const OAuth2SecurityScheme30 = z
	.object({
		type: z.literal("oauth2").meta({ title: "type" }),
		flows: OAuthFlows30Schema.meta({ title: "flows" }),
		description: z.string().optional().meta({ title: "description" }),
	})
	.meta({
		title: "OAuth2SecurityScheme",
		description: "OAuth2 security scheme",
		examples: [
			{
				type: "oauth2",
				flows: {
					implicit: {
						authorizationUrl: "https://auth.example.com",
						scopes: {},
					},
				},
			},
		],
	});

const OpenIdConnectSecurityScheme30 = z
	.object({
		type: z.literal("openIdConnect").meta({ title: "type" }),
		openIdConnectUrl: z
			.url()
			.meta({ title: "openIdConnectUrl" })
			.describe("OpenID Connect URL to discover OAuth2 configuration values."),
		description: z.string().optional().meta({ title: "description" }),
	})
	.meta({
		title: "OpenIdConnectSecurityScheme",
		description: "OpenID Connect security scheme",
		examples: [
			{
				type: "openIdConnect",
				openIdConnectUrl:
					"https://auth.example.com/.well-known/openid-configuration",
			},
		],
	});

export const SecurityScheme30Schema = z
	.union([
		Reference30Schema,
		ApiKeySecurityScheme30,
		HttpSecurityScheme30,
		OAuth2SecurityScheme30,
		OpenIdConnectSecurityScheme30,
	])
	.meta({
		title: "SecurityScheme",
		description:
			"Defines a security scheme that can be used by the operations.",
		examples: [
			{ type: "apiKey", name: "X-API-Key", in: "header" },
			{ type: "http", scheme: "bearer" },
		],
	});

// ============================================
// Header Object
// ============================================

const HeaderObjectSchema30 = z
	.object({
		description: z
			.string()
			.meta({ title: "description" })
			.describe("A brief description of the parameter.")
			.optional(),
		required: z
			.boolean()
			.optional()
			.default(false)
			.describe("Determines whether this parameter is mandatory.")
			.meta({ title: "required" }),
		deprecated: z
			.boolean()
			.optional()
			.default(false)
			.describe("Specifies that a parameter is deprecated.")
			.meta({ title: "deprecated" }),
		allowEmptyValue: z
			.boolean()
			.optional()
			.default(false)
			.describe("Sets the ability to pass empty-valued parameters.")
			.meta({ title: "allowEmptyValue" }),
		style: z
			.literal("simple")
			.meta({ title: "style" })
			.describe("Describes how the parameter value will be serialized.")
			.optional(),
		explode: z.boolean().optional().meta({ title: "explode" }),
		allowReserved: z
			.boolean()
			.optional()
			.default(false)
			.meta({ title: "allowReserved" }),
		schema: SchemaObject30Schema.optional().meta({ title: "schema" }),
		example: z.unknown().optional().meta({ title: "example" }),
		examples: z
			.record(z.string(), Example30Schema)
			.meta({ title: "examples" })
			.optional(),
		content: z
			.record(z.string(), z.unknown())
			.meta({ title: "content" })
			.optional(),
	})
	.meta({
		title: "Header",
		description:
			"The Header Object follows the structure of the Parameter Object.",
		examples: [
			{ description: "Rate limit remaining", schema: { type: "integer" } },
		],
	});

export const Header30Schema = z
	.union([Reference30Schema, HeaderObjectSchema30])
	.meta({
		title: "Header",
		description:
			"The Header Object follows the structure of the Parameter Object.",
		examples: [
			{ description: "Rate limit remaining", schema: { type: "integer" } },
		],
	});

// ============================================
// Encoding Object
// ============================================

export const Encoding30Schema = z
	.object({
		contentType: z
			.string()
			.meta({ title: "contentType" })
			.describe("The Content-Type for encoding a specific property.")
			.optional(),
		headers: z
			.record(z.string(), Header30Schema)
			.meta({ title: "headers" })
			.optional(),
		style: z
			.union([
				z.literal("form"),
				z.literal("spaceDelimited"),
				z.literal("pipeDelimited"),
				z.literal("deepObject"),
			])
			.meta({ title: "style" })
			.optional(),
		explode: z.boolean().optional().meta({ title: "explode" }),
		allowReserved: z
			.boolean()
			.optional()
			.default(false)
			.meta({ title: "allowReserved" }),
	})
	.meta({
		title: "Encoding",
		description:
			"A single encoding definition applied to a single schema property.",
		examples: [{ contentType: "application/json", style: "form" }],
	});

// ============================================
// MediaType Object (OpenAPI 3.0 - no streaming fields)
// ============================================

export const MediaType30Schema = z
	.object({
		schema: SchemaObject30Schema.optional().meta({ title: "schema" }),
		example: z.unknown().optional().meta({ title: "example" }),
		examples: z
			.record(z.string(), Example30Schema)
			.meta({ title: "examples" })
			.optional(),
		encoding: z
			.record(z.string(), Encoding30Schema)
			.meta({ title: "encoding" })
			.optional(),
	})
	.meta({
		title: "MediaType",
		description:
			"Each Media Type Object provides schema and examples for the media type identified by its key.",
		examples: [{ schema: { type: "object" }, example: { id: 1 } }],
	});

// ============================================
// Parameter Object
// ============================================

const ParameterObjectSchema30 = z
	.object({
		name: z
			.string()
			.meta({
				title: "name",
				examples: [
					"id",
					"page",
					"limit",
					"Authorization",
					"X-Request-ID",
					"status",
				],
			})
			.describe("REQUIRED. The name of the parameter. Case-sensitive."),
		in: ParameterLocationSchema.describe(
			"REQUIRED. Location of the parameter. 'path' parameters must have required=true.",
		),
		description: z
			.string()
			.meta({
				title: "description",
				examples: [
					"Unique identifier",
					"Page number for pagination",
					"Maximum items to return",
				],
			})
			.describe(
				"A description of the parameter. CommonMark syntax MAY be used.",
			)
			.optional(),
		required: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"Whether the parameter is required. MUST be true for 'in: path'.",
			)
			.meta({
				title: "required",
				examples: [true, false],
			}),
		deprecated: z
			.boolean()
			.optional()
			.default(false)
			.describe("Marks the parameter as deprecated.")
			.meta({
				title: "deprecated",
				examples: [true],
			}),
		allowEmptyValue: z
			.boolean()
			.optional()
			.default(false)
			.describe("For query parameters only. Allows empty values (?param=).")
			.meta({
				title: "allowEmptyValue",
				examples: [true],
			}),
		style: ParameterStyleSchema.describe(
			"Serialization style. Defaults vary by 'in': query/cookie='form', path/header='simple'.",
		).optional(),
		explode: z
			.boolean()
			.meta({
				title: "explode",
				examples: [true, false],
			})
			.describe(
				"For arrays/objects. When true, each value gets its own parameter.",
			)
			.optional(),
		allowReserved: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"For query parameters. When true, allows reserved characters without encoding.",
			)
			.meta({
				title: "allowReserved",
				examples: [true],
			}),
		schema: SchemaObject30Schema.optional().meta({ title: "schema" }),
		example: z
			.unknown()
			.meta({
				title: "example",
				examples: [123, "abc", ["a", "b"]],
			})
			.describe("Example value. Mutually exclusive with 'examples'.")
			.optional(),
		examples: z
			.record(z.string(), Example30Schema)
			.meta({ title: "examples" })
			.describe("Multiple named examples. Mutually exclusive with 'example'.")
			.optional(),
		content: z
			.record(z.string(), MediaType30Schema)
			.meta({
				title: "content",
				examples: [{ "application/json": { schema: { type: "object" } } }],
			})
			.describe("For complex parameters. Mutually exclusive with 'schema'.")
			.optional(),
	})
	.meta({
		title: "Parameter",
		description: "Describes a single operation parameter.",
		examples: [
			{ name: "id", in: "path", required: true, schema: { type: "integer" } },
		],
	});

export const Parameter30Schema = z
	.union([Reference30Schema, ParameterObjectSchema30])
	.meta({
		title: "Parameter",
		description: "Describes a single operation parameter.",
		examples: [
			{ name: "id", in: "path", required: true, schema: { type: "integer" } },
		],
	});

// ============================================
// RequestBody Object
// ============================================

const RequestBodyObjectSchema30 = z
	.object({
		description: z.string().optional().meta({ title: "description" }),
		content: z.record(z.string(), MediaType30Schema).meta({ title: "content" }),
		required: z.boolean().optional().default(false).meta({ title: "required" }),
	})
	.meta({
		title: "RequestBody",
		description: "Describes a single request body.",
		examples: [
			{
				content: { "application/json": { schema: { type: "object" } } },
				required: true,
			},
		],
	});

export const RequestBody30Schema = z
	.union([Reference30Schema, RequestBodyObjectSchema30])
	.meta({
		title: "RequestBody",
		description: "Describes a single request body.",
		examples: [
			{
				content: { "application/json": { schema: { type: "object" } } },
				required: true,
			},
		],
	});

// ============================================
// Response Object
// ============================================

const ResponseObjectSchema30 = z
	.object({
		description: z
			.string()
			.meta({ title: "description" })
			.describe("A description of the response."),
		headers: z
			.record(z.string(), Header30Schema)
			.meta({ title: "headers" })
			.optional(),
		content: z
			.record(z.string(), MediaType30Schema)
			.meta({ title: "content" })
			.optional(),
		links: z
			.record(z.string(), Link30Schema)
			.meta({ title: "links" })
			.optional(),
	})
	.meta({
		title: "Response",
		description: "Describes a single response from an API Operation.",
		examples: [
			{
				description: "Successful response",
				content: { "application/json": { schema: { type: "object" } } },
			},
		],
	});

export const Response30Schema = z
	.union([Reference30Schema, ResponseObjectSchema30])
	.meta({
		title: "Response",
		description: "Describes a single response from an API Operation.",
		examples: [
			{
				description: "Successful response",
				content: { "application/json": { schema: { type: "object" } } },
			},
		],
	});

// ============================================
// Responses Object
// ============================================

export const Responses30Schema = z
	.record(
		z.union([z.string().regex(/^[1-5][0-9]{2}$/), z.literal("default")]),
		Response30Schema,
	)
	.meta({
		title: "Responses",
		description: "A container for the expected responses of an operation.",
		examples: [
			{
				"200": { description: "Success" },
				"404": { description: "Not found" },
			},
		],
	});

// ============================================
// Operation Object - defined before PathItem to avoid circular reference
// ============================================

export const Operation30Schema = z
	.object({
		tags: z
			.array(z.string())
			.meta({
				title: "tags",
				examples: [["pets"], ["users", "authentication"], ["orders", "store"]],
			})
			.describe("A list of tags for API documentation grouping.")
			.optional(),
		summary: z
			.string()
			.meta({
				title: "summary",
				examples: ["List all pets", "Create a new user", "Get order by ID"],
			})
			.describe("A short summary of the operation. Keep under ~120 characters.")
			.optional(),
		description: z
			.string()
			.meta({
				title: "description",
				examples: [
					"Returns all pets from the system that the user has access to",
				],
			})
			.describe("A verbose description. CommonMark syntax MAY be used.")
			.optional(),
		operationId: z
			.string()
			.meta({
				title: "operationId",
				examples: [
					"listPets",
					"createUser",
					"getOrderById",
					"deleteItem",
					"updateInventory",
				],
			})
			.describe(
				"Unique identifier for the operation. Used for code generation.",
			)
			.optional(),
		parameters: z
			.array(Parameter30Schema)
			.meta({ title: "parameters" })
			.describe(
				"Parameters for this operation, combined with path-level parameters.",
			)
			.optional(),
		requestBody: RequestBody30Schema.optional().meta({ title: "requestBody" }),
		responses: Responses30Schema.meta({ title: "responses" }),
		callbacks: z
			.record(z.string(), z.any())
			.meta({
				title: "callbacks",
				examples: [
					{ onPaymentComplete: { "{$request.body#/callbackUrl}": {} } },
				],
			})
			.describe("Webhooks/callbacks triggered by this operation.")
			.optional(),
		deprecated: z
			.boolean()
			.describe("Marks this operation as deprecated.")
			.optional()
			.default(false)
			.meta({
				title: "deprecated",
				examples: [true, false],
			}),
		security: z
			.array(SecurityRequirement30Schema)
			.meta({
				title: "security",
				examples: [[{ api_key: [] }], [{ oauth2: ["read:pets"] }]],
			})
			.describe(
				"Security requirements for this operation. Overrides root-level security.",
			)
			.optional(),
		servers: z.array(Server30Schema).optional().meta({ title: "servers" }),
		externalDocs: ExternalDocumentation30Schema.meta({
			title: "externalDocs",
		}).optional(),
	})
	.meta({
		title: "Operation",
		description: "Describes a single API operation on a path.",
		examples: [
			{
				summary: "List pets",
				operationId: "listPets",
				responses: { "200": { description: "OK" } },
			},
		],
	});

// ============================================
// PathItem Object (OpenAPI 3.0 - standard HTTP methods only)
// ============================================

export const PathItem30Schema = z
	.object({
		$ref: z.string().optional().meta({ title: "$ref" }),
		summary: z.string().optional().meta({ title: "summary" }),
		description: z.string().optional().meta({ title: "description" }),
		get: Operation30Schema.optional().meta({ title: "get" }),
		put: Operation30Schema.optional().meta({ title: "put" }),
		post: Operation30Schema.optional().meta({ title: "post" }),
		delete: Operation30Schema.optional().meta({ title: "delete" }),
		options: Operation30Schema.optional().meta({ title: "options" }),
		head: Operation30Schema.optional().meta({ title: "head" }),
		patch: Operation30Schema.optional().meta({ title: "patch" }),
		trace: Operation30Schema.optional().meta({ title: "trace" }),
		servers: z.array(Server30Schema).optional().meta({ title: "servers" }),
		parameters: z
			.array(Parameter30Schema)
			.meta({ title: "parameters" })
			.optional(),
	})
	.meta({
		title: "PathItem",
		description: "Describes the operations available on a single path.",
		examples: [
			{
				get: {
					summary: "List items",
					responses: { "200": { description: "OK" } },
				},
			},
		],
	});

// ============================================
// Callback Object
// ============================================

export const Callback30Schema = z
	.union([
		Reference30Schema,
		z.record(z.string(), PathItem30Schema).meta({
			title: "Callback",
			description:
				"A map of possible out-of-band callbacks related to the parent operation.",
		}),
	])
	.meta({
		title: "Callback",
		description:
			"A map of possible out-of-band callbacks related to the parent operation.",
		examples: [
			{
				"{$request.body#/callbackUrl}": {
					post: { responses: { "200": { description: "OK" } } },
				},
			},
		],
	});

// ============================================
// Paths Object
// ============================================

export const Paths30Schema = z
	.record(z.string().startsWith("/"), PathItem30Schema)
	.meta({
		title: "Paths",
		description: "Holds the relative paths to the individual endpoints.",
		examples: [
			{ "/pets": { get: { responses: { "200": { description: "OK" } } } } },
		],
	});

// ============================================
// Components Object (OpenAPI 3.0 - no pathItems)
// ============================================

export const Components30Schema: z.ZodTypeAny = z
	.object({
		schemas: z
			.record(z.string(), SchemaObject30Schema)
			.meta({ title: "schemas" })
			.optional(),
		responses: z
			.record(z.string(), Response30Schema)
			.meta({ title: "responses" })
			.optional(),
		parameters: z
			.record(z.string(), Parameter30Schema)
			.meta({ title: "parameters" })
			.optional(),
		examples: z
			.record(z.string(), Example30Schema)
			.meta({ title: "examples" })
			.optional(),
		requestBodies: z
			.record(z.string(), RequestBody30Schema)
			.meta({ title: "requestBodies" })
			.optional(),
		headers: z
			.record(z.string(), Header30Schema)
			.meta({ title: "headers" })
			.optional(),
		securitySchemes: z
			.record(z.string(), SecurityScheme30Schema)
			.meta({ title: "securitySchemes" })
			.optional(),
		links: z
			.record(z.string(), Link30Schema)
			.meta({ title: "links" })
			.optional(),
		callbacks: z
			.record(z.string(), Callback30Schema)
			.meta({ title: "callbacks" })
			.optional(),
	})
	.meta({
		title: "Components",
		description:
			"Holds a set of reusable objects for different aspects of the OAS.",
		examples: [{ schemas: { Pet: { type: "object" } } }],
	});

// ============================================
// OpenAPI Root Object (OpenAPI 3.0 - no webhooks, no jsonSchemaDialect)
// ============================================

export const OpenAPI30Schema: z.ZodTypeAny = z
	.object({
		openapi: z
			.string()
			.regex(/^3\.0\.\d+$/)
			.meta({
				title: "openapi",
				examples: ["3.0.0", "3.0.1", "3.0.2", "3.0.3"],
			})
			.describe(
				"REQUIRED. OpenAPI version. Must be '3.0.x' for OpenAPI 3.0 documents.",
			),
		info: Info30Schema.describe("REQUIRED. API metadata.").meta({
			title: "info",
		}),
		paths: Paths30Schema.describe(
			"REQUIRED. Available paths and operations for the API.",
		).meta({ title: "paths" }),
		servers: z
			.array(Server30Schema)
			.meta({
				title: "servers",
				examples: [[{ url: "https://api.example.com/v1" }]],
			})
			.describe("Array of servers. Defaults to [{ url: '/' }] if not provided.")
			.optional(),
		components: Components30Schema.meta({ title: "components" })
			.describe("Reusable schemas, parameters, responses, etc.")
			.optional(),
		security: z
			.array(SecurityRequirement30Schema)
			.meta({
				title: "security",
				examples: [[{ api_key: [] }], [{ bearerAuth: [] }]],
			})
			.describe(
				"Default security for all operations. Can be overridden per-operation.",
			)
			.optional(),
		tags: z
			.array(Tag30Schema)
			.meta({
				title: "tags",
				examples: [[{ name: "pets", description: "Pet operations" }]],
			})
			.describe("Tags for grouping operations in documentation.")
			.optional(),
		externalDocs: ExternalDocumentation30Schema.meta({
			title: "externalDocs",
		}).optional(),
	})
	.meta({
		title: "OpenAPI",
		description: "Root object of an OpenAPI 3.0 document.",
		examples: [
			{
				openapi: "3.0.3",
				info: { title: "My API", version: "1.0.0" },
				paths: {},
			},
		],
	});

// ============================================
// Export TypeScript types
// ============================================

export type Contact30 = z.infer<typeof Contact30Schema>;
export type License30 = z.infer<typeof License30Schema>;
export type Info30 = z.infer<typeof Info30Schema>;
export type ServerVariable30 = z.infer<typeof ServerVariable30Schema>;
export type Server30 = z.infer<typeof Server30Schema>;
export type ExternalDocumentation30 = z.infer<
	typeof ExternalDocumentation30Schema
>;
export type Tag30 = z.infer<typeof Tag30Schema>;
export type Reference30 = z.infer<typeof Reference30Schema>;
export type SecurityRequirement30 = z.infer<typeof SecurityRequirement30Schema>;
export type XML30 = z.infer<typeof XML30Schema>;
export type Discriminator30 = z.infer<typeof Discriminator30Schema>;
export type OAuthFlow30 = z.infer<typeof OAuthFlow30Schema>;
export type OAuthFlows30 = z.infer<typeof OAuthFlows30Schema>;
export type SchemaObject30 = z.infer<typeof SchemaObject30Schema>;
export type Example30 = z.infer<typeof Example30Schema>;
export type Link30 = z.infer<typeof Link30Schema>;
export type SecurityScheme30 = z.infer<typeof SecurityScheme30Schema>;
export type Header30 = z.infer<typeof Header30Schema>;
export type Encoding30 = z.infer<typeof Encoding30Schema>;
export type MediaType30 = z.infer<typeof MediaType30Schema>;
export type Parameter30 = z.infer<typeof Parameter30Schema>;
export type RequestBody30 = z.infer<typeof RequestBody30Schema>;
export type Response30 = z.infer<typeof Response30Schema>;
export type Responses30 = z.infer<typeof Responses30Schema>;
export type Callback30 = z.infer<typeof Callback30Schema>;
export type Operation30 = z.infer<typeof Operation30Schema>;
export type PathItem30 = z.infer<typeof PathItem30Schema>;
export type Paths30 = z.infer<typeof Paths30Schema>;
export type Components30 = z.infer<typeof Components30Schema>;
export type OpenAPI30 = z.infer<typeof OpenAPI30Schema>;
