import { z } from "zod";
import { ParameterSchema } from "./parameter";
import { ServerSchema } from "./server";
import { OperationSchema } from "./operation";
import { ExtensionsSchema } from "./extensions";

/**
 * Path Item Object Schema
 * Describes the operations available on a single path.
 */
export const PathItemSchema = z
	.object({
		$ref: z
			.string()
			.optional()
			.describe("Allows for an external definition of this path item."),
		summary: z
			.string()
			.optional()
			.describe(
				"An optional, string summary, intended to apply to all operations in this path.",
			),
		description: z
			.string()
			.optional()
			.describe(
				"An optional, string description, intended to apply to all operations in this path.",
			),
		get: OperationSchema.optional(),
		put: OperationSchema.optional(),
		post: OperationSchema.optional(),
		delete: OperationSchema.optional(),
		options: OperationSchema.optional(),
		head: OperationSchema.optional(),
		patch: OperationSchema.optional(),
		trace: OperationSchema.optional(),
		servers: z
			.array(ServerSchema)
			.optional()
			.describe(
				"An alternative server array to service all operations in this path.",
			),
		parameters: z
			.array(ParameterSchema)
			.optional()
			.describe(
				"A list of parameters that are applicable for all the operations described under this path.",
			),
	})
	.and(ExtensionsSchema)
	.describe("Describes the operations available on a single path.");

export type PathItem = z.infer<typeof PathItemSchema>;
