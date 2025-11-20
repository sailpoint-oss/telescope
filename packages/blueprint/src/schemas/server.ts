import { z } from "zod";
import { ExtensionsSchema } from "./extensions";

/**
 * Server Variable Object Schema
 * An object representing a Server Variable for server URL template substitution.
 */
export const ServerVariableSchema = z
	.object({
		enum: z
			.array(z.string())
			.optional()
			.describe(
				"An enumeration of string values to be used if the substitution options are from a limited set.",
			),
		default: z
			.string()
			.describe(
				"The default value to use for substitution, which SHALL be sent if an alternate value is not supplied.",
			),
		description: z
			.string()
			.optional()
			.describe("An optional description for the server variable."),
	})
	.and(ExtensionsSchema)
	.describe(
		"An object representing a Server Variable for server URL template substitution.",
	);

/**
 * Server Object Schema
 * An object representing a Server.
 */
export const ServerSchema = z
	.object({
		url: z
			.string()
			.describe(
				"A URL to the target host. This URL supports Server Variables and MAY be relative.",
			),
		description: z
			.string()
			.optional()
			.describe(
				"An optional string describing the host designated by the URL.",
			),
		variables: z
			.record(z.string(), ServerVariableSchema)
			.optional()
			.describe(
				"A map between a variable name and its value. The value is used for substitution in the server's URL template.",
			),
	})
	.and(ExtensionsSchema)
	.describe("An object representing a Server.");

export type Server = z.infer<typeof ServerSchema>;
export type ServerVariable = z.infer<typeof ServerVariableSchema>;
