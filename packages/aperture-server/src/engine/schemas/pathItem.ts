import { Type, type Static } from "typebox";
import { OperationSchema } from "./operation";
import { ParameterSchema } from "./parameter";
import { ServerSchema } from "./server";

/**
 * Path Item Object Schema
 * Describes the operations available on a single path.
 */
export const PathItemSchema = Type.Object(
	{
		$ref: Type.Optional(
			Type.String({
				description: "Allows for an external definition of this path item.",
			}),
		),
		summary: Type.Optional(
			Type.String({
				description:
					"An optional, string summary, intended to apply to all operations in this path.",
			}),
		),
		description: Type.Optional(
			Type.String({
				description:
					"An optional, string description, intended to apply to all operations in this path.",
			}),
		),
		get: Type.Optional(OperationSchema),
		put: Type.Optional(OperationSchema),
		post: Type.Optional(OperationSchema),
		delete: Type.Optional(OperationSchema),
		options: Type.Optional(OperationSchema),
		head: Type.Optional(OperationSchema),
		patch: Type.Optional(OperationSchema),
		trace: Type.Optional(OperationSchema),
		servers: Type.Optional(
			Type.Array(ServerSchema, {
				description:
					"An alternative server array to service all operations in this path.",
			}),
		),
		parameters: Type.Optional(
			Type.Array(ParameterSchema, {
				description:
					"A list of parameters that are applicable for all the operations described under this path.",
			}),
		),
	},
	{
		additionalProperties: true,
		description: "Describes the operations available on a single path.",
	},
);

export type PathItem = Static<typeof PathItemSchema>;
