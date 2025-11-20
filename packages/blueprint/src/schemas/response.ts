import { z } from "zod";
import { ExtensionsSchema } from "./extensions";
import { HeaderSchema } from "./header";
import { LinkSchema } from "./link";
import { MediaTypeSchema } from "./mediaType";
import { ReferenceSchema } from "./reference";

/**
 * Response Object Schema
 * Describes a single response from an API Operation.
 */
export const ResponseSchema = z.union([
	ReferenceSchema,
	z
		.object({
			description: z.string().describe("A description of the response."),
			headers: z
				.record(z.string(), HeaderSchema)
				.optional()
				.describe("Maps a header name to its definition."),
			content: z
				.record(z.string(), MediaTypeSchema)
				.optional()
				.describe(
					"A map containing descriptions of potential response payloads.",
				),
			links: z
				.record(z.string(), LinkSchema)
				.optional()
				.describe(
					"A map of operations links that can be followed from the response.",
				),
		})
		.and(ExtensionsSchema)
		.describe("Describes a single response from an API Operation."),
]);

export type Response = z.infer<typeof ResponseSchema>;
