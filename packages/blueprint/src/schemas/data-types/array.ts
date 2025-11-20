import { z } from "zod";
import { SchemaObjectSchema } from "../schema";
import { BaseSchemaProperties } from "./base";

// Array schema - extends base with array-specific properties
export const ArraySchema = BaseSchemaProperties.extend({
	type: z.literal("array").optional(),
	get items() {
		return z
			.union([SchemaObjectSchema, z.array(SchemaObjectSchema)])
			.optional();
	},
	get additionalItems() {
		return z.union([SchemaObjectSchema, z.boolean()]).optional();
	},
	minItems: z.number().int().min(0).optional(),
	maxItems: z.number().int().min(0).optional(),
	uniqueItems: z.boolean().optional(),
	get allOf() {
		return z.array(SchemaObjectSchema).optional();
	},
	get oneOf() {
		return z.array(SchemaObjectSchema).optional();
	},
	get anyOf() {
		return z.array(SchemaObjectSchema).optional();
	},
	get not() {
		return SchemaObjectSchema.optional();
	},
	get if() {
		return SchemaObjectSchema.optional();
	},
	get then() {
		return SchemaObjectSchema.optional();
	},
	get else() {
		return SchemaObjectSchema.optional();
	},
}).describe("Array schema type");
