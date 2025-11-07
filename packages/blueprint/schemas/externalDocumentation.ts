import { z } from "zod";
import { ExtensionsSchema } from "./extensions";

/**
 * External Documentation Object Schema
 * Allows referencing an external resource for extended documentation.
 */
export const ExternalDocumentationSchema = z
	.object({
		description: z
			.string()
			.optional()
			.describe("A short description of the target documentation."),
		url: z.string().url().describe("The URL for the target documentation."),
	})
	.and(ExtensionsSchema)
	.describe(
		"Allows referencing an external resource for extended documentation.",
	);

export type ExternalDocumentation = z.infer<typeof ExternalDocumentationSchema>;
