/**
 * Extension Schema Type Definitions
 *
 * Types for defining OpenAPI extension schemas that can be validated
 * when extensions are present in OpenAPI documents.
 */

import type { TSchema, Static } from "typebox";
import type { Type } from "typebox";

/**
 * Scopes where an extension can be applied.
 * Extensions are validated when they appear at these locations in an OpenAPI document.
 */
export type ExtensionScope =
	| "root" // OpenAPI root document
	| "info" // Info object
	| "paths" // Paths object
	| "pathItem" // Individual path items
	| "operation" // Operation objects (get, post, etc.)
	| "parameter" // Parameter objects
	| "schema" // Schema objects
	| "response" // Response objects
	| "requestBody" // Request body objects
	| "components" // Components object
	| "header" // Header objects
	| "mediaType" // Media type objects
	| "securityScheme" // Security scheme objects
	| "tag" // Tag objects
	| "server" // Server objects
	| "any"; // Any location (use with caution)

/**
 * Metadata for defining an OpenAPI extension schema.
 *
 * Note: Required extensions are configured via the telescope config file,
 * not in the extension metadata itself. This allows users to mark any
 * extension (builtin or custom) as required.
 *
 * @example
 * ```typescript
 * const myExtension: ExtensionSchemaMeta = {
 *   name: "x-company-auth",
 *   scope: ["operation"],
 *   description: "Authentication level required for this operation",
 *   url: "https://company.com/docs/extensions",
 *   schema: (Type) => Type.Union([
 *     Type.Literal("public"),
 *     Type.Literal("authenticated"),
 *     Type.Literal("admin")
 *   ])
 * };
 * ```
 */
export interface ExtensionSchemaMeta {
	/**
	 * The extension name (must start with "x-").
	 * @example "x-speakeasy-entity", "x-company-auth"
	 */
	name: string;

	/**
	 * Scopes where this extension is valid.
	 * The extension will only be validated when it appears at these locations.
	 */
	scope: ExtensionScope[];

	/**
	 * Human-readable description of the extension's purpose.
	 */
	description: string;

	/**
	 * Optional URL to documentation for this extension.
	 */
	url?: string;

	/**
	 * Callback function that receives the TypeBox Type builder and returns the schema.
	 * Using a callback eliminates the need for users to install typebox separately.
	 *
	 * @param Type - The TypeBox Type builder
	 * @returns A TypeBox schema that validates the extension value
	 *
	 * @example
	 * ```typescript
	 * schema: (Type) => Type.Object({
	 *   level: Type.Union([Type.Literal("public"), Type.Literal("private")]),
	 *   roles: Type.Optional(Type.Array(Type.String()))
	 * })
	 * ```
	 */
	schema: (t: typeof Type) => TSchema;
}

/**
 * Compiled extension with the schema already built.
 * Used internally after loading and compiling extension definitions.
 */
export interface CompiledExtension {
	name: string;
	scope: ExtensionScope[];
	description: string;
	url?: string;
	compiledSchema: TSchema;
}

/**
 * Registry of extensions grouped by scope for efficient lookup.
 */
export type ExtensionRegistry = {
	[K in ExtensionScope]: CompiledExtension[];
};

/**
 * Validation error from TypeBox Value.Errors()
 */
export interface ExtensionValidationError {
	path: string;
	message: string;
	value: unknown;
}
