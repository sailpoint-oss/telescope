import { Type, type Static } from "typebox";

/**
 * XML Object Schema
 * A metadata object that allows for more fine-tuned XML model definitions.
 */
export const XMLSchema = Type.Object(
	{
		name: Type.Optional(
			Type.String({
				description:
					"Replaces the name of the element/attribute used for the described schema property.",
			}),
		),
		namespace: Type.Optional(
			Type.String({
				format: "uri",
				description: "The URI of the namespace definition.",
			}),
		),
		prefix: Type.Optional(
			Type.String({
				description: "The prefix to be used for the name.",
			}),
		),
		attribute: Type.Optional(
			Type.Boolean({
				default: false,
				description:
					"Declares whether the property definition translates to an attribute instead of an element.",
			}),
		),
		wrapped: Type.Optional(
			Type.Boolean({
				default: false,
				description:
					"May be used only for an array definition. Signifies whether the array is wrapped or not.",
			}),
		),
	},
	{
		additionalProperties: true,
		description:
			"A metadata object that allows for more fine-tuned XML model definitions.",
	},
);

export type XML = Static<typeof XMLSchema>;
