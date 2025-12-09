/**
 * OpenAPI 3.2 Schema Module - Complete Type.Module for OpenAPI 3.2
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
import { Type, type Static } from "typebox";

/**
 * Complete OpenAPI 3.2 Schema Module.
 */
export const OpenAPI32Module = Type.Module({
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

	// OpenAPI 3.2 Server - includes `name` field
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
			name: Type.Optional(
				Type.String({
					description:
						"A unique name to identify the server. Used for display in documentation and tooling.",
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

	// OpenAPI 3.2 Tag - includes hierarchy fields (parent, kind, summary)
	Tag: Type.Object(
		{
			name: Type.String({ description: "The name of the tag." }),
			description: Type.Optional(
				Type.String({ description: "A description for the tag." }),
			),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			summary: Type.Optional(
				Type.String({
					description:
						"A short summary of the tag. CommonMark syntax MAY be used for rich text representation.",
				}),
			),
			parent: Type.Optional(
				Type.String({
					description:
						"The name of the parent tag, enabling hierarchical tag organization.",
				}),
			),
			kind: Type.Optional(
				Type.Union(
					[
						Type.Literal("nav"),
						Type.Literal("badge"),
						Type.Literal("audience"),
					],
					{
						description:
							"Classification of the tag type for tooling purposes.",
					},
				),
			),
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

	// OpenAPI 3.2 Discriminator - includes `defaultMapping`
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
			defaultMapping: Type.Optional(
				Type.String({
					description:
						"The default schema reference to use when the discriminator value does not match any mapping.",
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

	// OpenAPI 3.2 OAuthFlows - includes `device` flow
	OAuthFlows: Type.Object(
		{
			implicit: Type.Optional(Type.Ref("OAuthFlow")),
			password: Type.Optional(Type.Ref("OAuthFlow")),
			clientCredentials: Type.Optional(Type.Ref("OAuthFlow")),
			authorizationCode: Type.Optional(Type.Ref("OAuthFlow")),
			device: Type.Optional(
				Type.Ref("OAuthFlow", {
					description:
						"Configuration for the OAuth 2.0 Device Authorization Grant flow.",
				}),
			),
		},
		{
			additionalProperties: true,
			description: "Allows configuration of the supported OAuth Flows.",
		},
	),

	// ============================================
	// Schema Object (OpenAPI 3.2 - no nullable, supports type arrays)
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
			unevaluatedItems: Type.Optional(
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
	// Example Object (OpenAPI 3.2 - includes dataValue/serializedValue)
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
					dataValue: Type.Optional(
						Type.Unknown({
							description:
								"The deserialized/parsed value of the example. Mutually exclusive with serializedValue.",
						}),
					),
					serializedValue: Type.Optional(
						Type.String({
							description:
								"A serialized string representation of the example value. Mutually exclusive with dataValue.",
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

	// OpenAPI 3.2 MediaType - includes streaming fields (itemSchema, itemEncoding)
	MediaType: Type.Object(
		{
			schema: Type.Optional(Type.Ref("SchemaObject")),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Record(Type.String(), Type.Ref("Example"))),
			encoding: Type.Optional(Type.Record(Type.String(), Type.Ref("Encoding"))),
			itemSchema: Type.Optional(
				Type.Ref("SchemaObject", {
					description:
						"Schema for individual items in streaming responses (SSE, JSON Lines, etc.).",
				}),
			),
			itemEncoding: Type.Optional(
				Type.Ref("Encoding", {
					description: "Encoding information for streamed items.",
				}),
			),
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

	// OpenAPI 3.2 PathItem - includes query method and additionalOperations
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
			query: Type.Optional(
				Type.Ref("Operation", {
					description:
						"QUERY HTTP method for idempotent requests with request bodies.",
				}),
			),
			servers: Type.Optional(Type.Array(Type.Ref("Server"))),
			parameters: Type.Optional(Type.Array(Type.Ref("Parameter"))),
			additionalOperations: Type.Optional(
				Type.Record(Type.String(), Type.Ref("Operation"), {
					description: "Additional custom HTTP methods beyond the standard set.",
				}),
			),
		},
		{
			additionalProperties: true,
			description: "Describes the operations available on a single path.",
		},
	),

	Paths: Type.Record(Type.String({ pattern: "^/" }), Type.Ref("PathItem"), {
		description: "Holds the relative paths to the individual endpoints.",
	}),

	// OpenAPI 3.2 Components - includes pathItems
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

	// OpenAPI 3.2 Root - includes webhooks and jsonSchemaDialect
	OpenAPI: Type.Object(
		{
			openapi: Type.String({
				pattern: "^3\\.2\\.\\d+$",
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
			description: "The root object of the OpenAPI 3.2 document.",
		},
	),
});

// ============================================
// Export individual schemas from the module
// ============================================

export const Contact32Schema = OpenAPI32Module.Contact;
export const License32Schema = OpenAPI32Module.License;
export const Info32Schema = OpenAPI32Module.Info;
export const ServerVariable32Schema = OpenAPI32Module.ServerVariable;
export const Server32Schema = OpenAPI32Module.Server;
export const ExternalDocumentation32Schema = OpenAPI32Module.ExternalDocumentation;
export const Tag32Schema = OpenAPI32Module.Tag;
export const InternalRef32Schema = OpenAPI32Module.InternalRef;
export const UrlRef32Schema = OpenAPI32Module.UrlRef;
export const FileRef32Schema = OpenAPI32Module.FileRef;
export const Reference32Schema = OpenAPI32Module.Reference;
export const SecurityRequirement32Schema = OpenAPI32Module.SecurityRequirement;
export const XML32Schema = OpenAPI32Module.XML;
export const Discriminator32Schema = OpenAPI32Module.Discriminator;
export const OAuthFlow32Schema = OpenAPI32Module.OAuthFlow;
export const OAuthFlows32Schema = OpenAPI32Module.OAuthFlows;
export const StringSchema32 = OpenAPI32Module.StringSchema;
export const NumberSchema32 = OpenAPI32Module.NumberSchema;
export const IntegerSchema32 = OpenAPI32Module.IntegerSchema;
export const BooleanSchema32 = OpenAPI32Module.BooleanSchema;
export const NullSchema32 = OpenAPI32Module.NullSchema;
export const ArraySchema32 = OpenAPI32Module.ArraySchema;
export const ObjectSchema32 = OpenAPI32Module.ObjectSchema;
export const SchemaObject32Schema = OpenAPI32Module.SchemaObject;
export const Example32Schema = OpenAPI32Module.Example;
export const Link32Schema = OpenAPI32Module.Link;
export const SecurityScheme32Schema = OpenAPI32Module.SecurityScheme;
export const Header32Schema = OpenAPI32Module.Header;
export const Encoding32Schema = OpenAPI32Module.Encoding;
export const MediaType32Schema = OpenAPI32Module.MediaType;
export const Parameter32Schema = OpenAPI32Module.Parameter;
export const RequestBody32Schema = OpenAPI32Module.RequestBody;
export const Response32Schema = OpenAPI32Module.Response;
export const Responses32Schema = OpenAPI32Module.Responses;
export const Callback32Schema = OpenAPI32Module.Callback;
export const Operation32Schema = OpenAPI32Module.Operation;
export const PathItem32Schema = OpenAPI32Module.PathItem;
export const Paths32Schema = OpenAPI32Module.Paths;
export const Components32Schema = OpenAPI32Module.Components;
export const OpenAPI32Schema = OpenAPI32Module.OpenAPI;

// ============================================
// Export TypeScript types
// ============================================

export type Contact32 = Static<typeof Contact32Schema>;
export type License32 = Static<typeof License32Schema>;
export type Info32 = Static<typeof Info32Schema>;
export type ServerVariable32 = Static<typeof ServerVariable32Schema>;
export type Server32 = Static<typeof Server32Schema>;
export type ExternalDocumentation32 = Static<typeof ExternalDocumentation32Schema>;
export type Tag32 = Static<typeof Tag32Schema>;
export type Reference32 = Static<typeof Reference32Schema>;
export type SecurityRequirement32 = Static<typeof SecurityRequirement32Schema>;
export type XML32 = Static<typeof XML32Schema>;
export type Discriminator32 = Static<typeof Discriminator32Schema>;
export type OAuthFlow32 = Static<typeof OAuthFlow32Schema>;
export type OAuthFlows32 = Static<typeof OAuthFlows32Schema>;
export type SchemaObject32 = Static<typeof SchemaObject32Schema>;
export type Example32 = Static<typeof Example32Schema>;
export type Link32 = Static<typeof Link32Schema>;
export type SecurityScheme32 = Static<typeof SecurityScheme32Schema>;
export type Header32 = Static<typeof Header32Schema>;
export type Encoding32 = Static<typeof Encoding32Schema>;
export type MediaType32 = Static<typeof MediaType32Schema>;
export type Parameter32 = Static<typeof Parameter32Schema>;
export type RequestBody32 = Static<typeof RequestBody32Schema>;
export type Response32 = Static<typeof Response32Schema>;
export type Responses32 = Static<typeof Responses32Schema>;
export type Callback32 = Static<typeof Callback32Schema>;
export type Operation32 = Static<typeof Operation32Schema>;
export type PathItem32 = Static<typeof PathItem32Schema>;
export type Paths32 = Static<typeof Paths32Schema>;
export type Components32 = Static<typeof Components32Schema>;
export type OpenAPI32 = Static<typeof OpenAPI32Schema>;

