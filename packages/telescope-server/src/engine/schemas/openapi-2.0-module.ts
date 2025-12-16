/**
 * OpenAPI 2.0 (Swagger 2.0) Schemas
 *
 * Canonical source: `specifications/2.0.md`
 *
 * This module aims to model the exact structural shape of OpenAPI 2.0 documents
 * and provide rich metadata for hover experiences.
 */

import { z } from "zod";
import { withSpec } from "./spec-meta.js";

// =============================================================================
// Common primitives
// =============================================================================

const UrlString = z
	.string()
	.describe("A URL string.")
	.meta({ examples: ["https://example.com/docs"] });

const MimeTypeString = z
	.string()
	.describe("A MIME type string (RFC 6838).")
	.meta({ examples: ["application/json", "text/plain; charset=utf-8"] });

// =============================================================================
// Reference Object
// =============================================================================

export const Reference2Schema = withSpec(
	z
		.object({
			$ref: z
				.string()
				.describe("REQUIRED. The reference string.")
				.meta({ title: "$ref", examples: ["#/definitions/Pet", "Pet.yaml"] }),
		})
		.strict()
		.meta({ title: "Reference" }),
	"2.0",
	"reference-object",
);

export type Reference2 = z.infer<typeof Reference2Schema>;

// =============================================================================
// Info / Contact / License
// =============================================================================

export const Contact2Schema = withSpec(
	z
		.object({
			name: z
				.string()
				.optional()
				.describe("The identifying name of the contact person/organization.")
				.meta({ title: "name", examples: ["API Support"] }),
			url: z
				.string()
				.optional()
				.describe("The URL pointing to the contact information. MUST be a URL.")
				.meta({ title: "url", examples: ["http://www.swagger.io/support"] }),
			email: z
				.string()
				.optional()
				.describe("The email address of the contact person/organization.")
				.meta({ title: "email", examples: ["support@swagger.io"] }),
		})
		.meta({ title: "Contact" }),
	"2.0",
	"contact-object",
);

export type Contact2 = z.infer<typeof Contact2Schema>;

export const License2Schema = withSpec(
	z
		.object({
			name: z
				.string()
				.describe("REQUIRED. The license name used for the API.")
				.meta({ title: "name", examples: ["Apache 2.0"] }),
			url: z
				.string()
				.optional()
				.describe("A URL to the license used for the API. MUST be a URL.")
				.meta({
					title: "url",
					examples: ["http://www.apache.org/licenses/LICENSE-2.0.html"],
				}),
		})
		.meta({ title: "License" }),
	"2.0",
	"license-object",
);

export type License2 = z.infer<typeof License2Schema>;

export const Info2Schema = withSpec(
	z
		.object({
			title: z
				.string()
				.describe("REQUIRED. The title of the application.")
				.meta({ title: "title", examples: ["Swagger Sample App"] }),
			description: z
				.string()
				.optional()
				.describe(
					"A short description of the application. GFM syntax can be used for rich text representation.",
				)
				.meta({ title: "description" }),
			termsOfService: z
				.string()
				.optional()
				.describe("The Terms of Service for the API.")
				.meta({
					title: "termsOfService",
					examples: ["http://swagger.io/terms/"],
				}),
			contact: Contact2Schema.optional().meta({ title: "contact" }),
			license: License2Schema.optional().meta({ title: "license" }),
			version: z
				.string()
				.describe(
					"REQUIRED. Provides the version of the application API (not the specification version).",
				)
				.meta({ title: "version", examples: ["1.0.1"] }),
		})
		.meta({ title: "Info" }),
	"2.0",
	"info-object",
);

export type Info2 = z.infer<typeof Info2Schema>;

// =============================================================================
// External Documentation
// =============================================================================

export const ExternalDocs2Schema = withSpec(
	z
		.object({
			description: z
				.string()
				.optional()
				.describe("A short description of the target documentation.")
				.meta({ title: "description" }),
			url: UrlString.describe(
				"REQUIRED. The URL for the target documentation.",
			).meta({ title: "url" }),
		})
		.meta({ title: "ExternalDocumentation" }),
	"2.0",
	"external-documentation-object",
);

export type ExternalDocs2 = z.infer<typeof ExternalDocs2Schema>;

// =============================================================================
// Schema + Items (JSON Schema Draft 4 subset)
// =============================================================================

