import { Type, type Static } from "typebox";
import { ExampleSchema } from "./example";
import { ReferenceSchema } from "./reference";
import { SchemaObjectSchema } from "./schema";

/**
 * Header Object Schema
 * The Header Object follows the structure of the Parameter Object.
 */
export const HeaderSchema = Type.Union(
	[
		ReferenceSchema,
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
				explode: Type.Optional(
					Type.Boolean({
						description:
							"When this is true, parameter values of type array or object generate separate parameters for each value.",
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
					Type.Record(Type.String(), Type.Unknown(), {
						description:
							"A map containing the representations for the parameter.",
					}),
				),
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
);

export type Header = Static<typeof HeaderSchema>;
