/**
 * OpenAPI 3.2 Schema Module - Complete Zod schemas for OpenAPI 3.2
 *
 * This module contains ALL schemas specific to OpenAPI 3.2.x with all latest features:
 * - openapi field pattern: "3.2.x"
 * - `webhooks` at root level
 * - `pathItems` in Components
 * - `jsonSchemaDialect` field
 * - No `nullable` keyword (use type arrays instead)
 * - `query` HTTP method in PathItem
 * - `additionalOperations` in PathItem for custom methods
 * - Tag: `parent`, `kind`, `summary` fields for tag hierarchy
 * - Server: `name` field
 * - MediaType: `itemSchema`, `itemEncoding` for streaming (SSE, JSON Lines)
 * - Discriminator: `defaultMapping` field
 * - OAuthFlows: `device` flow (Device Authorization Grant)
 * - Example: `dataValue`, `serializedValue` fields
 *
 * @module engine/schemas/openapi-3.2-module
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
import { withExtensions } from "./schema-helpers.js";

// ============================================
// Base/Simple Schemas
// ============================================

export const Contact32Schema = withExtensions({
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
			examples: ["support@example.com", "api@company.io"],
		})
		.describe("The email address of the contact person/organization.")
		.optional(),
})
	.meta({ title: "Contact" })
	.describe("Contact information for the exposed API.");

export const License32Schema = withExtensions({
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
	.describe("License information for the exposed API.");

export const Info32Schema = withExtensions({
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
	summary: z
		.string()
		.meta({
			title: "summary",
			examples: [
				"A simple pet store API",
				"Manages user accounts and authentication",
			],
		})
		.describe("A short summary of the API.")
		.optional(),
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
		.string()
		.url()
		.meta({
			title: "termsOfService",
			examples: ["https://example.com/terms", "https://api.example.com/tos"],
		})
		.describe("A URL to the Terms of Service for the API.")
		.optional(),
	contact: Contact32Schema.meta({ title: "contact" }).optional(),
	license: License32Schema.meta({ title: "license" }).optional(),
})
	.meta({ title: "Info" })
	.describe(
		"Provides metadata about the API. REQUIRED fields: title, version.",
	);

export const ServerVariable32Schema = withExtensions({
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
	.meta({ title: "ServerVariable" })
	.describe(
		"A server variable for URL template substitution. Use {variableName} in the server URL.",
	);

// OpenAPI 3.2 Server - includes `name` field
export const Server32Schema = withExtensions({
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
		.record(z.string(), ServerVariable32Schema)
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
	name: z
		.string()
		.meta({
			title: "name",
			examples: ["Production", "Staging", "Development", "Local"],
		})
		.describe(
			"OpenAPI 3.2: A unique name to identify the server. Used for display in documentation and tooling.",
		)
		.optional(),
})
	.meta({ title: "Server" })
	.describe(
		"An object representing a Server. 3.2 adds 'name' field for identification.",
	);

export const ExternalDocumentation32Schema = withExtensions({
	description: z
		.string()
		.meta({ title: "description" })
		.describe("A short description of the target documentation.")
		.optional(),
	url: z
		.string()
		.url()
		.meta({ title: "url" })
		.describe("The URL for the target documentation."),
})
	.meta({ title: "ExternalDocumentation" })
	.describe(
		"Allows referencing an external resource for extended documentation.",
	);

// OpenAPI 3.2 Tag - includes hierarchy fields (parent, kind, summary)
export const Tag32Schema = withExtensions({
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
	externalDocs: ExternalDocumentation32Schema.meta({
		title: "externalDocs",
	}).optional(),
	summary: z
		.string()
		.meta({
			title: "summary",
			examples: ["Pet operations", "User management", "Order processing"],
		})
		.describe(
			"OpenAPI 3.2: A short summary of the tag. CommonMark syntax MAY be used.",
		)
		.optional(),
	parent: z
		.string()
		.meta({
			title: "parent",
			examples: ["store", "users", "admin"],
		})
		.describe(
			"OpenAPI 3.2: The name of the parent tag for hierarchical organization.",
		)
		.optional(),
	kind: z
		.union([z.literal("nav"), z.literal("badge"), z.literal("audience")])
		.meta({
			title: "kind",
			examples: ["nav", "badge", "audience"],
		})
		.describe(
			"OpenAPI 3.2: Tag classification. 'nav' for navigation, 'badge' for badges, 'audience' for audience targeting.",
		)
		.optional(),
})
	.meta({ title: "Tag" })
	.describe(
		"Tag metadata. 3.2 adds 'parent', 'kind', and 'summary' for hierarchical tags.",
	);

// ============================================
// Reference Objects
// ============================================

export const InternalRef32Schema = withExtensions({
	$ref: z
		.string()
		.regex(/^#.*/)
		.meta({ title: "$ref" })
		.describe(
			"Internal JSON Pointer reference (e.g., #/components/schemas/User)",
		),
	summary: z
		.string()
		.meta({ title: "summary" })
		.describe(
			"A short summary which by default SHOULD override that of the referenced component.",
		)
		.optional(),
	description: z
		.string()
		.meta({ title: "description" })
		.describe(
			"A description which by default SHOULD override that of the referenced component.",
		)
		.optional(),
})
	.meta({ title: "InternalRef" })
	.describe("Internal reference using JSON Pointer syntax.");

