import { z } from "zod";
import { SchemaObjectSchema } from "./schema";
import { ExampleSchema } from "./example";
import { ReferenceSchema } from "./reference";
import { ExtensionsSchema } from "./extensions";

/**
 * Header Object Schema
 * The Header Object follows the structure of the Parameter Object.
 */
export const HeaderSchema = z.union([
	ReferenceSchema,
	z
		.object({
			description: z
				.string()
				.optional()
				.describe("A brief description of the parameter."),
			required: z
				.boolean()
				.default(false)
				.optional()
				.describe("Determines whether this parameter is mandatory."),
			deprecated: z
				.boolean()
				.default(false)
				.optional()
				.describe("Specifies that a parameter is deprecated."),
			allowEmptyValue: z
				.boolean()
				.default(false)
				.optional()
				.describe("Sets the ability to pass empty-valued parameters."),
			style: z
				.enum(["simple"])
				.optional()
				.describe("Describes how the parameter value will be serialized."),
			explode: z
				.boolean()
				.optional()
				.describe(
					"When this is true, parameter values of type array or object generate separate parameters for each value.",
				),
			allowReserved: z
				.boolean()
				.default(false)
				.optional()
				.describe(
					"Determines whether the parameter value SHOULD allow reserved characters.",
				),
			schema: SchemaObjectSchema.optional(),
			example: z.unknown().optional(),
			examples: z
				.record(z.string(), ExampleSchema)
				.optional()
				.describe("Examples of the parameter's potential value."),
			content: z
				.record(z.string(), z.any())
				.optional()
				.describe("A map containing the representations for the parameter."),
		})
		.and(ExtensionsSchema)
		.describe(
			"The Header Object follows the structure of the Parameter Object.",
		),
]);

export type Header = z.infer<typeof HeaderSchema>;
