/**
 * OpenAPI 3.1 Schema Module - Complete Type.Module for OpenAPI 3.1
 *
 * This module contains ALL schemas specific to OpenAPI 3.1.x:
 * - openapi field pattern: "3.1.x"
 * - `webhooks` at root level
 * - `pathItems` in Components
 * - `jsonSchemaDialect` field
 * - No `nullable` keyword (use type arrays instead)
 * - Full JSON Schema Draft 2020-12 support
 * - Standard HTTP methods only (no `query`)
 * - No streaming fields in MediaType
 * - No `defaultMapping` in Discriminator
 * - No `device` flow in OAuthFlows
 * - No `dataValue`/`serializedValue` in Example
 *
 * @module engine/schemas/openapi-3.1-module
 */
import { Type, type Static } from "typebox";

/**
 * Complete OpenAPI 3.1 Schema Module.
 */
export const OpenAPI31Module = Type.Module({
	// ============================================
	// Base/Simple Schemas
	// ============================================

	Contact: Type.Object(
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
	),

	License: Type.Object(
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
	),

	Info: Type.Object(
		{
			title: Type.String({ description: "The title of the API." }),
			version: Type.String({ description: "The version of the OpenAPI document." }),
			summary: Type.Optional(
				Type.String({ description: "A short summary of the API." }),
			),
			description: Type.Optional(
				Type.String({ description: "A description of the API." }),
			),
			termsOfService: Type.Optional(
				Type.String({
					format: "uri",
					description: "A URL to the Terms of Service for the API.",
				}),
			),
			contact: Type.Optional(Type.Ref("Contact")),
			license: Type.Optional(Type.Ref("License")),
		},
		{
			additionalProperties: true,
			description: "The object provides metadata about the API.",
		},
	),

	ServerVariable: Type.Object(
		{
			enum: Type.Optional(
				Type.Array(Type.String(), {
					description:
						"An enumeration of string values to be used if the substitution options are from a limited set.",
				}),
			),
			default: Type.String({
				description:
					"The default value to use for substitution, which SHALL be sent if an alternate value is not supplied.",
			}),
			description: Type.Optional(
				Type.String({
					description: "An optional description for the server variable.",
				}),
			),
		},
		{
			additionalProperties: true,
			description:
				"An object representing a Server Variable for server URL template substitution.",
		},
	),

	// OpenAPI 3.1 Server - no `name` field
	Server: Type.Object(
		{
			url: Type.String({
				description:
					"A URL to the target host. This URL supports Server Variables and MAY be relative.",
			}),
			description: Type.Optional(
				Type.String({
					description:
						"An optional string describing the host designated by the URL.",
				}),
			),
			variables: Type.Optional(
				Type.Record(Type.String(), Type.Ref("ServerVariable"), {
					description:
						"A map between a variable name and its value. The value is used for substitution in the server's URL template.",
				}),
			),
		},
		{
			additionalProperties: true,
			description: "An object representing a Server.",
		},
	),

	ExternalDocumentation: Type.Object(
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
	),

	// OpenAPI 3.1 Tag - no hierarchy fields
	Tag: Type.Object(
		{
			name: Type.String({ description: "The name of the tag." }),
			description: Type.Optional(
				Type.String({ description: "A short description for the tag." }),
			),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
		},
		{
			additionalProperties: true,
			description:
				"Adds metadata to a single tag that is used by the Operation Object.",
		},
	),

	// ============================================
	// Reference Objects
	// ============================================

	InternalRef: Type.Object(
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
	),

	UrlRef: Type.Object(
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
	),

	FileRef: Type.Object(
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
	),

	Reference: Type.Union(
		[Type.Ref("InternalRef"), Type.Ref("UrlRef"), Type.Ref("FileRef")],
		{
			description:
				"A simple object to allow referencing other components in the specification.",
		},
	),

	SecurityRequirement: Type.Record(Type.String(), Type.Array(Type.String()), {
		description: "Lists the required security schemes for this operation.",
	}),

	XML: Type.Object(
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
	),

	// OpenAPI 3.1 Discriminator - no `defaultMapping`
	Discriminator: Type.Object(
		{
			propertyName: Type.String({
				description:
					"The name of the property in the payload that will hold the discriminator value.",
			}),
			mapping: Type.Optional(
				Type.Record(Type.String(), Type.String(), {
					description:
						"An object to hold mappings between payload values and schema names or references.",
				}),
			),
		},
		{
			additionalProperties: true,
			description:
				"When request bodies or response payloads may be one of a number of different schemas, a discriminator object can be used to aid in serialization, deserialization, and validation.",
		},
	),

	OAuthFlow: Type.Object(
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
	),

	// OpenAPI 3.1 OAuthFlows - no `device` flow
	OAuthFlows: Type.Object(
		{
			implicit: Type.Optional(Type.Ref("OAuthFlow")),
			password: Type.Optional(Type.Ref("OAuthFlow")),
			clientCredentials: Type.Optional(Type.Ref("OAuthFlow")),
			authorizationCode: Type.Optional(Type.Ref("OAuthFlow")),
		},
		{
			additionalProperties: true,
			description: "Allows configuration of the supported OAuth Flows.",
		},
	),

	// ============================================
	// Schema Object (OpenAPI 3.1 - no nullable, supports type arrays)
	// ============================================

	StringSchema: Type.Object(
		{
			type: Type.Optional(
				Type.Union([Type.Literal("string"), Type.Array(Type.String())]),
			),
			format: Type.Optional(Type.String()),
			pattern: Type.Optional(Type.String()),
			minLength: Type.Optional(Type.Integer({ minimum: 0 })),
			maxLength: Type.Optional(Type.Integer({ minimum: 0 })),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			not: Type.Optional(Type.Ref("SchemaObject")),
			if: Type.Optional(Type.Ref("SchemaObject")),
			then: Type.Optional(Type.Ref("SchemaObject")),
			else: Type.Optional(Type.Ref("SchemaObject")),
		},
		{ additionalProperties: true, description: "String schema type" },
	),

	NumberSchema: Type.Object(
		{
			type: Type.Optional(
				Type.Union([Type.Literal("number"), Type.Array(Type.String())]),
			),
			format: Type.Optional(Type.String()),
			multipleOf: Type.Optional(Type.Number()),
			minimum: Type.Optional(Type.Number()),
			maximum: Type.Optional(Type.Number()),
			exclusiveMinimum: Type.Optional(Type.Number()),
			exclusiveMaximum: Type.Optional(Type.Number()),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			not: Type.Optional(Type.Ref("SchemaObject")),
			if: Type.Optional(Type.Ref("SchemaObject")),
			then: Type.Optional(Type.Ref("SchemaObject")),
			else: Type.Optional(Type.Ref("SchemaObject")),
		},
		{ additionalProperties: true, description: "Number schema type" },
	),

	IntegerSchema: Type.Object(
		{
			type: Type.Optional(
				Type.Union([Type.Literal("integer"), Type.Array(Type.String())]),
			),
			format: Type.Optional(Type.String()),
			multipleOf: Type.Optional(Type.Number()),
			minimum: Type.Optional(Type.Number()),
			maximum: Type.Optional(Type.Number()),
			exclusiveMinimum: Type.Optional(Type.Number()),
			exclusiveMaximum: Type.Optional(Type.Number()),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			not: Type.Optional(Type.Ref("SchemaObject")),
			if: Type.Optional(Type.Ref("SchemaObject")),
			then: Type.Optional(Type.Ref("SchemaObject")),
			else: Type.Optional(Type.Ref("SchemaObject")),
		},
		{ additionalProperties: true, description: "Integer schema type" },
	),

	BooleanSchema: Type.Object(
		{
			type: Type.Optional(
				Type.Union([Type.Literal("boolean"), Type.Array(Type.String())]),
			),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			not: Type.Optional(Type.Ref("SchemaObject")),
			if: Type.Optional(Type.Ref("SchemaObject")),
			then: Type.Optional(Type.Ref("SchemaObject")),
			else: Type.Optional(Type.Ref("SchemaObject")),
		},
		{ additionalProperties: true, description: "Boolean schema type" },
	),

	NullSchema: Type.Object(
		{
			type: Type.Optional(
				Type.Union([Type.Literal("null"), Type.Array(Type.String())]),
			),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			not: Type.Optional(Type.Ref("SchemaObject")),
			if: Type.Optional(Type.Ref("SchemaObject")),
			then: Type.Optional(Type.Ref("SchemaObject")),
			else: Type.Optional(Type.Ref("SchemaObject")),
		},
		{ additionalProperties: true, description: "Null schema type" },
	),

	ArraySchema: Type.Object(
		{
			type: Type.Optional(
				Type.Union([Type.Literal("array"), Type.Array(Type.String())]),
			),
			items: Type.Optional(Type.Ref("SchemaObject")),
			prefixItems: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			contains: Type.Optional(Type.Ref("SchemaObject")),
			minItems: Type.Optional(Type.Integer({ minimum: 0 })),
			maxItems: Type.Optional(Type.Integer({ minimum: 0 })),
			minContains: Type.Optional(Type.Integer({ minimum: 0 })),
			maxContains: Type.Optional(Type.Integer({ minimum: 0 })),
			uniqueItems: Type.Optional(Type.Boolean()),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			not: Type.Optional(Type.Ref("SchemaObject")),
			if: Type.Optional(Type.Ref("SchemaObject")),
			then: Type.Optional(Type.Ref("SchemaObject")),
			else: Type.Optional(Type.Ref("SchemaObject")),
		},
		{ additionalProperties: true, description: "Array schema type" },
	),

	ObjectSchema: Type.Object(
		{
			type: Type.Optional(
				Type.Union([Type.Literal("object"), Type.Array(Type.String())]),
			),
			properties: Type.Optional(Type.Record(Type.String(), Type.Ref("SchemaObject"))),
			additionalProperties: Type.Optional(
				Type.Union([Type.Ref("SchemaObject"), Type.Boolean()]),
			),
			patternProperties: Type.Optional(
				Type.Record(Type.String(), Type.Ref("SchemaObject")),
			),
			propertyNames: Type.Optional(Type.Ref("SchemaObject")),
			dependentSchemas: Type.Optional(
				Type.Record(Type.String(), Type.Ref("SchemaObject")),
			),
			dependentRequired: Type.Optional(
				Type.Record(Type.String(), Type.Array(Type.String())),
			),
			required: Type.Optional(Type.Array(Type.String())),
			minProperties: Type.Optional(Type.Integer({ minimum: 0 })),
			maxProperties: Type.Optional(Type.Integer({ minimum: 0 })),
			unevaluatedProperties: Type.Optional(
				Type.Union([Type.Ref("SchemaObject"), Type.Boolean()]),
			),
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
			not: Type.Optional(Type.Ref("SchemaObject")),
			if: Type.Optional(Type.Ref("SchemaObject")),
			then: Type.Optional(Type.Ref("SchemaObject")),
			else: Type.Optional(Type.Ref("SchemaObject")),
		},
		{ additionalProperties: true, description: "Object schema type" },
	),

	SchemaObject: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Ref("StringSchema"),
			Type.Ref("NumberSchema"),
			Type.Ref("IntegerSchema"),
			Type.Ref("BooleanSchema"),
			Type.Ref("ArraySchema"),
			Type.Ref("ObjectSchema"),
			Type.Ref("NullSchema"),
		],
		{
			description:
				"The Schema Object allows the definition of input and output data types.",
		},
	),

	// ============================================
	// Example Object (OpenAPI 3.1 - no dataValue/serializedValue)
	// ============================================

	Example: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Object(
				{
					summary: Type.Optional(
						Type.String({ description: "Short description for the example." }),
					),
					description: Type.Optional(
						Type.String({ description: "Long description for the example." }),
					),
					value: Type.Optional(
						Type.Unknown({ description: "Embedded literal example." }),
					),
					externalValue: Type.Optional(
						Type.String({
							format: "uri",
							description: "A URL that points to the literal example.",
						}),
					),
				},
				{
					additionalProperties: true,
					description: "Example Object",
				},
			),
		],
		{
			description: "Example Object",
		},
	),

	Link: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Object(
				{
					operationId: Type.Optional(
						Type.String({
							description:
								"The name of an existing, resolvable OAS operation, as defined with a unique operationId.",
						}),
					),
					operationRef: Type.Optional(
						Type.String({
							description:
								"A relative or absolute URI reference to an OAS operation.",
						}),
					),
					parameters: Type.Optional(
						Type.Record(Type.String(), Type.Unknown(), {
							description:
								"A map representing parameters to pass to an operation as specified with operationId or identified via operationRef.",
						}),
					),
					requestBody: Type.Optional(
						Type.Unknown({
							description:
								"A literal value or {expression} to use as a request body when calling the target operation.",
						}),
					),
					description: Type.Optional(
						Type.String({ description: "A description of the link." }),
					),
					server: Type.Optional(Type.Ref("Server")),
				},
				{
					additionalProperties: true,
					description:
						"The Link object represents a possible design-time link for a response.",
				},
			),
		],
		{
			description:
				"The Link object represents a possible design-time link for a response.",
		},
	),

	// ============================================
	// Security Scheme Object
	// ============================================

	SecurityScheme: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Union([
				Type.Object(
					{
						type: Type.Literal("apiKey"),
						name: Type.String({
							description:
								"The name of the header, query or cookie parameter to be used.",
						}),
						in: Type.Union(
							[Type.Literal("query"), Type.Literal("header"), Type.Literal("cookie")],
							{ description: "The location of the API key." },
						),
						description: Type.Optional(Type.String()),
					},
					{
						additionalProperties: true,
						description: "API Key security scheme",
					},
				),
				Type.Object(
					{
						type: Type.Literal("http"),
						scheme: Type.String({
							description: "The name of the HTTP Authorization scheme.",
						}),
						bearerFormat: Type.Optional(
							Type.String({
								description:
									"A hint to the client to identify how the bearer token is formatted.",
							}),
						),
						description: Type.Optional(Type.String()),
					},
					{
						additionalProperties: true,
						description: "HTTP security scheme",
					},
				),
				Type.Object(
					{
						type: Type.Literal("mutualTLS"),
						description: Type.Optional(Type.String()),
					},
					{
						additionalProperties: true,
						description: "Mutual TLS security scheme",
					},
				),
				Type.Object(
					{
						type: Type.Literal("oauth2"),
						flows: Type.Ref("OAuthFlows"),
						description: Type.Optional(Type.String()),
					},
					{
						additionalProperties: true,
						description: "OAuth2 security scheme",
					},
				),
				Type.Object(
					{
						type: Type.Literal("openIdConnect"),
						openIdConnectUrl: Type.String({
							format: "uri",
							description:
								"OpenID Connect URL to discover OAuth2 configuration values.",
						}),
						description: Type.Optional(Type.String()),
					},
					{
						additionalProperties: true,
						description: "OpenID Connect security scheme",
					},
				),
			]),
		],
		{
			description: "Defines a security scheme that can be used by the operations.",
		},
	),

	// ============================================
	// Header Object
	// ============================================

	Header: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Object(
				{
					description: Type.Optional(
						Type.String({ description: "A brief description of the parameter." }),
					),
					required: Type.Optional(
						Type.Boolean({
							default: false,
							description: "Determines whether this parameter is mandatory.",
						}),
					),
					deprecated: Type.Optional(
						Type.Boolean({
							default: false,
							description: "Specifies that a parameter is deprecated.",
						}),
					),
					allowEmptyValue: Type.Optional(
						Type.Boolean({
							default: false,
							description: "Sets the ability to pass empty-valued parameters.",
						}),
					),
					style: Type.Optional(
						Type.Literal("simple", {
							description: "Describes how the parameter value will be serialized.",
						}),
					),
					explode: Type.Optional(Type.Boolean()),
					allowReserved: Type.Optional(Type.Boolean({ default: false })),
					schema: Type.Optional(Type.Ref("SchemaObject")),
					example: Type.Optional(Type.Unknown()),
					examples: Type.Optional(Type.Record(Type.String(), Type.Ref("Example"))),
					content: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
				},
				{
					additionalProperties: true,
					description:
						"The Header Object follows the structure of the Parameter Object.",
				},
			),
		],
		{
			description:
				"The Header Object follows the structure of the Parameter Object.",
		},
	),

	Encoding: Type.Object(
		{
			contentType: Type.Optional(
				Type.String({
					description: "The Content-Type for encoding a specific property.",
				}),
			),
			headers: Type.Optional(Type.Record(Type.String(), Type.Ref("Header"))),
			style: Type.Optional(
				Type.Union([
					Type.Literal("form"),
					Type.Literal("spaceDelimited"),
					Type.Literal("pipeDelimited"),
					Type.Literal("deepObject"),
				]),
			),
			explode: Type.Optional(Type.Boolean()),
			allowReserved: Type.Optional(Type.Boolean({ default: false })),
		},
		{
			additionalProperties: true,
			description:
				"A single encoding definition applied to a single schema property.",
		},
	),

	// OpenAPI 3.1 MediaType - no streaming fields
	MediaType: Type.Object(
		{
			schema: Type.Optional(Type.Ref("SchemaObject")),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Record(Type.String(), Type.Ref("Example"))),
			encoding: Type.Optional(Type.Record(Type.String(), Type.Ref("Encoding"))),
		},
		{
			additionalProperties: true,
			description:
				"Each Media Type Object provides schema and examples for the media type identified by its key.",
		},
	),

	Parameter: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Object(
				{
					name: Type.String({ description: "The name of the parameter." }),
					in: Type.Union([
						Type.Literal("query"),
						Type.Literal("header"),
						Type.Literal("path"),
						Type.Literal("cookie"),
					]),
					description: Type.Optional(Type.String()),
					required: Type.Optional(Type.Boolean({ default: false })),
					deprecated: Type.Optional(Type.Boolean({ default: false })),
					allowEmptyValue: Type.Optional(Type.Boolean({ default: false })),
					style: Type.Optional(
						Type.Union([
							Type.Literal("matrix"),
							Type.Literal("label"),
							Type.Literal("form"),
							Type.Literal("simple"),
							Type.Literal("spaceDelimited"),
							Type.Literal("pipeDelimited"),
							Type.Literal("deepObject"),
						]),
					),
					explode: Type.Optional(Type.Boolean()),
					allowReserved: Type.Optional(Type.Boolean({ default: false })),
					schema: Type.Optional(Type.Ref("SchemaObject")),
					example: Type.Optional(Type.Unknown()),
					examples: Type.Optional(Type.Record(Type.String(), Type.Ref("Example"))),
					content: Type.Optional(Type.Record(Type.String(), Type.Ref("MediaType"))),
				},
				{
					additionalProperties: true,
					description: "Describes a single operation parameter.",
				},
			),
		],
		{
			description: "Describes a single operation parameter.",
		},
	),

	RequestBody: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Object(
				{
					description: Type.Optional(Type.String()),
					content: Type.Record(Type.String(), Type.Ref("MediaType")),
					required: Type.Optional(Type.Boolean({ default: false })),
				},
				{
					additionalProperties: true,
					description: "Describes a single request body.",
				},
			),
		],
		{
			description: "Describes a single request body.",
		},
	),

	Response: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Object(
				{
					description: Type.String({
						description: "A description of the response.",
					}),
					headers: Type.Optional(Type.Record(Type.String(), Type.Ref("Header"))),
					content: Type.Optional(Type.Record(Type.String(), Type.Ref("MediaType"))),
					links: Type.Optional(Type.Record(Type.String(), Type.Ref("Link"))),
				},
				{
					additionalProperties: true,
					description: "Describes a single response from an API Operation.",
				},
			),
		],
		{
			description: "Describes a single response from an API Operation.",
		},
	),

	Responses: Type.Record(
		Type.Union([Type.String({ pattern: "^[1-5][0-9]{2}$" }), Type.Literal("default")]),
		Type.Ref("Response"),
		{
			description: "A container for the expected responses of an operation.",
		},
	),

	Callback: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Record(Type.String(), Type.Ref("PathItem"), {
				description:
					"A map of possible out-of-band callbacks related to the parent operation.",
			}),
		],
		{
			description:
				"A map of possible out-of-band callbacks related to the parent operation.",
		},
	),

	Operation: Type.Object(
		{
			tags: Type.Optional(Type.Array(Type.String())),
			summary: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			operationId: Type.Optional(Type.String()),
			parameters: Type.Optional(Type.Array(Type.Ref("Parameter"))),
			requestBody: Type.Optional(Type.Ref("RequestBody")),
			responses: Type.Optional(Type.Ref("Responses")),
			callbacks: Type.Optional(Type.Record(Type.String(), Type.Ref("Callback"))),
			deprecated: Type.Optional(Type.Boolean({ default: false })),
			security: Type.Optional(Type.Array(Type.Ref("SecurityRequirement"))),
			servers: Type.Optional(Type.Array(Type.Ref("Server"))),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
		},
		{
			additionalProperties: true,
			description: "Describes a single API operation on a path.",
		},
	),

	// OpenAPI 3.1 PathItem - standard HTTP methods only
	PathItem: Type.Object(
		{
			$ref: Type.Optional(Type.String()),
			summary: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			get: Type.Optional(Type.Ref("Operation")),
			put: Type.Optional(Type.Ref("Operation")),
			post: Type.Optional(Type.Ref("Operation")),
			delete: Type.Optional(Type.Ref("Operation")),
			options: Type.Optional(Type.Ref("Operation")),
			head: Type.Optional(Type.Ref("Operation")),
			patch: Type.Optional(Type.Ref("Operation")),
			trace: Type.Optional(Type.Ref("Operation")),
			servers: Type.Optional(Type.Array(Type.Ref("Server"))),
			parameters: Type.Optional(Type.Array(Type.Ref("Parameter"))),
		},
		{
			additionalProperties: true,
			description: "Describes the operations available on a single path.",
		},
	),

	Paths: Type.Record(Type.String({ pattern: "^/" }), Type.Ref("PathItem"), {
		description: "Holds the relative paths to the individual endpoints.",
	}),

	// OpenAPI 3.1 Components - includes pathItems
	Components: Type.Object(
		{
			schemas: Type.Optional(Type.Record(Type.String(), Type.Ref("SchemaObject"))),
			responses: Type.Optional(Type.Record(Type.String(), Type.Ref("Response"))),
			parameters: Type.Optional(Type.Record(Type.String(), Type.Ref("Parameter"))),
			examples: Type.Optional(Type.Record(Type.String(), Type.Ref("Example"))),
			requestBodies: Type.Optional(Type.Record(Type.String(), Type.Ref("RequestBody"))),
			headers: Type.Optional(Type.Record(Type.String(), Type.Ref("Header"))),
			securitySchemes: Type.Optional(
				Type.Record(Type.String(), Type.Ref("SecurityScheme")),
			),
			links: Type.Optional(Type.Record(Type.String(), Type.Ref("Link"))),
			callbacks: Type.Optional(Type.Record(Type.String(), Type.Ref("Callback"))),
			pathItems: Type.Optional(Type.Record(Type.String(), Type.Ref("PathItem"))),
		},
		{
			additionalProperties: true,
			description:
				"Holds a set of reusable objects for different aspects of the OAS.",
		},
	),

	// OpenAPI 3.1 Root - includes webhooks and jsonSchemaDialect
	OpenAPI: Type.Object(
		{
			openapi: Type.String({
				pattern: "^3\\.1\\.\\d+$",
				description:
					"This string MUST be the semantic version number of the OpenAPI Specification version that the OpenAPI document uses.",
			}),
			info: Type.Ref("Info"),
			jsonSchemaDialect: Type.Optional(
				Type.String({
					format: "uri",
					description: "The default value for the $schema keyword within Schema Objects.",
				}),
			),
			servers: Type.Optional(Type.Array(Type.Ref("Server"))),
			paths: Type.Optional(Type.Ref("Paths")),
			webhooks: Type.Optional(Type.Record(Type.String(), Type.Ref("PathItem"))),
			components: Type.Optional(Type.Ref("Components")),
			security: Type.Optional(Type.Array(Type.Ref("SecurityRequirement"))),
			tags: Type.Optional(Type.Array(Type.Ref("Tag"))),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
		},
		{
			additionalProperties: true,
			description: "The root object of the OpenAPI 3.1 document.",
		},
	),
});

