import { Type, type Static } from "typebox";
import { HeaderSchema } from "./header";

/**
 * Encoding Object Schema
 * A single encoding definition applied to a single schema property.
 */
export const EncodingSchema = Type.Object(
	{
		contentType: Type.Optional(
			Type.String({
				description: "The Content-Type for encoding a specific property.",
			}),
		),
		headers: Type.Optional(
			Type.Record(Type.String(), HeaderSchema, {
				description:
					"A map allowing additional information to be provided as headers.",
			}),
		),
		style: Type.Optional(
			Type.Union(
				[
					Type.Literal("form"),
					Type.Literal("spaceDelimited"),
					Type.Literal("pipeDelimited"),
					Type.Literal("deepObject"),
				],
				{
					default: "form",
					description:
						"Describes how a specific property value will be serialized depending on its type.",
				},
			),
		),
		explode: Type.Optional(
			Type.Boolean({
				description:
					"When this is true, property values of type array or object generate separate parameters for each value of the array.",
			}),
		),
		allowReserved: Type.Optional(
			Type.Boolean({
				default: false,
				description:
					"Determines whether the parameter value SHOULD allow reserved characters.",
			}),
		),
	},
	{
		additionalProperties: true,
		description:
			"A single encoding definition applied to a single schema property.",
	},
);

export type Encoding = Static<typeof EncodingSchema>;
