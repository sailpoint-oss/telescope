import { z } from "zod";

/**
 * OpenAPI Extensions Schema
 *
 * OpenAPI allows vendors to add custom properties to the specification.
 * These properties MUST have names that start with "x-" and can have any value.
 *
 * According to the OpenAPI specification:
 * - Field names MUST begin with "x-" (case-insensitive)
 * - Field names beginning with "x-oai-" and "x-oas-" are reserved
 * - Values can be any valid JSON value (string, number, boolean, object, array, null)
 */
export const ExtensionsSchema = z
	.record(
		z
			.string()
			.regex(/^x-/, "Extension field names must start with 'x-'")
			.refine(
				(key) =>
					!key.toLowerCase().startsWith("x-oai-") &&
					!key.toLowerCase().startsWith("x-oas-"),
				{
					message:
						"Extension field names beginning with 'x-oai-' or 'x-oas-' are reserved",
				},
			),
		z.unknown(),
	)
	.describe(
		"Map of OpenAPI extensions. Keys must start with 'x-' and can have any JSON value.",
	);

export type Extensions = z.infer<typeof ExtensionsSchema>;
