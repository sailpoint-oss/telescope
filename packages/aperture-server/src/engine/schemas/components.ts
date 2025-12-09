import { Type, type Static } from "typebox";
import { CallbackSchema } from "./callback";
import { ExampleSchema } from "./example";
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
export const ComponentsSchema = Type.Object(
	{
		schemas: Type.Optional(
			Type.Record(Type.String(), SchemaObjectSchema, {
				description: "An object to hold reusable Schema Objects.",
			}),
		),
		responses: Type.Optional(
			Type.Record(Type.String(), ResponseSchema, {
				description: "An object to hold reusable Response Objects.",
			}),
		),
		parameters: Type.Optional(
			Type.Record(Type.String(), ParameterSchema, {
				description: "An object to hold reusable Parameter Objects.",
			}),
		),
		examples: Type.Optional(
			Type.Record(Type.String(), ExampleSchema, {
				description: "An object to hold reusable Example Objects.",
			}),
		),
		requestBodies: Type.Optional(
			Type.Record(Type.String(), RequestBodySchema, {
				description: "An object to hold reusable Request Body Objects.",
			}),
		),
		headers: Type.Optional(
			Type.Record(Type.String(), HeaderSchema, {
				description: "An object to hold reusable Header Objects.",
			}),
		),
		securitySchemes: Type.Optional(
			Type.Record(Type.String(), SecuritySchemeSchema, {
				description: "An object to hold reusable Security Scheme Objects.",
			}),
		),
		links: Type.Optional(
			Type.Record(Type.String(), LinkSchema, {
				description: "An object to hold reusable Link Objects.",
			}),
		),
		callbacks: Type.Optional(
			Type.Record(Type.String(), CallbackSchema, {
				description: "An object to hold reusable Callback Objects.",
			}),
		),
		pathItems: Type.Optional(
			Type.Record(Type.String(), PathItemSchema, {
				description: "An object to hold reusable Path Item Objects.",
			}),
		),
	},
	{
		additionalProperties: true,
		description:
			"Holds a set of reusable objects for different aspects of the OAS.",
	},
);

export type Components = Static<typeof ComponentsSchema>;
