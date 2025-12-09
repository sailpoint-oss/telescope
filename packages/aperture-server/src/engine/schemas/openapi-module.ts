/**
 * OpenAPI Schema Module - ALL OpenAPI schemas in a single Type.Module()
 *
 * This consolidated module ensures TypeBox generates proper $defs and uses $ref
 * for cross-references instead of inlining entire schemas. This keeps the
 * generated JSON Schema small (~30KB vs 2.3MB when schemas import each other).
 *
 * Based on OpenAPI 3.0, 3.1, and 3.2 specifications.
 */
import { Type, type Static } from "typebox";

/**
 * The complete OpenAPI schema module with all definitions.
 * All schemas reference each other via Type.Ref() for proper $defs generation.
 */
export const OpenAPIModule = Type.Module({
	// ============================================
	// Base/Simple Schemas (no dependencies)
	// ============================================

	/**
	 * Contact Object - Contact information for the exposed API.
	 */
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

	/**
	 * License Object - License information for the exposed API.
	 */
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

	/**
	 * Info Object - Metadata about the API.
	 */
	Info: Type.Object(
		{
			title: Type.String({ description: "The title of the API." }),
			version: Type.String({ description: "The version of the OpenAPI document." }),
			description: Type.Optional(
				Type.String({ description: "A short description of the API." }),
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

	/**
	 * Server Variable Object
	 */
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

	/**
	 * Server Object
	 */
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
			// OpenAPI 3.2+ field
			name: Type.Optional(
				Type.String({
					description:
						"A unique name to identify the server. Used for display in documentation and tooling. (OpenAPI 3.2+)",
				}),
			),
		},
		{
			additionalProperties: true,
			description: "An object representing a Server.",
		},
	),

	/**
	 * External Documentation Object
	 */
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

	/**
	 * Tag Object
	 */
	Tag: Type.Object(
		{
			name: Type.String({ description: "The name of the tag." }),
			description: Type.Optional(
				Type.String({ description: "A short description for the tag." }),
			),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			// OpenAPI 3.2+ fields
			summary: Type.Optional(
				Type.String({
					description:
						"A short summary of the tag. CommonMark syntax MAY be used for rich text representation. (OpenAPI 3.2+)",
				}),
			),
			parent: Type.Optional(
				Type.String({
					description:
						"The name of the parent tag, enabling hierarchical tag organization. (OpenAPI 3.2+)",
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
							'Classification of the tag type for tooling purposes. (OpenAPI 3.2+)',
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

	/**
	 * Reference Object - Internal JSON Pointer reference
	 */
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

	/**
	 * Reference Object - URL reference
	 */
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

	/**
	 * Reference Object - File reference
	 */
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

	/**
	 * Reference Object - Union of all reference types
	 */
	Reference: Type.Union([Type.Ref("InternalRef"), Type.Ref("UrlRef"), Type.Ref("FileRef")], {
		description:
			"A simple object to allow referencing other components in the specification.",
	}),

	/**
	 * Security Requirement Object
	 */
	SecurityRequirement: Type.Record(Type.String(), Type.Array(Type.String()), {
		description: "Lists the required security schemes for this operation.",
	}),

	/**
	 * XML Object
	 */
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

	/**
	 * Discriminator Object
	 */
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
			// OpenAPI 3.2+ field
			defaultMapping: Type.Optional(
				Type.String({
					description:
						"The default schema reference to use when the discriminator value does not match any mapping. (OpenAPI 3.2+)",
				}),
			),
		},
		{
			additionalProperties: true,
			description:
				"When request bodies or response payloads may be one of a number of different schemas, a discriminator object can be used to aid in serialization, deserialization, and validation.",
		},
	),

	/**
	 * OAuth Flow Object
	 */
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

	/**
	 * OAuth Flows Object
	 */
	OAuthFlows: Type.Object(
		{
			implicit: Type.Optional(Type.Ref("OAuthFlow")),
			password: Type.Optional(Type.Ref("OAuthFlow")),
			clientCredentials: Type.Optional(Type.Ref("OAuthFlow")),
			authorizationCode: Type.Optional(Type.Ref("OAuthFlow")),
			// OpenAPI 3.2+ Device Authorization Grant
			device: Type.Optional(
				Type.Ref("OAuthFlow", {
					description:
						"Configuration for the OAuth 2.0 Device Authorization Grant flow. (OpenAPI 3.2+)",
				}),
			),
		},
		{
			additionalProperties: true,
			description: "Allows configuration of the supported OAuth Flows.",
		},
	),

	// ============================================
	// Schema Object (recursive - needs special handling)
	// ============================================

	/**
	 * String Schema
	 */
	StringSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("string")),
			format: Type.Optional(Type.String()),
			pattern: Type.Optional(Type.String()),
			minLength: Type.Optional(Type.Integer({ minimum: 0 })),
			maxLength: Type.Optional(Type.Integer({ minimum: 0 })),
			// Base schema properties
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			nullable: Type.Optional(Type.Boolean()),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			// Composition keywords (recursive)
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

	/**
	 * Number Schema
	 */
	NumberSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("number")),
			format: Type.Optional(Type.String()),
			multipleOf: Type.Optional(Type.Number()),
			minimum: Type.Optional(Type.Number()),
			maximum: Type.Optional(Type.Number()),
			exclusiveMinimum: Type.Optional(Type.Union([Type.Number(), Type.Boolean()])),
			exclusiveMaximum: Type.Optional(Type.Union([Type.Number(), Type.Boolean()])),
			// Base schema properties
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			nullable: Type.Optional(Type.Boolean()),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			// Composition keywords
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

	/**
	 * Integer Schema
	 */
	IntegerSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("integer")),
			format: Type.Optional(Type.String()),
			multipleOf: Type.Optional(Type.Number()),
			minimum: Type.Optional(Type.Number()),
			maximum: Type.Optional(Type.Number()),
			exclusiveMinimum: Type.Optional(Type.Union([Type.Number(), Type.Boolean()])),
			exclusiveMaximum: Type.Optional(Type.Union([Type.Number(), Type.Boolean()])),
			// Base schema properties
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			nullable: Type.Optional(Type.Boolean()),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			// Composition keywords
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

	/**
	 * Boolean Schema
	 */
	BooleanSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("boolean")),
			// Base schema properties
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			nullable: Type.Optional(Type.Boolean()),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			// Composition keywords
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

	/**
	 * Null Schema
	 */
	NullSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("null")),
			// Base schema properties
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			nullable: Type.Optional(Type.Boolean()),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			// Composition keywords
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

	/**
	 * Array Schema
	 */
	ArraySchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("array")),
			items: Type.Optional(
				Type.Union([Type.Ref("SchemaObject"), Type.Array(Type.Ref("SchemaObject"))]),
			),
			additionalItems: Type.Optional(
				Type.Union([Type.Ref("SchemaObject"), Type.Boolean()]),
			),
			minItems: Type.Optional(Type.Integer({ minimum: 0 })),
			maxItems: Type.Optional(Type.Integer({ minimum: 0 })),
			uniqueItems: Type.Optional(Type.Boolean()),
			contains: Type.Optional(Type.Ref("SchemaObject")),
			// Base schema properties
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			nullable: Type.Optional(Type.Boolean()),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			// Composition keywords
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

	/**
	 * Object Schema
	 */
	ObjectSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("object")),
			properties: Type.Optional(Type.Record(Type.String(), Type.Ref("SchemaObject"))),
			additionalProperties: Type.Optional(
				Type.Union([Type.Ref("SchemaObject"), Type.Boolean()]),
			),
			patternProperties: Type.Optional(
				Type.Record(Type.String(), Type.Ref("SchemaObject")),
			),
			dependentSchemas: Type.Optional(
				Type.Record(Type.String(), Type.Ref("SchemaObject")),
			),
			required: Type.Optional(Type.Array(Type.String())),
			minProperties: Type.Optional(Type.Integer({ minimum: 0 })),
			maxProperties: Type.Optional(Type.Integer({ minimum: 0 })),
			propertyNames: Type.Optional(Type.Ref("SchemaObject")),
			// Base schema properties
			title: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			default: Type.Optional(Type.Unknown()),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Array(Type.Unknown())),
			enum: Type.Optional(Type.Array(Type.Unknown())),
			const: Type.Optional(Type.Unknown()),
			discriminator: Type.Optional(Type.Ref("Discriminator")),
			xml: Type.Optional(Type.Ref("XML")),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			nullable: Type.Optional(Type.Boolean()),
			readOnly: Type.Optional(Type.Boolean()),
			writeOnly: Type.Optional(Type.Boolean()),
			deprecated: Type.Optional(Type.Boolean()),
			// Composition keywords
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

	/**
	 * Schema Object - The main union of all schema types
	 */
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
	// Example and Link Objects
	// ============================================

	/**
	 * Example Object (can be a reference or inline)
	 */
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
					// OpenAPI 3.2+ fields
					dataValue: Type.Optional(
						Type.Unknown({
							description:
								"The deserialized/parsed value of the example. Mutually exclusive with serializedValue. (OpenAPI 3.2+)",
						}),
					),
					serializedValue: Type.Optional(
						Type.String({
							description:
								"A serialized string representation of the example value. Mutually exclusive with dataValue. (OpenAPI 3.2+)",
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

	/**
	 * Link Object
	 */
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

	/**
	 * Security Scheme Object
	 */
	SecurityScheme: Type.Union(
		[
			Type.Ref("Reference"),
			Type.Union([
				// API Key
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
				// HTTP
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
				// OAuth 2
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
				// OpenID Connect
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

	/**
	 * Header Object
	 */
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

	// ============================================
	// Encoding Object
	// ============================================

	/**
	 * Encoding Object
	 */
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

	// ============================================
	// Media Type Object
	// ============================================

	/**
	 * Media Type Object
	 */
	MediaType: Type.Object(
		{
			schema: Type.Optional(Type.Ref("SchemaObject")),
			example: Type.Optional(Type.Unknown()),
			examples: Type.Optional(Type.Record(Type.String(), Type.Ref("Example"))),
			encoding: Type.Optional(Type.Record(Type.String(), Type.Ref("Encoding"))),
			// OpenAPI 3.2+ fields for streaming support
			itemSchema: Type.Optional(
				Type.Ref("SchemaObject", {
					description:
						"Schema for individual items in streaming responses (SSE, JSON Lines, etc.). (OpenAPI 3.2+)",
				}),
			),
			itemEncoding: Type.Optional(
				Type.Ref("Encoding", {
					description:
						"Encoding information for streamed items. (OpenAPI 3.2+)",
				}),
			),
		},
		{
			additionalProperties: true,
			description:
				"Each Media Type Object provides schema and examples for the media type identified by its key.",
		},
	),

	// ============================================
	// Parameter Object
	// ============================================

	/**
	 * Parameter Object
	 */
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

	// ============================================
	// Request Body Object
	// ============================================

	/**
	 * Request Body Object
	 */
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

	// ============================================
	// Response Object
	// ============================================

	/**
	 * Response Object
	 */
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

	/**
	 * Responses Object
	 */
	Responses: Type.Record(
		Type.Union([Type.String({ pattern: "^[1-5][0-9]{2}$" }), Type.Literal("default")]),
		Type.Ref("Response"),
		{
			description: "A container for the expected responses of an operation.",
		},
	),

	// ============================================
	// Callback Object
	// ============================================

	/**
	 * Callback Object
	 */
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

	// ============================================
	// Operation Object
	// ============================================

	/**
	 * Operation Object
	 */
	Operation: Type.Object(
		{
			tags: Type.Optional(Type.Array(Type.String())),
			summary: Type.Optional(Type.String()),
			description: Type.Optional(Type.String()),
			operationId: Type.Optional(Type.String()),
			parameters: Type.Optional(Type.Array(Type.Ref("Parameter"))),
			requestBody: Type.Optional(Type.Ref("RequestBody")),
			responses: Type.Ref("Responses"),
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

	// ============================================
	// Path Item Object
	// ============================================

	/**
	 * Path Item Object
	 */
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
			// OpenAPI 3.2+ HTTP method
			query: Type.Optional(
				Type.Ref("Operation", {
					description:
						"QUERY HTTP method for idempotent requests with request bodies. (OpenAPI 3.2+)",
				}),
			),
			servers: Type.Optional(Type.Array(Type.Ref("Server"))),
			parameters: Type.Optional(Type.Array(Type.Ref("Parameter"))),
			// OpenAPI 3.2+ field
			additionalOperations: Type.Optional(
				Type.Record(Type.String(), Type.Ref("Operation"), {
					description:
						"Additional custom HTTP methods beyond the standard set. (OpenAPI 3.2+)",
				}),
			),
		},
		{
			additionalProperties: true,
			description: "Describes the operations available on a single path.",
		},
	),

	/**
	 * Paths Object
	 */
	Paths: Type.Record(Type.String({ pattern: "^/" }), Type.Ref("PathItem"), {
		description: "Holds the relative paths to the individual endpoints.",
	}),

	// ============================================
	// Components Object
	// ============================================

	/**
	 * Components Object
	 */
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

	// ============================================
	// OpenAPI Root Object
	// ============================================

	/**
	 * OpenAPI Document - The root object
	 */
	OpenAPI: Type.Object(
		{
			openapi: Type.String({
				pattern: "^3\\.(0|1|2)\\.\\d+$",
				description:
					"This string MUST be the semantic version number of the OpenAPI Specification version that the OpenAPI document uses.",
			}),
			info: Type.Ref("Info"),
			paths: Type.Optional(Type.Ref("Paths")),
			servers: Type.Optional(Type.Array(Type.Ref("Server"))),
			components: Type.Optional(Type.Ref("Components")),
			security: Type.Optional(Type.Array(Type.Ref("SecurityRequirement"))),
			tags: Type.Optional(Type.Array(Type.Ref("Tag"))),
			externalDocs: Type.Optional(Type.Ref("ExternalDocumentation")),
			webhooks: Type.Optional(Type.Record(Type.String(), Type.Ref("PathItem"))),
			jsonSchemaDialect: Type.Optional(Type.String({ format: "uri" })),
		},
		{
			additionalProperties: true,
			description: "The root object of the OpenAPI document.",
		},
	),
});

// ============================================
// Export individual schemas from the module
// ============================================

// Base schemas
export const ContactSchema = OpenAPIModule.Contact;
export const LicenseSchema = OpenAPIModule.License;
export const InfoSchema = OpenAPIModule.Info;
export const ServerVariableSchema = OpenAPIModule.ServerVariable;
export const ServerSchema = OpenAPIModule.Server;
export const ExternalDocumentationSchema = OpenAPIModule.ExternalDocumentation;
export const TagSchema = OpenAPIModule.Tag;

// Reference schemas
export const InternalRefSchema = OpenAPIModule.InternalRef;
export const UrlRefSchema = OpenAPIModule.UrlRef;
export const FileRefSchema = OpenAPIModule.FileRef;
export const ReferenceSchema = OpenAPIModule.Reference;

// Simple schemas
export const SecurityRequirementSchema = OpenAPIModule.SecurityRequirement;
export const XMLSchema = OpenAPIModule.XML;
export const DiscriminatorSchema = OpenAPIModule.Discriminator;
export const OAuthFlowSchema = OpenAPIModule.OAuthFlow;
export const OAuthFlowsSchema = OpenAPIModule.OAuthFlows;

// Schema object types
export const StringSchema = OpenAPIModule.StringSchema;
export const NumberSchema = OpenAPIModule.NumberSchema;
export const IntegerSchema = OpenAPIModule.IntegerSchema;
export const BooleanSchema = OpenAPIModule.BooleanSchema;
export const NullSchema = OpenAPIModule.NullSchema;
export const ArraySchema = OpenAPIModule.ArraySchema;
export const ObjectSchema = OpenAPIModule.ObjectSchema;
export const SchemaObjectSchema = OpenAPIModule.SchemaObject;

// Complex schemas
export const ExampleSchema = OpenAPIModule.Example;
export const LinkSchema = OpenAPIModule.Link;
export const SecuritySchemeSchema = OpenAPIModule.SecurityScheme;
export const HeaderSchema = OpenAPIModule.Header;
export const EncodingSchema = OpenAPIModule.Encoding;
export const MediaTypeSchema = OpenAPIModule.MediaType;
export const ParameterSchema = OpenAPIModule.Parameter;
export const RequestBodySchema = OpenAPIModule.RequestBody;
export const ResponseSchema = OpenAPIModule.Response;
export const ResponsesSchema = OpenAPIModule.Responses;
export const CallbackSchema = OpenAPIModule.Callback;
export const OperationSchema = OpenAPIModule.Operation;
export const PathItemSchema = OpenAPIModule.PathItem;
export const PathsSchema = OpenAPIModule.Paths;
export const ComponentsSchema = OpenAPIModule.Components;
export const OpenAPISchema = OpenAPIModule.OpenAPI;

// ============================================
// Export TypeScript types
// ============================================

export type Contact = Static<typeof ContactSchema>;
export type License = Static<typeof LicenseSchema>;
export type Info = Static<typeof InfoSchema>;
export type ServerVariable = Static<typeof ServerVariableSchema>;
export type Server = Static<typeof ServerSchema>;
export type ExternalDocumentation = Static<typeof ExternalDocumentationSchema>;
export type Tag = Static<typeof TagSchema>;
export type InternalRef = Static<typeof InternalRefSchema>;
export type UrlRef = Static<typeof UrlRefSchema>;
export type FileRef = Static<typeof FileRefSchema>;
export type Reference = Static<typeof ReferenceSchema>;
export type SecurityRequirement = Static<typeof SecurityRequirementSchema>;
export type XML = Static<typeof XMLSchema>;
export type Discriminator = Static<typeof DiscriminatorSchema>;
export type OAuthFlow = Static<typeof OAuthFlowSchema>;
export type OAuthFlows = Static<typeof OAuthFlowsSchema>;
export type SchemaObject = Static<typeof SchemaObjectSchema>;
export type Example = Static<typeof ExampleSchema>;
export type Link = Static<typeof LinkSchema>;
export type SecurityScheme = Static<typeof SecuritySchemeSchema>;
export type Header = Static<typeof HeaderSchema>;
export type Encoding = Static<typeof EncodingSchema>;
export type MediaType = Static<typeof MediaTypeSchema>;
export type Parameter = Static<typeof ParameterSchema>;
export type RequestBody = Static<typeof RequestBodySchema>;
export type Response = Static<typeof ResponseSchema>;
export type Responses = Static<typeof ResponsesSchema>;
export type Callback = Static<typeof CallbackSchema>;
export type Operation = Static<typeof OperationSchema>;
export type PathItem = Static<typeof PathItemSchema>;
export type Paths = Static<typeof PathsSchema>;
export type Components = Static<typeof ComponentsSchema>;
export type OpenAPI = Static<typeof OpenAPISchema>;