// ============================================
// Export individual schemas from the module
// ============================================

export const Contact31Schema = OpenAPI31Module.Contact;
export const License31Schema = OpenAPI31Module.License;
export const Info31Schema = OpenAPI31Module.Info;
export const ServerVariable31Schema = OpenAPI31Module.ServerVariable;
export const Server31Schema = OpenAPI31Module.Server;
export const ExternalDocumentation31Schema = OpenAPI31Module.ExternalDocumentation;
export const Tag31Schema = OpenAPI31Module.Tag;
export const InternalRef31Schema = OpenAPI31Module.InternalRef;
export const UrlRef31Schema = OpenAPI31Module.UrlRef;
export const FileRef31Schema = OpenAPI31Module.FileRef;
export const Reference31Schema = OpenAPI31Module.Reference;
export const SecurityRequirement31Schema = OpenAPI31Module.SecurityRequirement;
export const XML31Schema = OpenAPI31Module.XML;
export const Discriminator31Schema = OpenAPI31Module.Discriminator;
export const OAuthFlow31Schema = OpenAPI31Module.OAuthFlow;
export const OAuthFlows31Schema = OpenAPI31Module.OAuthFlows;
export const StringSchema31 = OpenAPI31Module.StringSchema;
export const NumberSchema31 = OpenAPI31Module.NumberSchema;
export const IntegerSchema31 = OpenAPI31Module.IntegerSchema;
export const BooleanSchema31 = OpenAPI31Module.BooleanSchema;
export const NullSchema31 = OpenAPI31Module.NullSchema;
export const ArraySchema31 = OpenAPI31Module.ArraySchema;
export const ObjectSchema31 = OpenAPI31Module.ObjectSchema;
export const SchemaObject31Schema = OpenAPI31Module.SchemaObject;
export const Example31Schema = OpenAPI31Module.Example;
export const Link31Schema = OpenAPI31Module.Link;
export const SecurityScheme31Schema = OpenAPI31Module.SecurityScheme;
export const Header31Schema = OpenAPI31Module.Header;
export const Encoding31Schema = OpenAPI31Module.Encoding;
export const MediaType31Schema = OpenAPI31Module.MediaType;
export const Parameter31Schema = OpenAPI31Module.Parameter;
export const RequestBody31Schema = OpenAPI31Module.RequestBody;
export const Response31Schema = OpenAPI31Module.Response;
export const Responses31Schema = OpenAPI31Module.Responses;
export const Callback31Schema = OpenAPI31Module.Callback;
export const Operation31Schema = OpenAPI31Module.Operation;
export const PathItem31Schema = OpenAPI31Module.PathItem;
export const Paths31Schema = OpenAPI31Module.Paths;
export const Components31Schema = OpenAPI31Module.Components;
export const OpenAPI31Schema = OpenAPI31Module.OpenAPI;

