import { z } from "zod";
import { PathItemSchema } from "./pathItem";
import { ReferenceSchema } from "./reference";

/**
 * Callback Object Schema
 * A map of possible out-of-band callbacks related to the parent operation.
 */
export const CallbackSchema = z.union([
	ReferenceSchema,
	z
		.record(
			z
				.string()
				.describe(
					"A Path Item Object used to define a callback request and response.",
				),
			z.any(),
			// PathItemSchema
		)
		.describe(
			"A map of possible out-of-band callbacks related to the parent operation.",
		),
]);

export type Callback = z.infer<typeof CallbackSchema>;
