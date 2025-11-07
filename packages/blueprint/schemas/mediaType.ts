import { z } from "zod";
import { SchemaObjectSchema } from "./schema";
import { ExampleSchema } from "./example";
import { EncodingSchema } from "./encoding";
import { ReferenceSchema } from "./reference";
import { ExtensionsSchema } from "./extensions";

/**
 * Media Type Object Schema
 * Each Media Type Object provides schema and examples for the media type identified by its key.
 */
export const MediaTypeSchema = z
	.object({
		schema: z
			.union([SchemaObjectSchema, ReferenceSchema])
			.optional()
			.describe(
				"The schema defining the content of the request, response, or parameter.",
			),
		example: z.unknown().optional(),
		examples: z
			.record(z.string(), ExampleSchema)
			.optional()
			.describe("Examples of the media type."),
		encoding: z
			.record(z.string(), EncodingSchema)
			.optional()
			.describe("A map between a property name and its encoding information."),
	})
	.and(ExtensionsSchema)
	.describe(
		"Each Media Type Object provides schema and examples for the media type identified by its key.",
	);

export type MediaType = z.infer<typeof MediaTypeSchema>;
