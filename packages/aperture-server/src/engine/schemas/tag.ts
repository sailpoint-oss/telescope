import { Type, type Static } from "typebox";
import { ExternalDocumentationSchema } from "./externalDocumentation";

/**
 * Tag Object Schema
 * Adds metadata to a single tag that is used by the Operation Object.
 */
export const TagSchema = Type.Object(
	{
		name: Type.String({ description: "The name of the tag." }),
		description: Type.Optional(
			Type.String({ description: "A short description for the tag." }),
		),
		externalDocs: Type.Optional(ExternalDocumentationSchema),
	},
	{
		additionalProperties: true,
		description:
			"Adds metadata to a single tag that is used by the Operation Object.",
	},
);

export type Tag = Static<typeof TagSchema>;
