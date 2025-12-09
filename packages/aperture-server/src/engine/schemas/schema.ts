import { Type, type Static } from "typebox";
import { ReferenceSchema } from "./reference";

/**
 * Base schema properties shared by all OpenAPI schemas.
 * These are the common properties that can appear on any schema type.
 */
const BaseSchemaProperties = {
	title: Type.Optional(Type.String()),
	description: Type.Optional(Type.String()),
	default: Type.Optional(Type.Unknown()),
	example: Type.Optional(Type.Unknown()),
	examples: Type.Optional(
		Type.Array(Type.Unknown(), {
			description: "Example values for this schema.",
		}),
	),
	enum: Type.Optional(Type.Array(Type.Unknown())),
	const: Type.Optional(Type.Unknown()),
	// OpenAPI extensions
	discriminator: Type.Optional(Type.Unknown()),
	xml: Type.Optional(Type.Unknown()),
	externalDocs: Type.Optional(Type.Unknown()),
	nullable: Type.Optional(Type.Boolean()),
	readOnly: Type.Optional(Type.Boolean()),
	writeOnly: Type.Optional(Type.Boolean()),
	deprecated: Type.Optional(Type.Boolean()),
};

/**
 * Composition keywords that reference SchemaObject recursively.
 * Using Type.Ref for proper $defs generation.
 */
const CompositionKeywords = {
	allOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
	oneOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
	anyOf: Type.Optional(Type.Array(Type.Ref("SchemaObject"))),
	not: Type.Optional(Type.Ref("SchemaObject")),
	if: Type.Optional(Type.Ref("SchemaObject")),
	then: Type.Optional(Type.Ref("SchemaObject")),
	else: Type.Optional(Type.Ref("SchemaObject")),
};

/**
 * OpenAPI Schema Module - handles recursive schema definitions.
 * TypeBox Module generates proper $defs for cyclic references.
 */
const OpenAPISchemaModule = Type.Module({
	// String schema type
	StringSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("string")),
			format: Type.Optional(Type.String()),
			pattern: Type.Optional(Type.String()),
			minLength: Type.Optional(Type.Integer({ minimum: 0 })),
			maxLength: Type.Optional(Type.Integer({ minimum: 0 })),
			...BaseSchemaProperties,
			...CompositionKeywords,
		},
		{ additionalProperties: false, description: "String schema type" },
	),

	// Number schema type
	NumberSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("number")),
			format: Type.Optional(Type.String()),
			multipleOf: Type.Optional(Type.Number()),
			minimum: Type.Optional(Type.Number()),
			maximum: Type.Optional(Type.Number()),
			exclusiveMinimum: Type.Optional(
				Type.Union([Type.Number(), Type.Boolean()]),
			),
			exclusiveMaximum: Type.Optional(
				Type.Union([Type.Number(), Type.Boolean()]),
			),
			...BaseSchemaProperties,
			...CompositionKeywords,
		},
		{ additionalProperties: false, description: "Number schema type" },
	),

	// Integer schema type
	IntegerSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("integer")),
			format: Type.Optional(Type.String()),
			multipleOf: Type.Optional(Type.Number()),
			minimum: Type.Optional(Type.Number()),
			maximum: Type.Optional(Type.Number()),
			exclusiveMinimum: Type.Optional(
				Type.Union([Type.Number(), Type.Boolean()]),
			),
			exclusiveMaximum: Type.Optional(
				Type.Union([Type.Number(), Type.Boolean()]),
			),
			...BaseSchemaProperties,
			...CompositionKeywords,
		},
		{ additionalProperties: false, description: "Integer schema type" },
	),

	// Boolean schema type
	BooleanSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("boolean")),
			...BaseSchemaProperties,
			...CompositionKeywords,
		},
		{ additionalProperties: false, description: "Boolean schema type" },
	),

	// Null schema type
	NullSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("null")),
			...BaseSchemaProperties,
			...CompositionKeywords,
		},
		{ additionalProperties: false, description: "Null schema type" },
	),

	// Array schema type
	ArraySchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("array")),
			items: Type.Optional(
				Type.Union([
					Type.Ref("SchemaObject"),
					Type.Array(Type.Ref("SchemaObject")),
				]),
			),
			additionalItems: Type.Optional(
				Type.Union([Type.Ref("SchemaObject"), Type.Boolean()]),
			),
			minItems: Type.Optional(Type.Integer({ minimum: 0 })),
			maxItems: Type.Optional(Type.Integer({ minimum: 0 })),
			uniqueItems: Type.Optional(Type.Boolean()),
			...BaseSchemaProperties,
			...CompositionKeywords,
		},
		{ additionalProperties: false, description: "Array schema type" },
	),

	// Object schema type
	ObjectSchema: Type.Object(
		{
			type: Type.Optional(Type.Literal("object")),
			properties: Type.Optional(
				Type.Record(Type.String(), Type.Ref("SchemaObject")),
			),
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
			...BaseSchemaProperties,
			...CompositionKeywords,
		},
		{ additionalProperties: false, description: "Object schema type" },
	),

	// The main SchemaObject union type
	SchemaObject: Type.Union(
		[
			ReferenceSchema,
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
});

// Export the SchemaObject schema from the module
export const SchemaObjectSchema = OpenAPISchemaModule.SchemaObject;

// Also export the individual type schemas for direct use
export const StringSchema = OpenAPISchemaModule.StringSchema;
export const NumberSchema = OpenAPISchemaModule.NumberSchema;
export const IntegerSchema = OpenAPISchemaModule.IntegerSchema;
export const BooleanSchema = OpenAPISchemaModule.BooleanSchema;
export const ArraySchema = OpenAPISchemaModule.ArraySchema;
export const ObjectSchema = OpenAPISchemaModule.ObjectSchema;
export const NullSchema = OpenAPISchemaModule.NullSchema;

export type SchemaObject = Static<typeof SchemaObjectSchema>;