const Xml2Schema = withSpec(
	z
		.object({
			name: z.string().optional().meta({ title: "name" }),
			namespace: z.string().optional().meta({ title: "namespace" }),
			prefix: z.string().optional().meta({ title: "prefix" }),
			attribute: z.boolean().optional().meta({ title: "attribute" }),
			wrapped: z.boolean().optional().meta({ title: "wrapped" }),
		})
		.meta({ title: "XML" }),
	"2.0",
	"xml-object",
);

export type Xml2 = z.infer<typeof Xml2Schema>;

// Forward declarations
export type SchemaObject2 = z.infer<typeof SchemaObject2Schema>;
export type ItemsObject2 = z.infer<typeof ItemsObject2Schema>;

// Items Object (subset of Schema Object, used in arrays)
export const ItemsObject2Schema: z.ZodTypeAny = withSpec(
	z
		.object({
			$ref: Reference2Schema.shape.$ref.optional().meta({ title: "$ref" }),
			type: z
				.enum(["string", "number", "integer", "boolean", "array", "object"])
				.optional()
				.meta({
					title: "type",
					description:
						"The primitive type of the items. Limited set for OpenAPI 2.0.",
					examples: ["string", "integer", "array", "object"],
				}),
			format: z
				.string()
				.optional()
				.meta({
					title: "format",
					description:
						"Format modifier for the type (e.g., int32, int64, float, double, date-time).",
					examples: ["int32", "int64", "float", "double", "date-time", "uuid"],
				}),
			items: z
				.lazy(() => ItemsObject2Schema)
				.optional()
				.meta({
					title: "items",
					description:
						"Required when type is 'array'. Describes the array items.",
					examples: [{ type: "string" }, { $ref: "#/definitions/Pet" }],
				}),
			collectionFormat: z
				.enum(["csv", "ssv", "tsv", "pipes"])
				.optional()
				.meta({
					title: "collectionFormat",
					description: "Serialization format for array parameters/items.",
					examples: ["csv", "ssv", "tsv", "pipes"],
				}),
			default: z
				.unknown()
				.optional()
				.meta({
					title: "default",
					description: "Default value hint (does not affect validation).",
					examples: ["unknown", 0, false, null],
				}),
			maximum: z
				.number()
				.optional()
				.meta({
					title: "maximum",
					description: "Inclusive upper bound for numeric values.",
					examples: [100, 1000],
				}),
			exclusiveMaximum: z
				.boolean()
				.optional()
				.meta({
					title: "exclusiveMaximum",
					description:
						"When true, the instance must be strictly less than `maximum`.",
					examples: [true, false],
				}),
			minimum: z
				.number()
				.optional()
				.meta({
					title: "minimum",
					description: "Inclusive lower bound for numeric values.",
					examples: [0, -10],
				}),
			exclusiveMinimum: z
				.boolean()
				.optional()
				.meta({
					title: "exclusiveMinimum",
					description:
						"When true, the instance must be strictly greater than `minimum`.",
					examples: [true, false],
				}),
			maxLength: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "maxLength",
					description: "Maximum string length.",
					examples: [255, 1024],
				}),
			minLength: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "minLength",
					description: "Minimum string length.",
					examples: [0, 1, 10],
				}),
			pattern: z
				.string()
				.optional()
				.meta({
					title: "pattern",
					description: "Regular expression pattern the string must match.",
					examples: ["^[a-zA-Z0-9]+$", "^\\d{3}-\\d{2}-\\d{4}$"],
				}),
			maxItems: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "maxItems",
					description: "Maximum number of items in an array.",
					examples: [10, 100],
				}),
			minItems: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "minItems",
					description: "Minimum number of items in an array.",
					examples: [0, 1],
				}),
			uniqueItems: z
				.boolean()
				.optional()
				.meta({
					title: "uniqueItems",
					description: "When true, all items in the array must be unique.",
					examples: [true, false],
				}),
			enum: z
				.array(z.unknown())
				.optional()
				.meta({
					title: "enum",
					description: "A fixed set of allowed values.",
					examples: [["small", "medium", "large"]],
				}),
			multipleOf: z
				.number()
				.optional()
				.meta({
					title: "multipleOf",
					description: "Require the number to be a multiple of this value.",
					examples: [0.5, 1, 10],
				}),
		})
		.meta({ title: "Items" }),
	"2.0",
	"items-object",
);

