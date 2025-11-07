import { z } from "zod";

/**
 * Reference Object Schema
 * A simple object to allow referencing other components in the specification.
 */
export const ReferenceSchema = z
	.object({
		$ref: z.string().regex(/^#\//).describe("The reference string."),
		summary: z
			.string()
			.optional()
			.describe(
				"A short summary which by default SHOULD override that of the referenced component.",
			),
		description: z
			.string()
			.optional()
			.describe(
				"A description which by default SHOULD override that of the referenced component.",
			),
	})
	.describe(
		"A simple object to allow referencing other components in the specification.",
	);

export type Reference = z.infer<typeof ReferenceSchema>;
