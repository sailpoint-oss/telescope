import { z } from "zod";
import { ArraySchema } from "./data-types/array";
import { BooleanSchema } from "./data-types/boolean";
import { IntegerSchema } from "./data-types/integer";
import { NullSchema } from "./data-types/null";
import { NumberSchema } from "./data-types/number";
import { ObjectSchema } from "./data-types/object";
import { StringSchema } from "./data-types/string";
import { ReferenceSchema } from "./reference";

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
