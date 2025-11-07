import { z } from "zod";
import { SchemaObjectSchema } from "./schema";
import { ExampleSchema } from "./example";
import { MediaTypeSchema } from "./mediaType";
import { ExtensionsSchema } from "./extensions";

/**
 * Parameter Object Schema
 * Describes a single operation parameter.
 */
export const ParameterSchema = z
	.object({
		name: z.string().describe("The name of the parameter."),
		in: z
			.enum(["query", "header", "path", "cookie"])
			.describe("The location of the parameter."),
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
			.enum([
				"matrix",
				"label",
				"form",
				"simple",
				"spaceDelimited",
				"pipeDelimited",
				"deepObject",
			])
			.optional()
			.describe(
				"Describes how the parameter value will be serialized depending on the type of the parameter value.",
			),
		explode: z
			.boolean()
			.optional()
			.describe(
				"When this is true, parameter values of type array or object generate separate parameters for each value of the array or key-value pair of the map.",
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
			.record(z.string(), MediaTypeSchema)
			.optional()
			.describe("A map containing the representations for the parameter."),
	})
	.and(ExtensionsSchema)
	.describe("Describes a single operation parameter.");

export type Parameter = z.infer<typeof ParameterSchema>;
