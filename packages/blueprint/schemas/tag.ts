import { z } from "zod";
import { ExternalDocumentationSchema } from "./externalDocumentation";
import { ExtensionsSchema } from "./extensions";

/**
 * Tag Object Schema
 * Adds metadata to a single tag that is used by the Operation Object.
 */
export const TagSchema = z
	.object({
		name: z.string().describe("The name of the tag."),
		description: z
			.string()
			.optional()
			.describe("A short description for the tag."),
		externalDocs: ExternalDocumentationSchema.optional(),
	})
	.and(ExtensionsSchema)
	.describe(
		"Adds metadata to a single tag that is used by the Operation Object.",
	);

export type Tag = z.infer<typeof TagSchema>;
