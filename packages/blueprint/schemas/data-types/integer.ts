import { z } from "zod";
import { BaseSchemaProperties } from "./base";

// Integer schema - extends base with integer-specific properties
export const IntegerSchema = BaseSchemaProperties.extend({
	type: z.literal("integer").optional(),
	format: z.string().optional(),
	multipleOf: z.number().optional(),
	minimum: z.number().optional(),
	maximum: z.number().optional(),
	exclusiveMinimum: z.union([z.number(), z.boolean()]).optional(),
	exclusiveMaximum: z.union([z.number(), z.boolean()]).optional(),
}).describe("Integer schema type");
