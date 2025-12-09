import { Type, type Static } from "typebox";

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
export const ExtensionsSchema = Type.Record(
	Type.String({ pattern: "^x-" }),
	Type.Unknown(),
	{
		description:
			"Map of OpenAPI extensions. Keys must start with 'x-' and can have any JSON value.",
	},
);

export type Extensions = Static<typeof ExtensionsSchema>;
