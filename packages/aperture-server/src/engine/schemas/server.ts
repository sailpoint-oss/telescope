import { Type, type Static } from "typebox";

/**
 * Server Variable Object Schema
 * An object representing a Server Variable for server URL template substitution.
 */
export const ServerVariableSchema = Type.Object(
	{
		enum: Type.Optional(
			Type.Array(Type.String(), {
				description:
					"An enumeration of string values to be used if the substitution options are from a limited set.",
			}),
		),
		default: Type.String({
			description:
				"The default value to use for substitution, which SHALL be sent if an alternate value is not supplied.",
		}),
		description: Type.Optional(
			Type.String({
				description: "An optional description for the server variable.",
			}),
		),
	},
	{
		additionalProperties: true,
		description:
			"An object representing a Server Variable for server URL template substitution.",
	},
);

/**
 * Server Object Schema
 * An object representing a Server.
 */
export const ServerSchema = Type.Object(
	{
		url: Type.String({
			description:
				"A URL to the target host. This URL supports Server Variables and MAY be relative.",
		}),
		description: Type.Optional(
			Type.String({
				description:
					"An optional string describing the host designated by the URL.",
			}),
		),
		variables: Type.Optional(
			Type.Record(Type.String(), ServerVariableSchema, {
				description:
					"A map between a variable name and its value. The value is used for substitution in the server's URL template.",
			}),
		),
	},
	{
		additionalProperties: true,
		description: "An object representing a Server.",
	},
);

export type Server = Static<typeof ServerSchema>;
export type ServerVariable = Static<typeof ServerVariableSchema>;
