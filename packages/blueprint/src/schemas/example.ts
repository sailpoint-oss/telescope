import { z } from "zod";
import { ExtensionsSchema } from "./extensions";
import { ExternalDocumentationSchema } from "./externalDocumentation";
import { ReferenceSchema } from "./reference";

/**
 * Example Object Schema
 * Example Object
 */
export const ExampleSchema = z.union([
	ReferenceSchema,
	z
		.object({
			summary: z
				.string()
				.optional()
				.describe("Short description for the example."),
			description: z
				.string()
				.optional()
				.describe("Long description for the example."),
			value: z.unknown().optional().describe("Embedded literal example."),
			externalValue: z
				.url()
				.optional()
				.describe("A URL that points to the literal example."),
		})
		.and(ExtensionsSchema)
		.describe("Example Object"),
]);

export type Example = z.infer<typeof ExampleSchema>;