export const SchemaObject2Schema: z.ZodTypeAny = withSpec(
	z
		.object({
			$ref: Reference2Schema.shape.$ref.optional().meta({ title: "$ref" }),
			title: z
				.string()
				.optional()
				.meta({
					title: "title",
					description: "Short, human-readable label for this schema.",
					examples: ["Pet", "ErrorResponse"],
				}),
			description: z
				.string()
				.optional()
				.meta({
					title: "description",
					description: "Human-readable explanation of this schema.",
					examples: ["A pet available for adoption."],
				}),
			type: z
				.enum(["string", "number", "integer", "boolean", "array", "object"])
				.optional()
				.meta({
					title: "type",
					description:
						"The primitive type for this schema (OpenAPI 2.0 subset).",
					examples: ["string", "integer", "object", "array"],
				}),
			format: z
				.string()
				.optional()
				.meta({
					title: "format",
					description: "Format modifier for the type (e.g., int32, date-time).",
					examples: ["int32", "int64", "date-time", "uuid"],
				}),
			required: z
				.array(z.string())
				.optional()
				.meta({
					title: "required",
					description: "List of required property names (for object schemas).",
					examples: [["id", "name"]],
				}),
			properties: z
				.record(
					z.string(),
					z.lazy(() => SchemaObject2Schema),
				)
				.optional()
				.meta({
					title: "properties",
					description: "Property schemas keyed by property name.",
					examples: [{ id: { type: "integer" }, name: { type: "string" } }],
				}),
			additionalProperties: z
				.union([z.boolean(), z.lazy(() => SchemaObject2Schema)])
				.optional()
				.meta({
					title: "additionalProperties",
					description:
						"Controls properties not listed in `properties`: boolean to allow/disallow, or a schema to validate them.",
					examples: [true, false, { type: "string" }],
				}),
			items: z
				.lazy(() => ItemsObject2Schema)
				.optional()
				.meta({
					title: "items",
					description:
						"Required when type is 'array'. Describes the array items.",
					examples: [{ type: "string" }],
				}),
			allOf: z
				.array(z.lazy(() => SchemaObject2Schema))
				.optional()
				.meta({
					title: "allOf",
					description:
						"Require the instance to validate against all subschemas.",
					examples: [[{ $ref: "#/definitions/Base" }, { type: "object" }]],
				}),
			default: z
				.unknown()
				.optional()
				.meta({
					title: "default",
					description: "Default value hint (does not affect validation).",
					examples: ["unknown", 0, false, null],
				}),
			discriminator: z
				.string()
				.optional()
				.meta({
					title: "discriminator",
					description:
						"Supports polymorphism by naming the property holding the discriminator value.",
					examples: ["petType"],
				}),
			readOnly: z
				.boolean()
				.optional()
				.meta({
					title: "readOnly",
					description:
						"When true, the property is only returned in responses, not accepted in requests.",
					examples: [true, false],
				}),
			xml: Xml2Schema.optional().meta({ title: "xml" }),
			externalDocs: ExternalDocs2Schema.optional().meta({
				title: "externalDocs",
			}),
			example: z
				.unknown()
				.optional()
				.meta({
					title: "example",
					description: "A free-form example of an instance for this schema.",
					examples: [{ id: 1, name: "Fido" }],
				}),
			maximum: z
				.number()
				.optional()
				.meta({
					title: "maximum",
					description: "Inclusive upper bound for numeric values.",
					examples: [100, 1000],
				}),
			exclusiveMaximum: z
				.boolean()
				.optional()
				.meta({
					title: "exclusiveMaximum",
					description:
						"When true, the instance must be strictly less than `maximum`.",
					examples: [true, false],
				}),
			minimum: z
				.number()
				.optional()
				.meta({
					title: "minimum",
					description: "Inclusive lower bound for numeric values.",
					examples: [0, -10],
				}),
			exclusiveMinimum: z
				.boolean()
				.optional()
				.meta({
					title: "exclusiveMinimum",
					description:
						"When true, the instance must be strictly greater than `minimum`.",
					examples: [true, false],
				}),
			maxLength: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "maxLength",
					description: "Maximum string length.",
					examples: [255, 1024],
				}),
			minLength: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "minLength",
					description: "Minimum string length.",
					examples: [0, 1, 10],
				}),
			pattern: z
				.string()
				.optional()
				.meta({
					title: "pattern",
					description: "Regular expression pattern the string must match.",
					examples: ["^[a-zA-Z0-9]+$"],
				}),
			maxItems: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "maxItems",
					description: "Maximum number of items in an array.",
					examples: [10, 100],
				}),
			minItems: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "minItems",
					description: "Minimum number of items in an array.",
					examples: [0, 1],
				}),
			uniqueItems: z
				.boolean()
				.optional()
				.meta({
					title: "uniqueItems",
					description: "When true, all items in the array must be unique.",
					examples: [true, false],
				}),
			maxProperties: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "maxProperties",
					description: "Maximum number of properties in an object.",
					examples: [10, 100],
				}),
			minProperties: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({
					title: "minProperties",
					description: "Minimum number of properties in an object.",
					examples: [0, 1],
				}),
			enum: z
				.array(z.unknown())
				.optional()
				.meta({
					title: "enum",
					description: "A fixed set of allowed values.",
					examples: [["small", "medium", "large"]],
				}),
			multipleOf: z
				.number()
				.optional()
				.meta({
					title: "multipleOf",
					description: "Require the number to be a multiple of this value.",
					examples: [1, 2, 10],
				}),
		})
		.meta({ title: "Schema" }),
	"2.0",
	"schema-object",
);

