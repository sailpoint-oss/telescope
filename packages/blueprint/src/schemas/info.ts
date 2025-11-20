import { z } from "zod";
import { ExtensionsSchema } from "./extensions";

/**
 * Contact Object Schema
 * Contact information for the exposed API.
 */
export const ContactSchema = z
	.object({
		name: z
			.string()
			.optional()
			.describe("The identifying name of the contact person/organization."),
		url: z
			.string()
			.url()
			.optional()
			.describe("The URL pointing to the contact information."),
		email: z
			.string()
			.email()
			.optional()
			.describe("The email address of the contact person/organization."),
	})
	.and(ExtensionsSchema)
	.describe("Contact information for the exposed API.");

/**
 * License Object Schema
 * License information for the exposed API.
 */
export const LicenseSchema = z
	.object({
		name: z.string().describe("The license name used for the API."),
		identifier: z
			.string()
			.optional()
			.describe("An SPDX license expression for the API."),
		url: z
			.string()
			.url()
			.optional()
			.describe("A URL to the license used for the API."),
	})
	.and(ExtensionsSchema)
	.describe("License information for the exposed API.");

/**
 * Info Object Schema
 * The object provides metadata about the API.
 * The metadata MAY be used by tooling as required.
 */
export const InfoSchema = z
	.object({
		title: z.string().describe("The title of the API."),
		version: z.string().describe("The version of the OpenAPI document."),
		description: z
			.string()
			.optional()
			.describe("A short description of the API."),
		termsOfService: z
			.string()
			.url()
			.optional()
			.describe("A URL to the Terms of Service for the API."),
		contact: ContactSchema.optional(),
		license: LicenseSchema.optional(),
	})
	.and(ExtensionsSchema)
	.describe("The object provides metadata about the API.");

export type Info = z.infer<typeof InfoSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type License = z.infer<typeof LicenseSchema>;
