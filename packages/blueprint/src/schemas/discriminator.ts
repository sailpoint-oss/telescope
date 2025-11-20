import { z } from "zod";
import { ExtensionsSchema } from "./extensions";

/**
 * Discriminator Object Schema
 * When request bodies or response payloads may be one of a number of different schemas,
 * a discriminator object can be used to aid in serialization, deserialization, and validation.
 */
export const DiscriminatorSchema = z
	.object({
		propertyName: z
			.string()
			.describe(
				"The name of the property in the payload that will hold the discriminator value.",
			),
		mapping: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				"An object to hold mappings between payload values and schema names or references.",
			),
	})
	.and(ExtensionsSchema)
	.describe(
		"When request bodies or response payloads may be one of a number of different schemas, a discriminator object can be used to aid in serialization, deserialization, and validation.",
	);

export type Discriminator = z.infer<typeof DiscriminatorSchema>;
