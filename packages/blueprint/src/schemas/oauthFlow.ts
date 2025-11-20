import { z } from "zod";
import { ExtensionsSchema } from "./extensions";

/**
 * OAuth Flow Object Schema
 * Configuration details for a supported OAuth Flow.
 */
export const OAuthFlowSchema = z
	.object({
		authorizationUrl: z
			.string()
			.url()
			.optional()
			.describe("The authorization URL to be used for this flow."),
		tokenUrl: z
			.string()
			.url()
			.optional()
			.describe("The token URL to be used for this flow."),
		refreshUrl: z
			.string()
			.url()
			.optional()
			.describe("The URL to be used for obtaining refresh tokens."),
		scopes: z
			.record(z.string(), z.string())
			.describe("The available scopes for the OAuth2 security scheme."),
	})
	.and(ExtensionsSchema)
	.describe("Configuration details for a supported OAuth Flow.");

export type OAuthFlow = z.infer<typeof OAuthFlowSchema>;
