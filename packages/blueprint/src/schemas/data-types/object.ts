import { z } from "zod";
import { SchemaObjectSchema } from "../schema";
import { BaseSchemaProperties } from "./base";

// Object schema - extends base with object-specific properties
export const ObjectSchema = z
  .object({
    type: z.literal("object").optional(),
    get properties() {
      return z.record(z.string(), SchemaObjectSchema).optional();
    },
    get additionalProperties() {
      return z.union([SchemaObjectSchema, z.boolean()]).optional();
    },
    get patternProperties() {
      return z.record(z.string(), SchemaObjectSchema).optional();
    },
    get dependentSchemas() {
      return z.record(z.string(), SchemaObjectSchema).optional();
    },
    required: z.array(z.string()).optional(),
    minProperties: z.number().int().min(0).optional(),
    maxProperties: z.number().int().min(0).optional(),
  })
  .extend(BaseSchemaProperties)
  .describe("Object schema type");
