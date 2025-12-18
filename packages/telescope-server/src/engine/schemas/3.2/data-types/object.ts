import z from "zod";
import { SchemaObjectSchema } from "../schema";
import { BaseSchemaObjectSchema } from "./base";

export const ObjectSchemaObject = BaseSchemaObjectSchema.extend({
	type: z.literal("object"),
	get properties() {
		return z
			.record(z.string(), SchemaObjectSchema)
			.meta({ title: "properties" })
			.optional();
	},
	get additionalProperties() {
		return z
			.union([z.boolean(), SchemaObjectSchema])
			.meta({ title: "additionalProperties" })
			.optional();
	},
	patternProperties: z
		.record(z.string(), z.any())
		.meta({ title: "patternProperties" })
		.optional(),
	propertyNames: z.any().optional().meta({ title: "propertyNames" }),
	dependentSchemas: z
		.record(z.string(), z.any())
		.meta({ title: "dependentSchemas" })
		.optional(),
	dependentRequired: z
		.record(z.string(), z.array(z.string()))
		.meta({ title: "dependentRequired" })
		.optional(),
	required: z.array(z.string()).optional().meta({ title: "required" }),
	minProperties: z
		.number()
		.int()
		.min(0)
		.optional()
		.meta({ title: "minProperties" }),
	maxProperties: z
		.number()
		.int()
		.min(0)
		.optional()
		.meta({ title: "maxProperties" }),
	unevaluatedProperties: z
		.union([z.any(), z.boolean()])
		.meta({ title: "unevaluatedProperties" })
		.optional(),
}).meta({
	title: "Object Object",
	description: "An Object Object defines the shape of an object value.",
	examples: [{ type: "object", properties: { id: { type: "integer" } } }],
});

export type ObjectSchema = z.infer<typeof ObjectSchemaObject>;