// =============================================================================
// Parameters / Headers
// =============================================================================

const ParameterLocation2 = z.enum([
	"query",
	"header",
	"path",
	"formData",
	"body",
]);

const SimpleParameterBase2 = z.object({
	name: z
		.string()
		.describe("REQUIRED. The name of the parameter.")
		.meta({ title: "name" }),
	in: ParameterLocation2.describe(
		"REQUIRED. The location of the parameter.",
	).meta({ title: "in" }),
	description: z.string().optional().meta({ title: "description" }),
	required: z.boolean().optional().meta({ title: "required" }),
	type: z
		.enum(["string", "number", "integer", "boolean", "array", "file"])
		.describe("REQUIRED. The type of the parameter.")
		.meta({ title: "type" }),
	format: z.string().optional().meta({ title: "format" }),
	allowEmptyValue: z.boolean().optional().meta({ title: "allowEmptyValue" }),
	items: ItemsObject2Schema.optional().meta({ title: "items" }),
	collectionFormat: z
		.enum(["csv", "ssv", "tsv", "pipes", "multi"])
		.optional()
		.meta({ title: "collectionFormat" }),
	default: z.unknown().optional().meta({ title: "default" }),
	maximum: z.number().optional().meta({ title: "maximum" }),
	exclusiveMaximum: z.boolean().optional().meta({ title: "exclusiveMaximum" }),
	minimum: z.number().optional().meta({ title: "minimum" }),
	exclusiveMinimum: z.boolean().optional().meta({ title: "exclusiveMinimum" }),
	maxLength: z.number().int().min(0).optional().meta({ title: "maxLength" }),
	minLength: z.number().int().min(0).optional().meta({ title: "minLength" }),
	pattern: z.string().optional().meta({ title: "pattern" }),
	maxItems: z.number().int().min(0).optional().meta({ title: "maxItems" }),
	minItems: z.number().int().min(0).optional().meta({ title: "minItems" }),
	uniqueItems: z.boolean().optional().meta({ title: "uniqueItems" }),
	enum: z.array(z.unknown()).optional().meta({ title: "enum" }),
	multipleOf: z.number().optional().meta({ title: "multipleOf" }),
});

const BodyParameter2Schema = withSpec(
	z
		.object({
			name: z.string().meta({ title: "name" }),
			in: z.literal("body").meta({ title: "in" }),
			description: z.string().optional().meta({ title: "description" }),
			required: z.boolean().optional().meta({ title: "required" }),
			schema: SchemaObject2Schema.describe(
				"REQUIRED. The schema defining the type.",
			).meta({
				title: "schema",
			}),
		})
		.meta({ title: "BodyParameter" }),
	"2.0",
	"parameter-object",
);

const NonBodyParameter2Schema = withSpec(
	SimpleParameterBase2.meta({ title: "NonBodyParameter" }),
	"2.0",
	"parameter-object",
);

export const Parameter2Schema = z
	.union([BodyParameter2Schema, NonBodyParameter2Schema])
	.meta({ title: "Parameter" });

export type Parameter2 = z.infer<typeof Parameter2Schema>;

