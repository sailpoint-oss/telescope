import { z } from "zod";
import { ReferenceSchema } from "./reference";
import { StringSchema } from "./data-types/string";
import { NumberSchema } from "./data-types/number";
import { IntegerSchema } from "./data-types/integer";
import { BooleanSchema } from "./data-types/boolean";
import { ArraySchema } from "./data-types/array";
import { ObjectSchema } from "./data-types/object";
import { NullSchema } from "./data-types/null";

/**
 * Schema Object Schema
 * The Schema Object allows the definition of input and output data types.
 * This is based on JSON Schema Draft 2020-12.
 */
export const SchemaObjectSchema = z
	.union([
		ReferenceSchema,
		StringSchema,
		NumberSchema,
		IntegerSchema,
		BooleanSchema,
		ArraySchema,
		ObjectSchema,
		NullSchema,
	])
	.describe(
		"The Schema Object allows the definition of input and output data types.",
	);

export type SchemaObject = z.infer<typeof SchemaObjectSchema>;