// ============================================
// Export TypeScript types
// ============================================

export type Contact31 = Static<typeof Contact31Schema>;
export type License31 = Static<typeof License31Schema>;
export type Info31 = Static<typeof Info31Schema>;
export type ServerVariable31 = Static<typeof ServerVariable31Schema>;
export type Server31 = Static<typeof Server31Schema>;
export type ExternalDocumentation31 = Static<typeof ExternalDocumentation31Schema>;
export type Tag31 = Static<typeof Tag31Schema>;
export type Reference31 = Static<typeof Reference31Schema>;
export type SecurityRequirement31 = Static<typeof SecurityRequirement31Schema>;
export type XML31 = Static<typeof XML31Schema>;
export type Discriminator31 = Static<typeof Discriminator31Schema>;
export type OAuthFlow31 = Static<typeof OAuthFlow31Schema>;
export type OAuthFlows31 = Static<typeof OAuthFlows31Schema>;
export type SchemaObject31 = Static<typeof SchemaObject31Schema>;
export type Example31 = Static<typeof Example31Schema>;
export type Link31 = Static<typeof Link31Schema>;
export type SecurityScheme31 = Static<typeof SecurityScheme31Schema>;
export type Header31 = Static<typeof Header31Schema>;
export type Encoding31 = Static<typeof Encoding31Schema>;
export type MediaType31 = Static<typeof MediaType31Schema>;
export type Parameter31 = Static<typeof Parameter31Schema>;
export type RequestBody31 = Static<typeof RequestBody31Schema>;
export type Response31 = Static<typeof Response31Schema>;
export type Responses31 = Static<typeof Responses31Schema>;
export type Callback31 = Static<typeof Callback31Schema>;
export type Operation31 = Static<typeof Operation31Schema>;
export type PathItem31 = Static<typeof PathItem31Schema>;
export type Paths31 = Static<typeof Paths31Schema>;
export type Components31 = Static<typeof Components31Schema>;
export type OpenAPI31 = Static<typeof OpenAPI31Schema>;

