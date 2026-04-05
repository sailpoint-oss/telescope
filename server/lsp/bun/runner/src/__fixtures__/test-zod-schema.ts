import { z } from "zod";

const schema = z.object({
	name: z.string().min(1),
	version: z.string().regex(/^\d+\.\d+\.\d+$/),
	description: z.string().optional(),
});

export default schema;
