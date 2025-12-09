import { Type, type Static } from "typebox";
import { EncodingSchema } from "./encoding";
import { ExampleSchema } from "./example";
import { ReferenceSchema } from "./reference";
import { SchemaObjectSchema } from "./schema";

/**
 * Media Type Object Schema
 * Each Media Type Object provides schema and examples for the media type identified by its key.
 */
export const MediaTypeSchema = Type.Object(
	{
		schema: Type.Optional(
			Type.Union([SchemaObjectSchema, ReferenceSchema], {
				description:
					"The schema defining the content of the request, response, or parameter.",
			}),
		),
		example: Type.Optional(Type.Unknown()),
		examples: Type.Optional(
			Type.Record(Type.String(), ExampleSchema, {
				description: "Examples of the media type.",
			}),
		),
		encoding: Type.Optional(
			Type.Record(Type.String(), EncodingSchema, {
				description:
					"A map between a property name and its encoding information.",
			}),
		),
	},
	{
		additionalProperties: true,
		description:
			"Each Media Type Object provides schema and examples for the media type identified by its key.",
	},
);

export type MediaType = Static<typeof MediaTypeSchema>;
