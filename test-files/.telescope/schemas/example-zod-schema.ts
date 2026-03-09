import { defineSchema } from "telescope-server";

export default defineSchema((z) =>
	z.object({
		name: z.string(),
		version: z.string().regex(/^\d+\.\d+\.\d+$/),
		settings: z
			.object({
				debug: z.boolean(),
				timeout: z.number().min(0).optional(),
			})
			.optional(),
	}),
);
