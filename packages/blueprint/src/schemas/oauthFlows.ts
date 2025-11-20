import { z } from "zod";
import { ExtensionsSchema } from "./extensions";
import { OAuthFlowSchema } from "./oauthFlow";

/**
 * OAuth Flows Object Schema
 * Allows configuration of the supported OAuth Flows.
 */
export const OAuthFlowsSchema = z
	.object({
		implicit: OAuthFlowSchema.optional(),
		password: OAuthFlowSchema.optional(),
		clientCredentials: OAuthFlowSchema.optional(),
		authorizationCode: OAuthFlowSchema.optional(),
	})
	.and(ExtensionsSchema)
	.describe("Allows configuration of the supported OAuth Flows.");

export type OAuthFlows = z.infer<typeof OAuthFlowsSchema>;
