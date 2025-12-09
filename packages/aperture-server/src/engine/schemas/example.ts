import { Type, type Static } from "typebox";
import { ReferenceSchema } from "./reference";

/**
 * Example Object Schema
 * Example Object
 */
export const ExampleSchema = Type.Union(
	[
		ReferenceSchema,
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
);

export type Example = Static<typeof ExampleSchema>;
