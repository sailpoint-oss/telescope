import { Type, type Static } from "typebox";

/**
 * Base fields shared by all reference types
 */
const baseRefFields = {
	summary: Type.Optional(
		Type.String({
			description:
				"A short summary which by default SHOULD override that of the referenced component.",
		}),
	),
	description: Type.Optional(
		Type.String({
			description:
				"A description which by default SHOULD override that of the referenced component.",
		}),
	),
};

/**
 * Internal Reference Schema
 * References components within the same document using JSON Pointer syntax.
 * @example #/components/schemas/User
 */
export const InternalRefSchema = Type.Object(
	{
		$ref: Type.String({
			pattern: "^#.*",
			description:
				"Internal JSON Pointer reference (e.g., #/components/schemas/User)",
		}),
		...baseRefFields,
	},
	{
		additionalProperties: false,
		description: "Internal reference using JSON Pointer syntax.",
	},
);

/**
 * URL Reference Schema
 * References components at external URLs.
 * @example https://example.com/schemas/Pet.yaml
 */
export const UrlRefSchema = Type.Object(
	{
		$ref: Type.String({
			pattern: "^https?://",
			description: "URL reference (e.g., https://example.com/schemas/Pet.yaml)",
		}),
		...baseRefFields,
	},
	{
		additionalProperties: false,
		description: "External URL reference.",
	},
);

/**
 * File Reference Schema
 * References components in external files using relative paths.
 * Covers paths with 0, 1, or 2 leading dots:
 * - ./schemas/Pet.yaml (current directory)
 * - ../common/types.yaml (parent directory)
 * - schemas/Pet.yaml (bare relative path)
 * @example ./schemas/Pet.yaml
 */
export const FileRefSchema = Type.Object(
	{
		$ref: Type.String({
			description:
				"Relative file reference (e.g., ./schemas/Pet.yaml, ../common/types.yaml, schemas/Pet.yaml)",
		}),
		...baseRefFields,
	},
	{
		additionalProperties: false,
		description: "Relative file reference.",
	},
);

/**
 * Reference Object Schema
 * A simple object to allow referencing other components in the specification.
 * Supports internal JSON Pointer references, external URL references, and relative file references.
 */
export const ReferenceSchema = Type.Union(
	[InternalRefSchema, UrlRefSchema, FileRefSchema],
	{
		description:
			"A simple object to allow referencing other components in the specification.",
	},
);

export type Reference = Static<typeof ReferenceSchema>;
export type InternalRef = Static<typeof InternalRefSchema>;
export type UrlRef = Static<typeof UrlRefSchema>;
export type FileRef = Static<typeof FileRefSchema>;
