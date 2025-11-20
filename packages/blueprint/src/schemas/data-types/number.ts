import { z } from "zod";
import { BaseSchemaProperties } from "./base";

// Number schema - extends base with number-specific properties
export const NumberSchema = BaseSchemaProperties.extend({
	type: z.literal("number").optional(),
	format: z.string().optional(),
	multipleOf: z.number().optional(),
	minimum: z.number().optional(),
	maximum: z.number().optional(),
	exclusiveMinimum: z.union([z.number(), z.boolean()]).optional(),
	exclusiveMaximum: z.union([z.number(), z.boolean()]).optional(),
}).describe("Number schema type");