export const Header2Schema = withSpec(
	z
		.object({
			description: z.string().optional().meta({ title: "description" }),
			type: z
				.enum(["string", "number", "integer", "boolean", "array"])
				.meta({ title: "type" }),
			format: z.string().optional().meta({ title: "format" }),
			items: ItemsObject2Schema.optional().meta({ title: "items" }),
			collectionFormat: z
				.enum(["csv", "ssv", "tsv", "pipes"])
				.optional()
				.meta({ title: "collectionFormat" }),
			default: z.unknown().optional().meta({ title: "default" }),
			maximum: z.number().optional().meta({ title: "maximum" }),
			exclusiveMaximum: z
				.boolean()
				.optional()
				.meta({ title: "exclusiveMaximum" }),
			minimum: z.number().optional().meta({ title: "minimum" }),
			exclusiveMinimum: z
				.boolean()
				.optional()
				.meta({ title: "exclusiveMinimum" }),
			maxLength: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({ title: "maxLength" }),
			minLength: z
				.number()
				.int()
				.min(0)
				.optional()
				.meta({ title: "minLength" }),
			pattern: z.string().optional().meta({ title: "pattern" }),
			maxItems: z.number().int().min(0).optional().meta({ title: "maxItems" }),
			minItems: z.number().int().min(0).optional().meta({ title: "minItems" }),
			uniqueItems: z.boolean().optional().meta({ title: "uniqueItems" }),
			enum: z.array(z.unknown()).optional().meta({ title: "enum" }),
			multipleOf: z.number().optional().meta({ title: "multipleOf" }),
		})
		.meta({ title: "Header" }),
	"2.0",
	"header-object",
);

export type Header2 = z.infer<typeof Header2Schema>;

// =============================================================================
// Responses
// =============================================================================

export const Response2Schema = withSpec(
	z
		.object({
			description: z
				.string()
				.describe("REQUIRED. A short description of the response.")
				.meta({ title: "description" }),
			schema: SchemaObject2Schema.optional().meta({ title: "schema" }),
			headers: z
				.record(z.string(), Header2Schema)
				.optional()
				.meta({ title: "headers" }),
			examples: z
				.record(z.string(), z.unknown())
				.optional()
				.meta({ title: "examples" }),
		})
		.meta({ title: "Response" }),
	"2.0",
	"response-object",
);

export type Response2 = z.infer<typeof Response2Schema>;

export const Responses2Schema = withSpec(
	z
		.object({
			default: z
				.union([Response2Schema, Reference2Schema])
				.optional()
				.meta({ title: "default" }),
		})
		.meta({ title: "Responses" }),
	"2.0",
	"responses-object",
);

export type Responses2 = z.infer<typeof Responses2Schema>;

// =============================================================================
// Operation / Path Item / Paths
// =============================================================================

const SecurityRequirement2Schema = withSpec(
	z
		.record(z.string(), z.array(z.string()))
		.meta({ title: "SecurityRequirement" }),
	"2.0",
	"security-requirement-object",
);

export const Operation2Schema: z.ZodTypeAny = withSpec(
	z
		.object({
			tags: z.array(z.string()).optional().meta({ title: "tags" }),
			summary: z.string().optional().meta({ title: "summary" }),
			description: z.string().optional().meta({ title: "description" }),
			externalDocs: ExternalDocs2Schema.optional().meta({
				title: "externalDocs",
			}),
			operationId: z.string().optional().meta({ title: "operationId" }),
			consumes: z.array(MimeTypeString).optional().meta({ title: "consumes" }),
			produces: z.array(MimeTypeString).optional().meta({ title: "produces" }),
			parameters: z
				.array(z.union([Parameter2Schema, Reference2Schema]))
				.optional()
				.meta({ title: "parameters" }),
			responses: Responses2Schema.describe(
				"REQUIRED. The responses for this operation.",
			).meta({ title: "responses" }),
			schemes: z
				.array(z.enum(["http", "https", "ws", "wss"]))
				.optional()
				.meta({ title: "schemes" }),
			deprecated: z.boolean().optional().meta({ title: "deprecated" }),
			security: z
				.array(SecurityRequirement2Schema)
				.optional()
				.meta({ title: "security" }),
		})
		.meta({ title: "Operation" }),
	"2.0",
	"operation-object",
);

export type Operation2 = z.infer<typeof Operation2Schema>;

