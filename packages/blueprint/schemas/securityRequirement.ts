import { z } from "zod";

/**
 * Security Requirement Object Schema
 * Lists the required security schemes for this operation.
 */
export const SecurityRequirementSchema = z
	.record(z.string(), z.array(z.string()))
	.describe("Lists the required security schemes for this operation.");

export type SecurityRequirement = z.infer<typeof SecurityRequirementSchema>;
