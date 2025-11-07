import { z } from "zod";
import { MediaTypeSchema } from "./mediaType";
import { ReferenceSchema } from "./reference";
import { ExtensionsSchema } from "./extensions";

/**
 * Request Body Object Schema
 * Describes a single request body.
 */
export const RequestBodySchema = z.union([
	ReferenceSchema,
	z
		.object({
			description: z
				.string()
				.optional()
				.describe("A brief description of the request body."),
			content: z
				.record(z.string(), MediaTypeSchema)
				.describe("The content of the request body."),
			required: z
				.boolean()
				.default(false)
				.optional()
				.describe("Determines if the request body is required in the request."),
		})
		.and(ExtensionsSchema)
		.describe("Describes a single request body."),
]);

export type RequestBody = z.infer<typeof RequestBodySchema>;
