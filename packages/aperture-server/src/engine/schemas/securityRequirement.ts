import { Type, type Static } from "typebox";

/**
 * Security Requirement Object Schema
 * Lists the required security schemes for this operation.
 */
export const SecurityRequirementSchema = Type.Record(
	Type.String(),
	Type.Array(Type.String()),
	{
		description: "Lists the required security schemes for this operation.",
	},
);

export type SecurityRequirement = Static<typeof SecurityRequirementSchema>;
