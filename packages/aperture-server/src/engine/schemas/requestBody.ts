import { Type, type Static } from "typebox";
import { MediaTypeSchema } from "./mediaType";
import { ReferenceSchema } from "./reference";

/**
 * Request Body Object Schema
 * Describes a single request body.
 */
export const RequestBodySchema = Type.Union(
	[
		ReferenceSchema,
		Type.Object(
			{
				description: Type.Optional(
					Type.String({
						description: "A brief description of the request body.",
					}),
				),
				content: Type.Record(Type.String(), MediaTypeSchema, {
					description: "The content of the request body.",
				}),
				required: Type.Optional(
					Type.Boolean({
						default: false,
						description:
							"Determines if the request body is required in the request.",
					}),
				),
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
);

export type RequestBody = Static<typeof RequestBodySchema>;
