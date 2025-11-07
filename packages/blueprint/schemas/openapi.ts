import { z } from "zod";
import { InfoSchema } from "./info";
import { PathsSchema } from "./paths";
import { ServerSchema } from "./server";
import { ComponentsSchema } from "./components";
import { SecurityRequirementSchema } from "./securityRequirement";
import { TagSchema } from "./tag";
import { ExternalDocumentationSchema } from "./externalDocumentation";
import { ExtensionsSchema } from "./extensions";

/**
 * OpenAPI Document Schema
 * This is the root object of the OpenAPI document.
 * Based on OpenAPI 3.0, 3.1, and 3.2 specifications.
 */
export const OpenAPISchema = z
	.object({
		openapi: z
			.string()
			.regex(/^3\.(0|1|2)\.\d+$/)
			.describe(
				"This string MUST be the semantic version number of the OpenAPI Specification version that the OpenAPI document uses.",
			),
		info: InfoSchema.describe(
			"Provides metadata about the API. The metadata MAY be used by tooling as required.",
		),
		paths: PathsSchema.describe(
			"The available paths and operations for the API.",
		),
		servers: z
			.array(ServerSchema)
			.optional()
			.describe(
				"An array of Server Objects, which provide connectivity information to a target server.",
			),
		components: ComponentsSchema.optional().describe(
			"An element to hold various schemas for the specification.",
		),
		security: z
			.array(SecurityRequirementSchema)
			.optional()
			.describe(
				"A declaration of which security mechanisms can be used across the API.",
			),
		tags: z
			.array(TagSchema)
			.optional()
			.describe(
				"A list of tags used by the specification with additional metadata.",
			),
		externalDocs: ExternalDocumentationSchema.optional().describe(
			"Additional external documentation.",
		),
	})
	.and(ExtensionsSchema)
	.describe("The root object of the OpenAPI document.");

export type OpenAPI = z.infer<typeof OpenAPISchema>;
