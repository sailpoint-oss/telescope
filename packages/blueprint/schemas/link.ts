import { z } from "zod";
import { ReferenceSchema } from "./reference";
import { ServerSchema } from "./server";
import { ExtensionsSchema } from "./extensions";

/**
 * Link Object Schema
 * The Link object represents a possible design-time link for a response.
 */
export const LinkSchema = z.union([
	ReferenceSchema,
	z
		.object({
			operationId: z
				.string()
				.optional()
				.describe(
					"The name of an existing, resolvable OAS operation, as defined with a unique operationId.",
				),
			operationRef: z
				.string()
				.optional()
				.describe("A relative or absolute URI reference to an OAS operation."),
			parameters: z
				.record(z.string(), z.unknown())
				.optional()
				.describe(
					"A map representing parameters to pass to an operation as specified with operationId or identified via operationRef.",
				),
			requestBody: z
				.unknown()
				.optional()
				.describe(
					"A literal value or {expression} to use as a request body when calling the target operation.",
				),
			description: z.string().optional().describe("A description of the link."),
			server: ServerSchema.optional().describe(
				"A server object to be used by the target operation.",
			),
		})
		.and(ExtensionsSchema)
		.describe(
			"The Link object represents a possible design-time link for a response.",
		),
]);

export type Link = z.infer<typeof LinkSchema>;
