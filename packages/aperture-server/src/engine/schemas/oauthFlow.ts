import { Type, type Static } from "typebox";

/**
 * OAuth Flow Object Schema
 * Configuration details for a supported OAuth Flow.
 */
export const OAuthFlowSchema = Type.Object(
	{
		authorizationUrl: Type.Optional(
			Type.String({
				format: "uri",
				description: "The authorization URL to be used for this flow.",
			}),
		),
		tokenUrl: Type.Optional(
			Type.String({
				format: "uri",
				description: "The token URL to be used for this flow.",
			}),
		),
		refreshUrl: Type.Optional(
			Type.String({
				format: "uri",
				description: "The URL to be used for obtaining refresh tokens.",
			}),
		),
		scopes: Type.Record(Type.String(), Type.String(), {
			description: "The available scopes for the OAuth2 security scheme.",
		}),
	},
	{
		additionalProperties: true,
		description: "Configuration details for a supported OAuth Flow.",
	},
);

export type OAuthFlow = Static<typeof OAuthFlowSchema>;
