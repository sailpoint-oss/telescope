import { z } from "zod";
import { BaseSchemaProperties } from "./base";

// Null schema - extends base (minimal additional properties)
export const NullSchema = BaseSchemaProperties.extend({
	type: z.literal("null").optional(),
}).describe("Null schema type");
