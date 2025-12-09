import { Type, type Static } from "typebox";

/**
 * Discriminator Object Schema
 * When request bodies or response payloads may be one of a number of different schemas,
 * a discriminator object can be used to aid in serialization, deserialization, and validation.
 */
export const DiscriminatorSchema = Type.Object(
	{
		propertyName: Type.String({
			description:
				"The name of the property in the payload that will hold the discriminator value.",
		}),
		mapping: Type.Optional(
			Type.Record(Type.String(), Type.String(), {
				description:
					"An object to hold mappings between payload values and schema names or references.",
			}),
		),
	},
	{
		additionalProperties: true,
		description:
			"When request bodies or response payloads may be one of a number of different schemas, a discriminator object can be used to aid in serialization, deserialization, and validation.",
	},
);

export type Discriminator = Static<typeof DiscriminatorSchema>;
