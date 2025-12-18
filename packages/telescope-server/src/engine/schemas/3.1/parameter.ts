import z from "zod";
import { ParameterLocationSchema, ParameterStyleSchema } from "../data-types";
import { ReferenceObjectSchema } from "../openapi-base";
import { ExampleSchema } from "./example";
import { MediaTypeObjectSchema } from "./media-type";
import { SchemaObjectSchema } from "./schema";

export const ParameterObjectSchema = z
	.strictObject({
		name: z
			.string()
			.meta({
				title: "name",
				examples: [
					"id",
					"page",
					"limit",
					"Authorization",
					"X-Request-ID",
					"status",
				],
			})
			.describe("The name of the parameter. Case-sensitive."),
		in: ParameterLocationSchema.describe(
			"Location of the parameter. 'path' parameters must have required=true.",
		),
		description: z
			.string()
			.meta({
				title: "description",
				examples: [
					"Unique identifier",
					"Page number for pagination",
					"Maximum items to return",
				],
			})
			.describe(
				"A description of the parameter. CommonMark syntax MAY be used.",
			)
			.optional(),
		required: z
			.boolean()
			.optional()
			.default(false)
			.describe("Whether the parameter is required.")
			.meta({ title: "required", examples: [true, false] }),
		deprecated: z
			.boolean()
			.optional()
			.default(false)
			.describe("Marks the parameter as deprecated.")
			.meta({ title: "deprecated", examples: [true] }),
		allowEmptyValue: z
			.boolean()
			.optional()
			.default(false)
			.describe("For query parameters only. Allows empty values (?param=).")
			.meta({ title: "allowEmptyValue", examples: [true] }),
		style: ParameterStyleSchema.describe(
			"Serialization style. Defaults vary by 'in': query/cookie='form', path/header='simple'.",
		).optional(),
		explode: z
			.boolean()
			.meta({ title: "explode", examples: [true, false] })
			.describe(
				"For arrays/objects. When true, each value gets its own parameter.",
			)
			.optional(),
		allowReserved: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"For query parameters. When true, allows reserved characters without encoding.",
			)
			.meta({ title: "allowReserved", examples: [true] }),
		schema: SchemaObjectSchema.optional().meta({ title: "schema" }),
		example: z
			.unknown()
			.meta({ title: "example", examples: [123, "abc", ["a", "b"]] })
			.describe("Example value. Mutually exclusive with 'examples'.")
			.optional(),
		examples: z
			.record(z.string(), ExampleSchema)
			.meta({ title: "examples" })
			.describe("Multiple named examples. Mutually exclusive with 'example'.")
			.optional(),
		content: z
			.record(z.string(), MediaTypeObjectSchema)
			.meta({ title: "content" })
			.describe("For complex parameters. Mutually exclusive with 'schema'.")
			.optional(),
	})
	.meta({
		title: "Parameter",
		description: "Describes a single operation parameter.",
		examples: [
			{ name: "id", in: "path", required: true, schema: { type: "integer" } },
		],
	});

export const ParameterSchema = z
	.union([ReferenceObjectSchema, ParameterObjectSchema])
	.meta({
		title: "Parameter",
		description: "Describes a single operation parameter.",
	});

export type ParameterObject = z.infer<typeof ParameterObjectSchema>;
export type Parameter = z.infer<typeof ParameterSchema>;
