import { z } from "zod";
import { HeaderSchema } from "./header";
import { ExtensionsSchema } from "./extensions";

/**
 * Encoding Object Schema
 * A single encoding definition applied to a single schema property.
 */
export const EncodingSchema = z
	.object({
		contentType: z
			.string()
			.optional()
			.describe("The Content-Type for encoding a specific property."),
		headers: z
			.record(z.string(), HeaderSchema)
			.optional()
			.describe(
				"A map allowing additional information to be provided as headers.",
			),
		style: z
			.enum(["form", "spaceDelimited", "pipeDelimited", "deepObject"])
			.default("form")
			.optional()
			.describe(
				"Describes how a specific property value will be serialized depending on its type.",
			),
		explode: z
			.boolean()
			.optional()
			.describe(
				"When this is true, property values of type array or object generate separate parameters for each value of the array.",
			),
		allowReserved: z
			.boolean()
			.default(false)
			.optional()
			.describe(
				"Determines whether the parameter value SHOULD allow reserved characters.",
			),
	})
	.and(ExtensionsSchema)
	.describe(
		"A single encoding definition applied to a single schema property.",
	);

export type Encoding = z.infer<typeof EncodingSchema>;
