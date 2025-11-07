import { z } from "zod";
import { SchemaObjectSchema } from "./schema";
import { ResponseSchema } from "./response";
import { ParameterSchema } from "./parameter";
import { ExampleSchema } from "./example";
import { RequestBodySchema } from "./requestBody";
import { HeaderSchema } from "./header";
import { SecuritySchemeSchema } from "./securityScheme";
import { LinkSchema } from "./link";
import { CallbackSchema } from "./callback";
import { PathItemSchema } from "./pathItem";
import { ExtensionsSchema } from "./extensions";

/**
 * Components Object Schema
 * Holds a set of reusable objects for different aspects of the OAS.
 */
export const ComponentsSchema = z
	.object({
		schemas: z
			.record(z.string(), SchemaObjectSchema)
			.optional()
			.describe("An object to hold reusable Schema Objects."),
		responses: z
			.record(z.string(), ResponseSchema)
			.optional()
			.describe("An object to hold reusable Response Objects."),
		parameters: z
			.record(z.string(), ParameterSchema)
			.optional()
			.describe("An object to hold reusable Parameter Objects."),
		examples: z
			.record(z.string(), ExampleSchema)
			.optional()
			.describe("An object to hold reusable Example Objects."),
		requestBodies: z
			.record(z.string(), RequestBodySchema)
			.optional()
			.describe("An object to hold reusable Request Body Objects."),
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
		callbacks: z
			.record(z.string(), CallbackSchema)
			.optional()
			.describe("An object to hold reusable Callback Objects."),
		pathItems: z
			.record(z.string(), PathItemSchema)
			.optional()
			.describe("An object to hold reusable Path Item Objects."),
	})
	.and(ExtensionsSchema)
	.describe(
		"Holds a set of reusable objects for different aspects of the OAS.",
	);

export type Components = z.infer<typeof ComponentsSchema>;
