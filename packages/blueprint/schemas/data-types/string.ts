import { z } from "zod";
import { SchemaObjectSchema } from "../schema";
import { BaseSchemaProperties } from "./base";

export const StringSchema = BaseSchemaProperties.extend({
	type: z.literal("string").optional(),
	format: z.string().optional(),
	pattern: z.string().optional(),
	minLength: z.number().int().min(0).optional(),
	maxLength: z.number().int().min(0).optional(),
}).describe("String schema type");
