import { z } from "zod";
import { ParameterSchema } from "./parameter";
import { RequestBodySchema } from "./requestBody";
import { ResponsesSchema } from "./responses";
import { CallbackSchema } from "./callback";
import { SecurityRequirementSchema } from "./securityRequirement";
import { ServerSchema } from "./server";
import { ExternalDocumentationSchema } from "./externalDocumentation";
import { ExtensionsSchema } from "./extensions";

/**
 * Operation Object Schema
 * Describes a single API operation on a path.
 */
export const OperationSchema = z
	.object({
		tags: z
			.array(z.string())
			.optional()
			.describe("A list of tags for API documentation control."),
		summary: z
			.string()
			.optional()
			.describe("A short summary of what the operation does."),
		description: z
			.string()
			.optional()
			.describe("A verbose explanation of the operation behavior."),
		operationId: z
			.string()
			.optional()
			.describe("Unique string used to identify the operation."),
		parameters: z
			.array(ParameterSchema)
			.optional()
			.describe("A list of parameters that are applicable for this operation."),
		requestBody: RequestBodySchema.optional(),
		responses: ResponsesSchema,
		get callbacks() {
			return z
				.record(z.string(), CallbackSchema)
				.optional()
				.describe(
					"A map of possible out-of-band callbacks related to the parent operation.",
				);
		},
		deprecated: z
			.boolean()
			.default(false)
			.optional()
			.describe("Declares this operation to be deprecated."),
		security: z
			.array(SecurityRequirementSchema)
			.optional()
			.describe(
				"A declaration of which security mechanisms can be used for this operation.",
			),
		servers: z
			.array(ServerSchema)
			.optional()
			.describe("An alternative server array to service this operation."),
		externalDocs: ExternalDocumentationSchema.optional(),
	})
	.and(ExtensionsSchema)
	.describe("Describes a single API operation on a path.");

export type Operation = z.infer<typeof OperationSchema>;
