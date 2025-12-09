import { Type, type Static } from "typebox";
import { ReferenceSchema } from "./reference";
import { ServerSchema } from "./server";

/**
 * Link Object Schema
 * The Link object represents a possible design-time link for a response.
 */
export const LinkSchema = Type.Union(
	[
		ReferenceSchema,
		Type.Object(
			{
				operationId: Type.Optional(
					Type.String({
						description:
							"The name of an existing, resolvable OAS operation, as defined with a unique operationId.",
					}),
				),
				operationRef: Type.Optional(
					Type.String({
						description:
							"A relative or absolute URI reference to an OAS operation.",
					}),
				),
				parameters: Type.Optional(
					Type.Record(Type.String(), Type.Unknown(), {
						description:
							"A map representing parameters to pass to an operation as specified with operationId or identified via operationRef.",
					}),
				),
				requestBody: Type.Optional(
					Type.Unknown({
						description:
							"A literal value or {expression} to use as a request body when calling the target operation.",
					}),
				),
				description: Type.Optional(
					Type.String({ description: "A description of the link." }),
				),
				server: Type.Optional(ServerSchema),
			},
			{
				additionalProperties: true,
				description:
					"The Link object represents a possible design-time link for a response.",
			},
		),
	],
	{
		description:
			"The Link object represents a possible design-time link for a response.",
	},
);

export type Link = Static<typeof LinkSchema>;
