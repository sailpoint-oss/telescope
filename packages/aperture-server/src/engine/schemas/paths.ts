import { Type, type Static } from "typebox";
import { PathItemSchema } from "./pathItem";

/**
 * Paths Object Schema
 * Holds the relative paths to the individual endpoints.
 * The path is appended to the URL from the Server Object to construct the full URL.
 */
export const PathsSchema = Type.Record(
	Type.String({ pattern: "^/" }),
	PathItemSchema,
	{
		description: "Holds the relative paths to the individual endpoints.",
	},
);

export type Paths = Static<typeof PathsSchema>;
