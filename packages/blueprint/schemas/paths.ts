import { z } from "zod";
import { PathItemSchema } from "./pathItem";

/**
 * Paths Object Schema
 * Holds the relative paths to the individual endpoints.
 * The path is appended to the URL from the Server Object to construct the full URL.
 */
export const PathsSchema = z
	.record(z.string().regex(/^\//), PathItemSchema)
	.describe("Holds the relative paths to the individual endpoints.");

export type Paths = z.infer<typeof PathsSchema>;
