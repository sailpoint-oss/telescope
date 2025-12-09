import { Type, type Static } from "typebox";

/**
 * Contact Object Schema
 * Contact information for the exposed API.
 */
export const ContactSchema = Type.Object(
	{
		name: Type.Optional(
			Type.String({
				description: "The identifying name of the contact person/organization.",
			}),
		),
		url: Type.Optional(
			Type.String({
				format: "uri",
				description: "The URL pointing to the contact information.",
			}),
		),
		email: Type.Optional(
			Type.String({
				format: "email",
				description: "The email address of the contact person/organization.",
			}),
		),
	},
	{
		additionalProperties: true,
		description: "Contact information for the exposed API.",
	},
);

/**
 * License Object Schema
 * License information for the exposed API.
 */
export const LicenseSchema = Type.Object(
	{
		name: Type.String({ description: "The license name used for the API." }),
		identifier: Type.Optional(
			Type.String({ description: "An SPDX license expression for the API." }),
		),
		url: Type.Optional(
			Type.String({
				format: "uri",
				description: "A URL to the license used for the API.",
			}),
		),
	},
	{
		additionalProperties: true,
		description: "License information for the exposed API.",
	},
);

/**
 * Info Object Schema
 * The object provides metadata about the API.
 * The metadata MAY be used by tooling as required.
 */
export const InfoSchema = Type.Object(
	{
		title: Type.String({ description: "The title of the API." }),
		version: Type.String({ description: "The version of the OpenAPI document." }),
		description: Type.Optional(
			Type.String({ description: "A short description of the API." }),
		),
		termsOfService: Type.Optional(
			Type.String({
				format: "uri",
				description: "A URL to the Terms of Service for the API.",
			}),
		),
		contact: Type.Optional(ContactSchema),
		license: Type.Optional(LicenseSchema),
	},
	{
		additionalProperties: true,
		description: "The object provides metadata about the API.",
	},
);

export type Info = Static<typeof InfoSchema>;
export type Contact = Static<typeof ContactSchema>;
export type License = Static<typeof LicenseSchema>;
