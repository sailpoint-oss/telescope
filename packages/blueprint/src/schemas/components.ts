import { z } from "zod";
import { CallbackSchema } from "./callback";
import { ExampleSchema } from "./example";
import { ExtensionsSchema } from "./extensions";
import { HeaderSchema } from "./header";
import { LinkSchema } from "./link";
import { ParameterSchema } from "./parameter";
import { PathItemSchema } from "./pathItem";
import { RequestBodySchema } from "./requestBody";
import { ResponseSchema } from "./response";
import { SchemaObjectSchema } from "./schema";
import { SecuritySchemeSchema } from "./securityScheme";

/**
 * Components Object Schema
 * Holds a set of reusable objects for different aspects of the OAS.
 */
export const ComponentsSchema = z
  .object({
    get schemas() {
      return z
        .record(z.string(), SchemaObjectSchema)
        .optional()
        .describe("An object to hold reusable Schema Objects.");
    },
    get responses() {
      return z
        .record(z.string(), ResponseSchema)
        .optional()
        .describe("An object to hold reusable Response Objects.");
    },
    get parameters() {
      return z
        .record(z.string(), ParameterSchema)
        .optional()
        .describe("An object to hold reusable Parameter Objects.");
    },
    examples: z
      .record(z.string(), ExampleSchema)
      .optional()
      .describe("An object to hold reusable Example Objects."),
    get requestBodies() {
      return z
        .record(z.string(), RequestBodySchema)
        .optional()
        .describe("An object to hold reusable Request Body Objects.");
    },
    headers: z
      .record(z.string(), HeaderSchema)
      .optional()
      .describe("An object to hold reusable Header Objects."),
    securitySchemes: z
      .record(z.string(), SecuritySchemeSchema)
      .optional()
      .describe("An object to hold reusable Security Scheme Objects."),
    links: z
      .record(z.string(), LinkSchema)
      .optional()
      .describe("An object to hold reusable Link Objects."),
    get callbacks() {
      return z
        .record(z.string(), CallbackSchema)
        .optional()
        .describe("An object to hold reusable Callback Objects.");
    },
    get pathItems() {
      return z
        .record(z.string(), PathItemSchema)
        .optional()
        .describe("An object to hold reusable Path Item Objects.");
    },
  })
  .extend(ExtensionsSchema)
  .describe(
    "Holds a set of reusable objects for different aspects of the OAS."
  );

export type Components = z.infer<typeof ComponentsSchema>;
