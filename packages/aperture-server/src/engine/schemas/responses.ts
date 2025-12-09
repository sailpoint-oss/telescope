import { Type, type Static } from "typebox";
import { ResponseSchema } from "./response";

/**
 * Responses Object Schema
 * A container for the expected responses of an operation.
 */
export const ResponsesSchema = Type.Record(
	Type.Union([
		Type.String({ pattern: "^[1-5][0-9]{2}$" }),
		Type.Literal("default"),
	]),
	ResponseSchema,
	{
		description: "A container for the expected responses of an operation.",
	},
);

export type Responses = Static<typeof ResponsesSchema>;