export const UrlRef32Schema = withExtensions({
	$ref: z
		.string()
		.regex(/^https?:\/\//)
		.meta({ title: "$ref" })
		.describe("URL reference (e.g., https://example.com/schemas/Pet.yaml)"),
	summary: z.string().meta({ title: "summary" }).optional(),
	description: z.string().meta({ title: "description" }).optional(),
})
	.meta({ title: "UrlRef" })
	.describe("External URL reference.");

export const FileRef32Schema = withExtensions({
	$ref: z
		.string()
		.meta({ title: "$ref" })
		.describe(
			"Relative file reference (e.g., ./schemas/Pet.yaml, ../common/types.yaml, schemas/Pet.yaml)",
		),
	summary: z.string().meta({ title: "summary" }).optional(),
	description: z.string().meta({ title: "description" }).optional(),
})
	.meta({ title: "FileRef" })
	.describe("Relative file reference.");

export const Reference32Schema = z
	.union([InternalRef32Schema, UrlRef32Schema, FileRef32Schema])
	.meta({ title: "Reference" })
	.describe(
		"A simple object to allow referencing other components in the specification.",
	);

export const SecurityRequirement32Schema = z
	.record(z.string(), z.array(z.string()))
	.meta({ title: "SecurityRequirement" })
	.describe("Lists the required security schemes for this operation.");

export const XML32Schema = withExtensions({
	name: z
		.string()
		.meta({ title: "name" })
		.describe(
			"Replaces the name of the element/attribute used for the described schema property.",
		)
		.optional(),
	namespace: z
		.string()
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
		.default(false)
		.meta({ title: "attribute" })
		.describe(
			"Declares whether the property definition translates to an attribute instead of an element.",
		)
		.optional(),
	wrapped: z
		.boolean()
		.default(false)
		.meta({ title: "wrapped" })
		.describe(
			"May be used only for an array definition. Signifies whether the array is wrapped or not.",
		)
		.optional(),
})
	.meta({ title: "XML" })
	.describe(
		"A metadata object that allows for more fine-tuned XML model definitions.",
	);

// OpenAPI 3.2 Discriminator - includes `defaultMapping` field
export const Discriminator32Schema = withExtensions({
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
	defaultMapping: z
		.string()
		.meta({ title: "defaultMapping" })
		.describe(
			"The default mapping to use when no matching discriminator value is found.",
		)
		.optional(),
})
	.meta({ title: "Discriminator" })
	.describe(
		"When request bodies or response payloads may be one of a number of different schemas, a discriminator object can be used to aid in serialization, deserialization, and validation.",
	);

export const OAuthFlow32Schema = withExtensions({
	authorizationUrl: z
		.string()
		.url()
		.meta({ title: "authorizationUrl" })
		.describe("The authorization URL to be used for this flow.")
		.optional(),
	tokenUrl: z
		.string()
		.url()
		.meta({ title: "tokenUrl" })
		.describe("The token URL to be used for this flow.")
		.optional(),
	refreshUrl: z
		.string()
		.url()
		.meta({ title: "refreshUrl" })
		.describe("The URL to be used for obtaining refresh tokens.")
		.optional(),
	scopes: z
		.record(z.string(), z.string())
		.meta({ title: "scopes" })
		.describe("The available scopes for the OAuth2 security scheme."),
})
	.meta({ title: "OAuthFlow" })
	.describe("Configuration details for a supported OAuth Flow.");

// OpenAPI 3.2 OAuthFlows - includes `device` flow
export const OAuthFlows32Schema = withExtensions({
	implicit: OAuthFlow32Schema.meta({ title: "implicit" }).optional(),
	password: OAuthFlow32Schema.meta({ title: "password" }).optional(),
	clientCredentials: OAuthFlow32Schema.meta({
		title: "clientCredentials",
	}).optional(),
	authorizationCode: OAuthFlow32Schema.meta({
		title: "authorizationCode",
	}).optional(),
	device: OAuthFlow32Schema.meta({ title: "device" })
		.describe("Configuration for the Device Authorization Grant flow.")
		.optional(),
})
	.meta({ title: "OAuthFlows" })
	.describe("Allows configuration of the supported OAuth Flows.");

// ============================================
// Schema Object (OpenAPI 3.2 - no nullable, supports type arrays)
// Uses z.any() for recursive parts to avoid circular reference issues
// ============================================

const baseSchemaFields32 = {
	// $ref can coexist with other schema keywords in OpenAPI 3.2+ (JSON Schema 2020-12)
	$ref: z
		.string()
		.meta({
			title: "$ref",
			examples: [
				"#/components/schemas/Pet",
				"./schemas/common.yaml#/Address",
				"https://example.com/schemas/user.json",
			],
		})
		.describe("Reference to another schema. Can be combined with other keywords in OpenAPI 3.2+.")
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
	examples: z
		.array(z.unknown())
		.meta({
			title: "examples",
			examples: [
				["example1", "example2"],
				[{ id: 1 }, { id: 2 }],
			],
		})
		.describe("Array of example values.")
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
	discriminator: Discriminator32Schema.meta({
		title: "discriminator",
	}).optional(),
	xml: XML32Schema.meta({ title: "xml" }).optional(),
	externalDocs: ExternalDocumentation32Schema.meta({
		title: "externalDocs",
	}).optional(),
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
const compositionFields32 = {
	allOf: z.array(z.any()).meta({ title: "allOf" }).optional(),
	oneOf: z.array(z.any()).meta({ title: "oneOf" }).optional(),
	anyOf: z.array(z.any()).meta({ title: "anyOf" }).optional(),
	not: z.any().meta({ title: "not" }).optional(),
	if: z.any().meta({ title: "if" }).optional(),
};

// ============================================
// Type-specific field definitions (for discriminated unions)
// ============================================

const stringSpecificFields32 = {
	format: StringFormatSchema.optional(),
	pattern: z
		.string()
		.meta({ title: "pattern" })
		.describe("A regular expression pattern the string must match.")
		.optional(),
	minLength: z.number().int().min(0).meta({ title: "minLength" }).optional(),
	maxLength: z.number().int().min(0).meta({ title: "maxLength" }).optional(),
};

const numberSpecificFields32 = {
	format: NumberFormatSchema.optional(),
	multipleOf: z.number().meta({ title: "multipleOf" }).optional(),
	minimum: z.number().meta({ title: "minimum" }).optional(),
	maximum: z.number().meta({ title: "maximum" }).optional(),
	exclusiveMinimum: z.number().meta({ title: "exclusiveMinimum" }).optional(),
	exclusiveMaximum: z.number().meta({ title: "exclusiveMaximum" }).optional(),
};

const integerSpecificFields32 = {
	format: IntegerFormatSchema.optional(),
	multipleOf: z.number().meta({ title: "multipleOf" }).optional(),
	minimum: z.number().meta({ title: "minimum" }).optional(),
	maximum: z.number().meta({ title: "maximum" }).optional(),
	exclusiveMinimum: z.number().meta({ title: "exclusiveMinimum" }).optional(),
	exclusiveMaximum: z.number().meta({ title: "exclusiveMaximum" }).optional(),
};

const arraySpecificFields32 = {
	items: z.any().meta({ title: "items" }).optional(),
	prefixItems: z.array(z.any()).meta({ title: "prefixItems" }).optional(),
	contains: z.any().meta({ title: "contains" }).optional(),
	minItems: z.number().int().min(0).meta({ title: "minItems" }).optional(),
	maxItems: z.number().int().min(0).meta({ title: "maxItems" }).optional(),
	minContains: z.number().int().min(0).meta({ title: "minContains" }).optional(),
	maxContains: z.number().int().min(0).meta({ title: "maxContains" }).optional(),
	uniqueItems: z.boolean().meta({ title: "uniqueItems" }).optional(),
};

const objectSpecificFields32 = {
	properties: z.record(z.string(), z.any()).meta({ title: "properties" }).optional(),
	additionalProperties: z.union([z.any(), z.boolean()]).meta({ title: "additionalProperties" }).optional(),
	patternProperties: z.record(z.string(), z.any()).meta({ title: "patternProperties" }).optional(),
	propertyNames: z.any().meta({ title: "propertyNames" }).optional(),
	dependentSchemas: z.record(z.string(), z.any()).meta({ title: "dependentSchemas" }).optional(),
	dependentRequired: z.record(z.string(), z.array(z.string())).meta({ title: "dependentRequired" }).optional(),
	required: z.array(z.string()).meta({ title: "required" }).optional(),
	minProperties: z.number().int().min(0).meta({ title: "minProperties" }).optional(),
	maxProperties: z.number().int().min(0).meta({ title: "maxProperties" }).optional(),
	unevaluatedProperties: z.union([z.any(), z.boolean()]).meta({ title: "unevaluatedProperties" }).optional(),
};

// ============================================
// Typed Schemas with REQUIRED type literal (for discriminated union)
// ============================================

const TypedStringSchema32 = withExtensions({
	type: z.literal("string").meta({ title: "type" }),
	...stringSpecificFields32,
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "StringSchema" });

const TypedNumberSchema32 = withExtensions({
	type: z.literal("number").meta({ title: "type" }),
	...numberSpecificFields32,
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "NumberSchema" });

const TypedIntegerSchema32 = withExtensions({
	type: z.literal("integer").meta({ title: "type" }),
	...integerSpecificFields32,
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "IntegerSchema" });

const TypedBooleanSchema32 = withExtensions({
	type: z.literal("boolean").meta({ title: "type" }),
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "BooleanSchema" });

const TypedNullSchema32 = withExtensions({
	type: z.literal("null").meta({ title: "type" }),
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "NullSchema" });

const TypedArraySchema32 = withExtensions({
	type: z.literal("array").meta({ title: "type" }),
	...arraySpecificFields32,
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "ArraySchema" });

const TypedObjectSchema32 = withExtensions({
	type: z.literal("object").meta({ title: "type" }),
	...objectSpecificFields32,
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "ObjectSchema" });

/**
 * Discriminated union of typed schemas.
 * Uses "type" as the discriminator for clear error messages.
 */
const TypedSchema32 = z.discriminatedUnion("type", [
	TypedStringSchema32,
	TypedNumberSchema32,
	TypedIntegerSchema32,
	TypedBooleanSchema32,
	TypedNullSchema32,
	TypedArraySchema32,
	TypedObjectSchema32,
]).meta({ title: "TypedSchema" });

/**
 * Schema with array type (for nullable types in OpenAPI 3.2).
 * Example: type: ["string", "null"]
 */
const NullableTypeSchema32 = withExtensions({
	type: z.array(z.string()).meta({ title: "type" }),
	// Include all possible type-specific fields
	...stringSpecificFields32,
	...numberSpecificFields32,
	...arraySpecificFields32,
	...objectSpecificFields32,
	...baseSchemaFields32,
	...compositionFields32,
}).meta({ title: "NullableSchema" });

/**
 * Flexible fallback schema for:
 * - Pure $ref schemas
 * - Composition schemas (allOf/oneOf/anyOf)
 * - Schemas with $ref combined with other keywords
 * - Any valid schema without explicit type
 *
 * Includes all possible schema fields to be maximally accepting.
 */
const FlexibleSchema32 = withExtensions({
	// Allow optional type for edge cases
	type: z.string().meta({ title: "type" }).optional(),
	// Include all base fields (including $ref)
	...baseSchemaFields32,
	// Include all composition fields
	...compositionFields32,
	then: z.any().meta({ title: "then" }).optional(),
	else: z.any().meta({ title: "else" }).optional(),
	// Include all type-specific fields
	...stringSpecificFields32,
	...numberSpecificFields32,
	...arraySpecificFields32,
	...objectSpecificFields32,
}).meta({ title: "FlexibleSchema" });

// Legacy exports - use the typed versions internally
export const StringSchema32 = TypedStringSchema32
	.describe("String schema type. Use 'format' for semantic validation hints.");

export const NumberSchema32 = TypedNumberSchema32
	.describe("Number (floating-point) schema. Use 'float' or 'double' format.");

export const IntegerSchema32 = TypedIntegerSchema32
	.describe("Integer schema type. Use 'int32' or 'int64' format for size hints.");

export const BooleanSchema32 = TypedBooleanSchema32
	.describe("Boolean schema type");

export const NullSchema32 = TypedNullSchema32
	.describe("Null schema type");

export const ArraySchema32 = TypedArraySchema32
	.describe("Array schema type");

export const ObjectSchema32 = TypedObjectSchema32
	.describe("Object schema type");

/**
 * Schema Object union with proper ordering for better error messages.
 *
 * Order of checking:
 * 1. TypedSchema (discriminated union by type literal) - Clear type discrimination
 * 2. NullableTypeSchema (type is array) - For OpenAPI 3.2 nullable types
 * 3. FlexibleSchema - Fallback for $ref, composition, and edge cases
 *
 * Note: Reference32Schema is NOT in this union - $ref is handled as a field in FlexibleSchema
 * since OpenAPI 3.2+ / JSON Schema allows $ref with other keywords.
 */
export const SchemaObject32Schema = z
	.union([
		TypedSchema32,
		NullableTypeSchema32,
		FlexibleSchema32,
	])
	.meta({ title: "SchemaObject" })
	.describe(
		"The Schema Object allows the definition of input and output data types.",
	);

// ============================================
// Example Object (OpenAPI 3.2 - includes dataValue/serializedValue)
// ============================================

const ExampleObjectSchema32 = withExtensions({
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
		.string()
		.url()
		.meta({ title: "externalValue" })
		.describe("A URL that points to the literal example.")
		.optional(),
	dataValue: z
		.unknown()
		.meta({ title: "dataValue" })
		.describe(
			"The data value of the example before serialization. Mutually exclusive with value and externalValue.",
		)
		.optional(),
	serializedValue: z
		.string()
		.meta({ title: "serializedValue" })
		.describe(
			"The serialized representation of the example. Mutually exclusive with value and externalValue.",
		)
		.optional(),
})
	.meta({ title: "Example" })
	.describe("Example Object");

export const Example32Schema = z
	.union([Reference32Schema, ExampleObjectSchema32])
	.meta({ title: "Example" })
	.describe("Example Object");

// ============================================
// Link Object
// ============================================

const LinkObjectSchema32 = withExtensions({
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
	server: Server32Schema.meta({ title: "server" }).optional(),
})
	.meta({ title: "Link" })
	.describe(
		"The Link object represents a possible design-time link for a response.",
	);

export const Link32Schema = z
	.union([Reference32Schema, LinkObjectSchema32])
	.meta({ title: "Link" })
	.describe(
		"The Link object represents a possible design-time link for a response.",
	);

// ============================================
// Security Scheme Object
// ============================================

const ApiKeySecurityScheme32 = withExtensions({
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
	.meta({ title: "ApiKeySecurityScheme" })
	.describe("API Key security scheme. Simple key-based authentication.");

const HttpSecurityScheme32 = withExtensions({
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
	.meta({ title: "HttpSecurityScheme" })
	.describe("HTTP authentication security scheme (Basic, Bearer, etc.).");

const MutualTLSSecurityScheme32 = withExtensions({
	type: z.literal("mutualTLS").meta({ title: "type" }),
	description: z.string().meta({ title: "description" }).optional(),
})
	.meta({ title: "MutualTLSSecurityScheme" })
	.describe("Mutual TLS security scheme");

const OAuth2SecurityScheme32 = withExtensions({
	type: z.literal("oauth2").meta({ title: "type" }),
	flows: OAuthFlows32Schema.meta({ title: "flows" }),
	description: z.string().meta({ title: "description" }).optional(),
})
	.meta({ title: "OAuth2SecurityScheme" })
	.describe("OAuth2 security scheme");

const OpenIdConnectSecurityScheme32 = withExtensions({
	type: z.literal("openIdConnect").meta({ title: "type" }),
	openIdConnectUrl: z
		.string()
		.url()
		.meta({ title: "openIdConnectUrl" })
		.describe("OpenID Connect URL to discover OAuth2 configuration values."),
	description: z.string().meta({ title: "description" }).optional(),
})
	.meta({ title: "OpenIdConnectSecurityScheme" })
	.describe("OpenID Connect security scheme");

export const SecurityScheme32Schema = z
	.union([
		Reference32Schema,
		ApiKeySecurityScheme32,
		HttpSecurityScheme32,
		MutualTLSSecurityScheme32,
		OAuth2SecurityScheme32,
		OpenIdConnectSecurityScheme32,
	])
	.meta({ title: "SecurityScheme" })
	.describe("Defines a security scheme that can be used by the operations.");

// ============================================
// Header Object
// ============================================

const HeaderObjectSchema32 = withExtensions({
	description: z
		.string()
		.meta({ title: "description" })
		.describe("A brief description of the parameter.")
		.optional(),
	required: z
		.boolean()
		.default(false)
		.meta({ title: "required" })
		.describe("Determines whether this parameter is mandatory.")
		.optional(),
	deprecated: z
		.boolean()
		.default(false)
		.meta({ title: "deprecated" })
		.describe("Specifies that a parameter is deprecated.")
		.optional(),
	allowEmptyValue: z
		.boolean()
		.default(false)
		.meta({ title: "allowEmptyValue" })
		.describe("Sets the ability to pass empty-valued parameters.")
		.optional(),
	style: z
		.literal("simple")
		.meta({ title: "style" })
		.describe("Describes how the parameter value will be serialized.")
		.optional(),
	explode: z.boolean().meta({ title: "explode" }).optional(),
	allowReserved: z
		.boolean()
		.default(false)
		.meta({ title: "allowReserved" })
		.optional(),
	schema: SchemaObject32Schema.meta({ title: "schema" }).optional(),
	example: z.unknown().meta({ title: "example" }).optional(),
	examples: z
		.record(z.string(), Example32Schema)
		.meta({ title: "examples" })
		.optional(),
	content: z
		.record(z.string(), z.unknown())
		.meta({ title: "content" })
		.optional(),
})
	.meta({ title: "Header" })
	.describe("The Header Object follows the structure of the Parameter Object.");

export const Header32Schema = z
	.union([Reference32Schema, HeaderObjectSchema32])
	.meta({ title: "Header" })
	.describe("The Header Object follows the structure of the Parameter Object.");

// ============================================
// Encoding Object
// ============================================

export const Encoding32Schema = withExtensions({
	contentType: z
		.string()
		.meta({ title: "contentType" })
		.describe("The Content-Type for encoding a specific property.")
		.optional(),
	headers: z
		.record(z.string(), Header32Schema)
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
	explode: z.boolean().meta({ title: "explode" }).optional(),
	allowReserved: z
		.boolean()
		.default(false)
		.meta({ title: "allowReserved" })
		.optional(),
})
	.meta({ title: "Encoding" })
	.describe(
		"A single encoding definition applied to a single schema property.",
	);

// ============================================
// MediaType Object (OpenAPI 3.2 - includes streaming fields)
// ============================================

export const MediaType32Schema = withExtensions({
	schema: SchemaObject32Schema.meta({ title: "schema" }).optional(),
	example: z.unknown().meta({ title: "example" }).optional(),
	examples: z
		.record(z.string(), Example32Schema)
		.meta({ title: "examples" })
		.optional(),
	encoding: z
		.record(z.string(), Encoding32Schema)
		.meta({ title: "encoding" })
		.optional(),
	itemSchema: SchemaObject32Schema.meta({ title: "itemSchema" })
		.describe(
			"Schema for individual items in streaming responses (SSE, JSON Lines).",
		)
		.optional(),
	itemEncoding: z
		.record(z.string(), Encoding32Schema)
		.meta({ title: "itemEncoding" })
		.describe("Encoding for individual items in streaming responses.")
		.optional(),
})
	.meta({ title: "MediaType" })
	.describe(
		"Each Media Type Object provides schema and examples for the media type identified by its key.",
	);

// ============================================
// Parameter Object
// ============================================

const ParameterObjectSchema32 = withExtensions({
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
		.default(false)
		.meta({
			title: "required",
			examples: [true, false],
		})
		.describe(
			"Whether the parameter is required. MUST be true for 'in: path'.",
		)
		.optional(),
	deprecated: z
		.boolean()
		.default(false)
		.meta({
			title: "deprecated",
			examples: [true],
		})
		.describe("Marks the parameter as deprecated.")
		.optional(),
	allowEmptyValue: z
		.boolean()
		.default(false)
		.meta({
			title: "allowEmptyValue",
			examples: [true],
		})
		.describe("For query parameters only. Allows empty values (?param=).")
		.optional(),
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
		.default(false)
		.meta({
			title: "allowReserved",
			examples: [true],
		})
		.describe(
			"For query parameters. When true, allows reserved characters without encoding.",
		)
		.optional(),
	schema: SchemaObject32Schema.meta({ title: "schema" }).optional(),
	example: z
		.unknown()
		.meta({
			title: "example",
			examples: [123, "abc", ["a", "b"]],
		})
		.describe("Example value. Mutually exclusive with 'examples'.")
		.optional(),
	examples: z
		.record(z.string(), Example32Schema)
		.meta({ title: "examples" })
		.describe("Multiple named examples. Mutually exclusive with 'example'.")
		.optional(),
	content: z
		.record(z.string(), MediaType32Schema)
		.meta({
			title: "content",
			examples: [{ "application/json": { schema: { type: "object" } } }],
		})
		.describe("For complex parameters. Mutually exclusive with 'schema'.")
		.optional(),
})
	.meta({ title: "Parameter" })
	.describe("Describes a single operation parameter.");

export const Parameter32Schema = z
	.union([Reference32Schema, ParameterObjectSchema32])
	.meta({ title: "Parameter" })
	.describe("Describes a single operation parameter.");

// ============================================
// RequestBody Object
// ============================================

const RequestBodyObjectSchema32 = withExtensions({
	description: z.string().meta({ title: "description" }).optional(),
	content: z.record(z.string(), MediaType32Schema).meta({ title: "content" }),
	required: z.boolean().default(false).meta({ title: "required" }).optional(),
})
	.meta({ title: "RequestBody" })
	.describe("Describes a single request body.");

export const RequestBody32Schema = z
	.union([Reference32Schema, RequestBodyObjectSchema32])
	.meta({ title: "RequestBody" })
	.describe("Describes a single request body.");

// ============================================
// Response Object
// ============================================

const ResponseObjectSchema32 = withExtensions({
	description: z
		.string()
		.meta({ title: "description" })
		.describe("A description of the response."),
	headers: z
		.record(z.string(), Header32Schema)
		.meta({ title: "headers" })
		.optional(),
	content: z
		.record(z.string(), MediaType32Schema)
		.meta({ title: "content" })
		.optional(),
	links: z
		.record(z.string(), Link32Schema)
		.meta({ title: "links" })
		.optional(),
})
	.meta({ title: "Response" })
	.describe("Describes a single response from an API Operation.");

export const Response32Schema = z
	.union([Reference32Schema, ResponseObjectSchema32])
	.meta({ title: "Response" })
	.describe("Describes a single response from an API Operation.");

// ============================================
// Responses Object
// ============================================

export const Responses32Schema = z
	.record(
		z.union([z.string().regex(/^[1-5][0-9]{2}$/), z.literal("default")]),
		Response32Schema,
	)
	.meta({ title: "Responses" })
	.describe("A container for the expected responses of an operation.");

// ============================================
// Operation Object - defined before PathItem to avoid circular reference
// ============================================

export const Operation32Schema = withExtensions({
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
		.array(Parameter32Schema)
		.meta({ title: "parameters" })
		.describe(
			"Parameters for this operation, combined with path-level parameters.",
		)
		.optional(),
	requestBody: RequestBody32Schema.meta({ title: "requestBody" }).optional(),
	responses: Responses32Schema.meta({ title: "responses" })
		.describe("Responses is optional in 3.1+.")
		.optional(),
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
		.default(false)
		.meta({
			title: "deprecated",
			examples: [true, false],
		})
		.describe("Marks this operation as deprecated.")
		.optional(),
	security: z
		.array(SecurityRequirement32Schema)
		.meta({
			title: "security",
			examples: [[{ api_key: [] }], [{ oauth2: ["read:pets"] }]],
		})
		.describe(
			"Security requirements for this operation. Overrides root-level security.",
		)
		.optional(),
	servers: z.array(Server32Schema).meta({ title: "servers" }).optional(),
	externalDocs: ExternalDocumentation32Schema.meta({
		title: "externalDocs",
	}).optional(),
})
	.meta({ title: "Operation" })
	.describe("Describes a single API operation on a path.");

// ============================================
// PathItem Object (OpenAPI 3.2 - includes query and additionalOperations)
// ============================================

export const PathItem32Schema = withExtensions({
	$ref: z.string().meta({ title: "$ref" }).optional(),
	summary: z.string().meta({ title: "summary" }).optional(),
	description: z.string().meta({ title: "description" }).optional(),
	get: Operation32Schema.meta({ title: "get" }).optional(),
	put: Operation32Schema.meta({ title: "put" }).optional(),
	post: Operation32Schema.meta({ title: "post" }).optional(),
	delete: Operation32Schema.meta({ title: "delete" }).optional(),
	options: Operation32Schema.meta({ title: "options" }).optional(),
	head: Operation32Schema.meta({ title: "head" }).optional(),
	patch: Operation32Schema.meta({ title: "patch" }).optional(),
	trace: Operation32Schema.meta({ title: "trace" }).optional(),
	query: Operation32Schema.meta({ title: "query" })
		.describe("The QUERY HTTP method operation.")
		.optional(),
	additionalOperations: z
		.record(z.string(), Operation32Schema)
		.meta({ title: "additionalOperations" })
		.describe("Custom HTTP methods beyond the standard ones.")
		.optional(),
	servers: z.array(Server32Schema).meta({ title: "servers" }).optional(),
	parameters: z
		.array(Parameter32Schema)
		.meta({ title: "parameters" })
		.optional(),
})
	.meta({ title: "PathItem" })
	.describe("Describes the operations available on a single path.");

// ============================================
// Callback Object
// ============================================

export const Callback32Schema = z
	.union([
		Reference32Schema,
		z
			.record(z.string(), PathItem32Schema)
			.meta({ title: "Callback" })
			.describe(
				"A map of possible out-of-band callbacks related to the parent operation.",
			),
	])
	.meta({ title: "Callback" })
	.describe(
		"A map of possible out-of-band callbacks related to the parent operation.",
	);

// ============================================
// Paths Object
// ============================================

export const Paths32Schema = z
	.record(z.string().startsWith("/"), PathItem32Schema)
	.meta({ title: "Paths" })
	.describe("Holds the relative paths to the individual endpoints.");

// ============================================
// Components Object (OpenAPI 3.2 - includes pathItems)
// ============================================

export const Components32Schema = withExtensions({
	schemas: z
		.record(z.string(), SchemaObject32Schema)
		.meta({ title: "schemas" })
		.optional(),
	responses: z
		.record(z.string(), Response32Schema)
		.meta({ title: "responses" })
		.optional(),
	parameters: z
		.record(z.string(), Parameter32Schema)
		.meta({ title: "parameters" })
		.optional(),
	examples: z
		.record(z.string(), Example32Schema)
		.meta({ title: "examples" })
		.optional(),
	requestBodies: z
		.record(z.string(), RequestBody32Schema)
		.meta({ title: "requestBodies" })
		.optional(),
	headers: z
		.record(z.string(), Header32Schema)
		.meta({ title: "headers" })
		.optional(),
	securitySchemes: z
		.record(z.string(), SecurityScheme32Schema)
		.meta({ title: "securitySchemes" })
		.optional(),
	links: z
		.record(z.string(), Link32Schema)
		.meta({ title: "links" })
		.optional(),
	callbacks: z
		.record(z.string(), Callback32Schema)
		.meta({ title: "callbacks" })
		.optional(),
	pathItems: z
		.record(z.string(), PathItem32Schema)
		.meta({ title: "pathItems" })
		.optional(),
})
	.meta({ title: "Components" })
	.describe(
		"Holds a set of reusable objects for different aspects of the OAS.",
	);

// ============================================
// OpenAPI Root Object (OpenAPI 3.2 - includes webhooks and jsonSchemaDialect)
// ============================================

export const OpenAPI32Schema = withExtensions({
	openapi: z
		.string()
		.regex(/^3\.2\.\d+$/)
		.meta({
			title: "openapi",
			examples: ["3.2.0"],
		})
		.describe(
			"REQUIRED. OpenAPI version. Must be '3.2.x' for OpenAPI 3.2 documents.",
		),
	info: Info32Schema.meta({ title: "info" }).describe(
		"REQUIRED. API metadata.",
	),
	jsonSchemaDialect: z
		.string()
		.url()
		.meta({
			title: "jsonSchemaDialect",
			examples: [
				"https://json-schema.org/draft/2020-12/schema",
				"https://json-schema.org/draft/2019-09/schema",
			],
		})
		.describe(
			"The default JSON Schema dialect for Schema Objects. Defaults to Draft 2020-12.",
		)
		.optional(),
	servers: z
		.array(Server32Schema)
		.meta({
			title: "servers",
			examples: [[{ url: "https://api.example.com/v1", name: "Production" }]],
		})
		.describe(
			"Array of servers. 3.2 adds 'name' field for server identification.",
		)
		.optional(),
	paths: Paths32Schema.meta({ title: "paths" })
		.describe(
			"Available paths and operations. Optional if webhooks is provided.",
		)
		.optional(),
	webhooks: z
		.record(z.string(), PathItem32Schema)
		.meta({
			title: "webhooks",
			examples: [{ newPet: { post: { operationId: "newPetWebhook" } } }],
		})
		.describe("Incoming webhooks that the API can receive.")
		.optional(),
	components: Components32Schema.meta({ title: "components" })
		.describe("Reusable schemas, parameters, responses, etc.")
		.optional(),
	security: z
		.array(SecurityRequirement32Schema)
		.meta({
			title: "security",
			examples: [[{ api_key: [] }], [{ bearerAuth: [] }]],
		})
		.describe(
			"Default security for all operations. Can be overridden per-operation.",
		)
		.optional(),
	tags: z
		.array(Tag32Schema)
		.meta({
			title: "tags",
			examples: [
				[{ name: "pets", description: "Pet operations", kind: "nav" }],
			],
		})
		.describe(
			"Tags for grouping. 3.2 adds 'parent', 'kind', and 'summary' for hierarchy.",
		)
		.optional(),
	externalDocs: ExternalDocumentation32Schema.meta({
		title: "externalDocs",
	}).optional(),
})
	.meta({ title: "OpenAPI" })
	.describe(
		"Root object of an OpenAPI 3.2 document. Adds tag hierarchy, server names, query method.",
	);

// ============================================
// Export TypeScript types
// ============================================

export type Contact32 = z.infer<typeof Contact32Schema>;
export type License32 = z.infer<typeof License32Schema>;
export type Info32 = z.infer<typeof Info32Schema>;
export type ServerVariable32 = z.infer<typeof ServerVariable32Schema>;
export type Server32 = z.infer<typeof Server32Schema>;
export type ExternalDocumentation32 = z.infer<
	typeof ExternalDocumentation32Schema
>;
export type Tag32 = z.infer<typeof Tag32Schema>;
export type Reference32 = z.infer<typeof Reference32Schema>;
export type SecurityRequirement32 = z.infer<typeof SecurityRequirement32Schema>;
export type XML32 = z.infer<typeof XML32Schema>;
export type Discriminator32 = z.infer<typeof Discriminator32Schema>;
export type OAuthFlow32 = z.infer<typeof OAuthFlow32Schema>;
export type OAuthFlows32 = z.infer<typeof OAuthFlows32Schema>;
export type SchemaObject32 = z.infer<typeof SchemaObject32Schema>;
export type Example32 = z.infer<typeof Example32Schema>;
export type Link32 = z.infer<typeof Link32Schema>;
export type SecurityScheme32 = z.infer<typeof SecurityScheme32Schema>;
export type Header32 = z.infer<typeof Header32Schema>;
export type Encoding32 = z.infer<typeof Encoding32Schema>;
export type MediaType32 = z.infer<typeof MediaType32Schema>;
export type Parameter32 = z.infer<typeof Parameter32Schema>;
export type RequestBody32 = z.infer<typeof RequestBody32Schema>;
export type Response32 = z.infer<typeof Response32Schema>;
export type Responses32 = z.infer<typeof Responses32Schema>;
export type Callback32 = z.infer<typeof Callback32Schema>;
export type Operation32 = z.infer<typeof Operation32Schema>;
export type PathItem32 = z.infer<typeof PathItem32Schema>;
export type Paths32 = z.infer<typeof Paths32Schema>;
export type Components32 = z.infer<typeof Components32Schema>;
export type OpenAPI32 = z.infer<typeof OpenAPI32Schema>;
