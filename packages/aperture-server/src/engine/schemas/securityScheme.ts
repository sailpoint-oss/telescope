import { Type, type Static } from "typebox";
import { OAuthFlowsSchema } from "./oauthFlows";
import { ReferenceSchema } from "./reference";

/**
 * Security Scheme Object Schema
 * Defines a security scheme that can be used by the operations.
 */
export const SecuritySchemeSchema = Type.Union(
	[
		ReferenceSchema,
		Type.Union([
			// API Key
			Type.Object(
				{
					type: Type.Literal("apiKey"),
					name: Type.String({
						description:
							"The name of the header, query or cookie parameter to be used.",
					}),
					in: Type.Union(
						[Type.Literal("query"), Type.Literal("header"), Type.Literal("cookie")],
						{ description: "The location of the API key." },
					),
					description: Type.Optional(
						Type.String({
							description: "A short description for security scheme.",
						}),
					),
				},
				{
					additionalProperties: true,
					description: "API Key security scheme",
				},
			),
			// HTTP
			Type.Object(
				{
					type: Type.Literal("http"),
					scheme: Type.String({
						description: "The name of the HTTP Authorization scheme.",
					}),
					bearerFormat: Type.Optional(
						Type.String({
							description:
								"A hint to the client to identify how the bearer token is formatted.",
						}),
					),
					description: Type.Optional(
						Type.String({
							description: "A short description for security scheme.",
						}),
					),
				},
				{
					additionalProperties: true,
					description: "HTTP security scheme",
				},
			),
			// OAuth 2
			Type.Object(
				{
					type: Type.Literal("oauth2"),
					flows: OAuthFlowsSchema,
					description: Type.Optional(
						Type.String({
							description: "A short description for security scheme.",
						}),
					),
				},
				{
					additionalProperties: true,
					description: "OAuth2 security scheme",
				},
			),
			// OpenID Connect
			Type.Object(
				{
					type: Type.Literal("openIdConnect"),
					openIdConnectUrl: Type.String({
						format: "uri",
						description:
							"OpenID Connect URL to discover OAuth2 configuration values.",
					}),
					description: Type.Optional(
						Type.String({
							description: "A short description for security scheme.",
						}),
					),
				},
				{
					additionalProperties: true,
					description: "OpenID Connect security scheme",
				},
			),
		]),
	],
	{
		description: "Defines a security scheme that can be used by the operations.",
	},
);

export type SecurityScheme = Static<typeof SecuritySchemeSchema>;