export const PathItem2Schema: z.ZodTypeAny = withSpec(
	z
		.object({
			$ref: z.string().optional().meta({ title: "$ref" }),
			get: Operation2Schema.optional().meta({ title: "get" }),
			put: Operation2Schema.optional().meta({ title: "put" }),
			post: Operation2Schema.optional().meta({ title: "post" }),
			delete: Operation2Schema.optional().meta({ title: "delete" }),
			options: Operation2Schema.optional().meta({ title: "options" }),
			head: Operation2Schema.optional().meta({ title: "head" }),
			patch: Operation2Schema.optional().meta({ title: "patch" }),
			parameters: z
				.array(z.union([Parameter2Schema, Reference2Schema]))
				.optional()
				.meta({ title: "parameters" }),
		})
		.meta({ title: "PathItem" }),
	"2.0",
	"path-item-object",
);

export type PathItem2 = z.infer<typeof PathItem2Schema>;

export const Paths2Schema: z.ZodTypeAny = withSpec(
	z
		.record(z.string(), z.union([PathItem2Schema, z.any()]))
		.meta({ title: "Paths" }),
	"2.0",
	"paths-object",
);

export type Paths2 = z.infer<typeof Paths2Schema>;

// =============================================================================
// Definitions / Top-level reusable maps
// =============================================================================

export const Definitions2Schema = z
	.record(z.string(), SchemaObject2Schema)
	.meta({ title: "Definitions" });

export const ParametersDefinitions2Schema = z
	.record(z.string(), z.union([Parameter2Schema, Reference2Schema]))
	.meta({ title: "ParametersDefinitions" });

export const ResponsesDefinitions2Schema = z
	.record(z.string(), z.union([Response2Schema, Reference2Schema]))
	.meta({ title: "ResponsesDefinitions" });

// =============================================================================
// Tags
// =============================================================================

export const Tag2Schema = withSpec(
	z
		.object({
			name: z
				.string()
				.describe("REQUIRED. The name of the tag.")
				.meta({ title: "name" }),
			description: z.string().optional().meta({ title: "description" }),
			externalDocs: ExternalDocs2Schema.optional().meta({
				title: "externalDocs",
			}),
		})
		.meta({ title: "Tag" }),
	"2.0",
	"tag-object",
);

export type Tag2 = z.infer<typeof Tag2Schema>;

// =============================================================================
// Root: Swagger Object
// =============================================================================

export const OpenAPI2Schema: z.ZodTypeAny = withSpec(
	z
		.object({
			swagger: z
				.literal("2.0")
				.describe(
					"REQUIRED. Specifies the Swagger Specification version being used. MUST be '2.0'.",
				)
				.meta({ title: "swagger", examples: ["2.0"] }),
			info: Info2Schema.describe(
				"REQUIRED. Provides metadata about the API.",
			).meta({
				title: "info",
			}),
			host: z
				.string()
				.optional()
				.describe(
					"The host (name or ip) serving the API. MAY include a port. Does not include scheme or basePath.",
				)
				.meta({
					title: "host",
					examples: ["api.example.com", "api.example.com:8443"],
				}),
			basePath: z
				.string()
				.optional()
				.describe(
					"The base path on which the API is served, relative to host. MUST start with '/'.",
				)
				.meta({ title: "basePath", examples: ["/v1"] }),
			schemes: z
				.array(z.enum(["http", "https", "ws", "wss"]))
				.optional()
				.describe(
					"The transfer protocol(s) of the API. Values MUST be one of http/https/ws/wss.",
				)
				.meta({ title: "schemes" }),
			consumes: z
				.array(MimeTypeString)
				.optional()
				.describe("A list of MIME types the APIs can consume.")
				.meta({ title: "consumes" }),
			produces: z
				.array(MimeTypeString)
				.optional()
				.describe("A list of MIME types the APIs can produce.")
				.meta({ title: "produces" }),
			paths: Paths2Schema.describe(
				"REQUIRED. The available paths and operations.",
			).meta({ title: "paths" }),
			definitions: Definitions2Schema.optional().meta({ title: "definitions" }),
			parameters: ParametersDefinitions2Schema.optional().meta({
				title: "parameters",
			}),
			responses: ResponsesDefinitions2Schema.optional().meta({
				title: "responses",
			}),
			security: z
				.array(SecurityRequirement2Schema)
				.optional()
				.meta({ title: "security" }),
			tags: z.array(Tag2Schema).optional().meta({ title: "tags" }),
			externalDocs: ExternalDocs2Schema.optional().meta({
				title: "externalDocs",
			}),
		})
		.meta({ title: "Swagger" }),
	"2.0",
	"swagger-object",
);

export type OpenAPI2 = z.infer<typeof OpenAPI2Schema>;
