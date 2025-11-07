import { z } from "zod";
import { ResponseSchema } from "./response";

/**
 * Responses Object Schema
 * A container for the expected responses of an operation.
 */
export const ResponsesSchema = z
	.record(
		z.union([z.string().regex(/^[1-5][0-9]{2}$/), z.literal("default")]),
		ResponseSchema,
	)
	.describe("A container for the expected responses of an operation.");

export type Responses = z.infer<typeof ResponsesSchema>;
