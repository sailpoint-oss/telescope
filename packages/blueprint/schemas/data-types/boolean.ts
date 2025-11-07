import { z } from "zod";
import { SchemaObjectSchema } from "../schema";
import { BaseSchemaProperties } from "./base";

// Boolean schema - extends base (minimal additional properties)
export const BooleanSchema = BaseSchemaProperties.extend({
	type: z.literal("boolean").optional(),
}).describe("Boolean schema type");
