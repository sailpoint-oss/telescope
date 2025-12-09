import { Type, type Static } from "typebox";
import { ExampleSchema } from "./example";
import { MediaTypeSchema } from "./mediaType";
import { ReferenceSchema } from "./reference";
import { SchemaObjectSchema } from "./schema";

/**
 * Parameter Object Schema
 * Describes a single operation parameter.
 */
export const ParameterSchema = Type.Union(
	[
		ReferenceSchema,
		Type.Object(
			{
				name: Type.String({ description: "The name of the parameter." }),
				in: Type.Union(
					[
						Type.Literal("query"),
						Type.Literal("header"),
						Type.Literal("path"),
						Type.Literal("cookie"),
					],
					{ description: "The location of the parameter." },
				),
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
					Type.Union(
						[
							Type.Literal("matrix"),
							Type.Literal("label"),
							Type.Literal("form"),
							Type.Literal("simple"),
							Type.Literal("spaceDelimited"),
							Type.Literal("pipeDelimited"),
							Type.Literal("deepObject"),
						],
						{
							description:
								"Describes how the parameter value will be serialized depending on the type of the parameter value.",
						},
					),
				),
				explode: Type.Optional(
					Type.Boolean({
						description:
							"When this is true, parameter values of type array or object generate separate parameters for each value of the array or key-value pair of the map.",
					}),
				),
				allowReserved: Type.Optional(
					Type.Boolean({
						default: false,
						description:
							"Determines whether the parameter value SHOULD allow reserved characters.",
					}),
				),
				schema: Type.Optional(SchemaObjectSchema),
				example: Type.Optional(Type.Unknown()),
				examples: Type.Optional(
					Type.Record(Type.String(), ExampleSchema, {
						description: "Examples of the parameter's potential value.",
					}),
				),
				content: Type.Optional(
					Type.Record(Type.String(), MediaTypeSchema, {
						description:
							"A map containing the representations for the parameter.",
					}),
				),
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
);

export type Parameter = Static<typeof ParameterSchema>;
