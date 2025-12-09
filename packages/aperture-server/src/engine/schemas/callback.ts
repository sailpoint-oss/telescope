import { Type, type Static } from "typebox";
import { ReferenceSchema } from "./reference";

/**
 * Callback Object Schema
 * A map of possible out-of-band callbacks related to the parent operation.
 * Note: Uses Type.Unknown() for PathItemSchema to avoid circular dependency.
 * The actual path item structure is validated elsewhere.
 */
export const CallbackSchema = Type.Union(
	[
		ReferenceSchema,
		Type.Record(
			Type.String({
				description:
					"A Path Item Object used to define a callback request and response.",
			}),
			Type.Unknown(),
			{
				description:
					"A map of possible out-of-band callbacks related to the parent operation.",
			},
		),
	],
	{
		description:
			"A map of possible out-of-band callbacks related to the parent operation.",
	},
);

export type Callback = Static<typeof CallbackSchema>;
