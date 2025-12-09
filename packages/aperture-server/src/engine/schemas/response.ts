import { Type, type Static } from "typebox";
import { HeaderSchema } from "./header";
import { LinkSchema } from "./link";
import { MediaTypeSchema } from "./mediaType";
import { ReferenceSchema } from "./reference";

/**
 * Response Object Schema
 * Describes a single response from an API Operation.
 */
export const ResponseSchema = Type.Union(
	[
		ReferenceSchema,
		Type.Object(
			{
				description: Type.String({
					description: "A description of the response.",
				}),
				headers: Type.Optional(
					Type.Record(Type.String(), HeaderSchema, {
						description: "Maps a header name to its definition.",
					}),
				),
				content: Type.Optional(
					Type.Record(Type.String(), MediaTypeSchema, {
						description:
							"A map containing descriptions of potential response payloads.",
					}),
				),
				links: Type.Optional(
					Type.Record(Type.String(), LinkSchema, {
						description:
							"A map of operations links that can be followed from the response.",
					}),
				),
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
);

export type Response = Static<typeof ResponseSchema>;
