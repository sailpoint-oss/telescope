import { z } from "zod";
import { OAuthFlowsSchema } from "./oauthFlows";
import { ReferenceSchema } from "./reference";
import { ExtensionsSchema } from "./extensions";

/**
 * Security Scheme Object Schema
 * Defines a security scheme that can be used by the operations.
 */
export const SecuritySchemeSchema = z.union([
	ReferenceSchema,
	z.union([
		// API Key
		z
			.object({
				type: z.literal("apiKey"),
				name: z
					.string()
					.describe(
						"The name of the header, query or cookie parameter to be used.",
					),
				in: z
					.enum(["query", "header", "cookie"])
					.describe("The location of the API key."),
				description: z
					.string()
					.optional()
					.describe("A short description for security scheme."),
			})
			.and(ExtensionsSchema)
			.describe("API Key security scheme"),
		// HTTP
		z
			.object({
				type: z.literal("http"),
				scheme: z
					.string()
					.describe("The name of the HTTP Authorization scheme."),
				bearerFormat: z
					.string()
					.optional()
					.describe(
						"A hint to the client to identify how the bearer token is formatted.",
					),
				description: z
					.string()
					.optional()
					.describe("A short description for security scheme."),
			})
			.and(ExtensionsSchema)
			.describe("HTTP security scheme"),
		// OAuth 2
		z
			.object({
				type: z.literal("oauth2"),
				flows: OAuthFlowsSchema,
				description: z
					.string()
					.optional()
					.describe("A short description for security scheme."),
			})
			.and(ExtensionsSchema)
			.describe("OAuth2 security scheme"),
		// OpenID Connect
		z
			.object({
				type: z.literal("openIdConnect"),
				openIdConnectUrl: z
					.string()
					.url()
					.describe(
						"OpenID Connect URL to discover OAuth2 configuration values.",
					),
				description: z
					.string()
					.optional()
					.describe("A short description for security scheme."),
			})
			.and(ExtensionsSchema)
			.describe("OpenID Connect security scheme"),
	]),
]);

export type SecurityScheme = z.infer<typeof SecuritySchemeSchema>;
