import { Type, type Static } from "typebox";
import { OAuthFlowSchema } from "./oauthFlow";

/**
 * OAuth Flows Object Schema
 * Allows configuration of the supported OAuth Flows.
 */
export const OAuthFlowsSchema = Type.Object(
	{
		implicit: Type.Optional(OAuthFlowSchema),
		password: Type.Optional(OAuthFlowSchema),
		clientCredentials: Type.Optional(OAuthFlowSchema),
		authorizationCode: Type.Optional(OAuthFlowSchema),
	},
	{
		additionalProperties: true,
		description: "Allows configuration of the supported OAuth Flows.",
	},
);

export type OAuthFlows = Static<typeof OAuthFlowsSchema>;
