import { defineSchema } from "lens";
import { z } from "zod";

export default defineSchema(
	z.object({
		name: z.string().describe("The name of the configuration"),
		version: z
			.string()
			.regex(/^\d+\.\d+\.\d+$/)
			.describe("The version of the configuration"),
		settings: z
			.object({
				debug: z.boolean(),
				timeout: z.number().min(0).optional(),
			})
			.optional(),
	}),
);
