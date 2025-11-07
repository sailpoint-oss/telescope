import { z } from "zod";
import { ExtensionsSchema } from "./extensions";

/**
 * XML Object Schema
 * A metadata object that allows for more fine-tuned XML model definitions.
 */
export const XMLSchema = z
	.object({
		name: z
			.string()
			.optional()
			.describe(
				"Replaces the name of the element/attribute used for the described schema property.",
			),
		namespace: z
			.string()
			.url()
			.optional()
			.describe("The URI of the namespace definition."),
		prefix: z
			.string()
			.optional()
			.describe("The prefix to be used for the name."),
		attribute: z
			.boolean()
			.default(false)
			.optional()
			.describe(
				"Declares whether the property definition translates to an attribute instead of an element.",
			),
		wrapped: z
			.boolean()
			.default(false)
			.optional()
			.describe(
				"May be used only for an array definition. Signifies whether the array is wrapped or not.",
			),
	})
	.and(ExtensionsSchema)
	.describe(
		"A metadata object that allows for more fine-tuned XML model definitions.",
	);

export type XML = z.infer<typeof XMLSchema>;
