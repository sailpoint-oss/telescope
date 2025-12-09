import { Type, type Static } from "typebox";
import { CallbackSchema } from "./callback";
import { ExternalDocumentationSchema } from "./externalDocumentation";
import { ParameterSchema } from "./parameter";
import { RequestBodySchema } from "./requestBody";
import { ResponsesSchema } from "./responses";
import { SecurityRequirementSchema } from "./securityRequirement";
import { ServerSchema } from "./server";

/**
 * Operation Object Schema
 * Describes a single API operation on a path.
 */
export const OperationSchema = Type.Object(
	{
		tags: Type.Optional(
			Type.Array(Type.String(), {
				description: "A list of tags for API documentation control.",
			}),
		),
		summary: Type.Optional(
			Type.String({
				description: "A short summary of what the operation does.",
			}),
		),
		description: Type.Optional(
			Type.String({
				description: "A verbose explanation of the operation behavior.",
			}),
		),
		operationId: Type.Optional(
			Type.String({
				description: "Unique string used to identify the operation.",
			}),
		),
		parameters: Type.Optional(
			Type.Array(ParameterSchema, {
				description:
					"A list of parameters that are applicable for this operation.",
			}),
		),
		requestBody: Type.Optional(RequestBodySchema),
		responses: ResponsesSchema,
		callbacks: Type.Optional(
			Type.Record(Type.String(), CallbackSchema, {
				description:
					"A map of possible out-of-band callbacks related to the parent operation.",
			}),
		),
		deprecated: Type.Optional(
			Type.Boolean({
				default: false,
				description: "Declares this operation to be deprecated.",
			}),
		),
		security: Type.Optional(
			Type.Array(SecurityRequirementSchema, {
				description:
					"A declaration of which security mechanisms can be used for this operation.",
			}),
		),
		servers: Type.Optional(
			Type.Array(ServerSchema, {
				description: "An alternative server array to service this operation.",
			}),
		),
		externalDocs: Type.Optional(ExternalDocumentationSchema),
	},
	{
		additionalProperties: true,
		description: "Describes a single API operation on a path.",
	},
);

export type Operation = Static<typeof OperationSchema>;
