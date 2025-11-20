// Base schema properties shared by all OpenAPI schemas (non-recursive properties)
import { z } from "zod";
import { SchemaObjectSchema } from "../schema";

export const BaseSchemaProperties = z
  .object({
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
    // biome-ignore lint/suspicious/noThenProperty: biome should chill out a bit
    get then() {
      return SchemaObjectSchema.optional();
    },
    get else() {
      return SchemaObjectSchema.optional();
    },

    title: z.string().optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    example: z.unknown().optional(),
    examples: z
      .array(z.unknown())
      .optional()
      .describe("Example values for this schema."),
    enum: z.array(z.unknown()).optional(),
    const: z.unknown().optional(),

    // OpenAPI extensions
    discriminator: z.unknown().optional(),
    xml: z.unknown().optional(),
    externalDocs: z.unknown().optional(),
    nullable: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    writeOnly: z.boolean().optional(),
    deprecated: z.boolean().optional(),
  })
  .describe("Base schema properties shared by all OpenAPI schemas");
