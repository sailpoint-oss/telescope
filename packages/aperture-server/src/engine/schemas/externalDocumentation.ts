import { Type, type Static } from "typebox";

/**
 * External Documentation Object Schema
 * Allows referencing an external resource for extended documentation.
 */
export const ExternalDocumentationSchema = Type.Object(
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
);

export type ExternalDocumentation = Static<typeof ExternalDocumentationSchema>;
