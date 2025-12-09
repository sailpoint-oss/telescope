import { Type, type Static } from "typebox";
import { ComponentsSchema } from "./components";
import { ExternalDocumentationSchema } from "./externalDocumentation";
import { InfoSchema } from "./info";
import { PathsSchema } from "./paths";
import { SecurityRequirementSchema } from "./securityRequirement";
import { ServerSchema } from "./server";
import { TagSchema } from "./tag";

/**
 * OpenAPI Document Schema
 * This is the root object of the OpenAPI document.
 * Based on OpenAPI 3.0, 3.1, and 3.2 specifications.
 */
export const OpenAPISchema = Type.Object(
	{
		openapi: Type.String({
			pattern: "^3\\.(0|1|2)\\.\\d+$",
			description:
				"This string MUST be the semantic version number of the OpenAPI Specification version that the OpenAPI document uses.",
		}),
		info: InfoSchema,
		paths: PathsSchema,
		servers: Type.Optional(
			Type.Array(ServerSchema, {
				description:
					"An array of Server Objects, which provide connectivity information to a target server.",
			}),
		),
		components: Type.Optional(ComponentsSchema),
		security: Type.Optional(
			Type.Array(SecurityRequirementSchema, {
				description:
					"A declaration of which security mechanisms can be used across the API.",
			}),
		),
		tags: Type.Optional(
			Type.Array(TagSchema, {
				description:
					"A list of tags used by the specification with additional metadata.",
			}),
		),
		externalDocs: Type.Optional(ExternalDocumentationSchema),
	},
	{
		additionalProperties: true,
		description: "The root object of the OpenAPI document.",
	},
);

export type OpenAPI = Static<typeof OpenAPISchema>;
