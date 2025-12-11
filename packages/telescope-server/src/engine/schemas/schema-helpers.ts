/**
 * Schema Helpers for OpenAPI Extension Validation
 *
 * This module provides helpers to create Zod schemas that properly handle
 * OpenAPI extensions (x-* keys) while rejecting unknown non-extension keys.
 *
 * Key functions:
 * - `withExtensions(shape)` - Creates a schema allowing x-* extensions
 * - `noExtensions(shape)` - Creates a strict schema (no extensions)
 *
 * The helpers enforce extension validation at both:
 * - Zod runtime level: Using `.catchall()` with validation
 * - JSON Schema level: Using `.meta()` for `patternProperties`
 *
 * @module engine/schemas/schema-helpers
 */

import { z } from "zod";

/**
 * Pattern to match valid OpenAPI extension keys (x-* case-insensitive)
 */
const EXTENSION_KEY_PATTERN = /^x-/i;

/**
 * Result type for withExtensions - a passthrough schema with extension validation
 */
export type WithExtensionsResult<T extends z.ZodRawShape> = z.ZodObject<
	T,
	"passthrough"
>;

/**
 * Create a Zod schema that allows OpenAPI extensions (x-* keys)
 * while rejecting any other unknown keys.
 *
 * This replaces `.passthrough()` which allows ALL unknown keys.
 * With this helper:
 * - Zod runtime validation rejects non-extension unknown keys
 * - JSON Schema validation (editor) also rejects non-extension keys
 *
 * @param shape - The Zod shape object defining known properties
 * @returns A Zod object schema that allows only x-* extensions
 *
 * @example
 * ```typescript
 * const ContactSchema = withExtensions({
 *   name: z.string().optional(),
 *   email: z.string().email().optional(),
 * })
 *   .meta({ title: "Contact" })
 *   .describe("Contact information");
 *
 * // Valid:
 * ContactSchema.parse({ name: "John", "x-internal": true });
 *
 * // Invalid - non-extension unknown key:
 * ContactSchema.parse({ name: "John", foo: "bar" }); // throws
 * ```
 */
export function withExtensions<T extends z.ZodRawShape>(
	shape: T,
): WithExtensionsResult<T> {
	// Get the known keys from the shape
	const knownKeys = new Set(Object.keys(shape));

	// Create base schema and add catchall that validates extensions
	const baseSchema = z.object(shape).passthrough();

	// Wrap with superRefine to validate unknown keys are extensions
	const validated = baseSchema.superRefine((data, ctx) => {
		// Check all keys - unknown keys must be extensions
		for (const key of Object.keys(data)) {
			if (!knownKeys.has(key) && !EXTENSION_KEY_PATTERN.test(key)) {
				ctx.addIssue({
					code: z.ZodIssueCode.unrecognized_keys,
					keys: [key],
					message: `Unrecognized key "${key}". Only extension keys (x-*) are allowed.`,
					path: [key],
				});
			}
		}
	});

	// Add meta for JSON Schema output
	return validated.meta({
		additionalProperties: false,
		patternProperties: {
			"^x-": {},
		},
	}) as WithExtensionsResult<T>;
}

/**
 * Create a strict Zod schema that does not allow extensions.
 * Equivalent to `.strict()` but provided for consistency with `withExtensions`.
 *
 * Use this for objects that per OpenAPI spec should NOT have extensions,
 * such as Reference objects.
 *
 * @param shape - The Zod shape object defining known properties
 * @returns A strict Zod object schema
 *
 * @example
 * ```typescript
 * const ReferenceSchema = noExtensions({
 *   $ref: z.string(),
 *   summary: z.string().optional(),
 *   description: z.string().optional(),
 * });
 *
 * // Valid:
 * ReferenceSchema.parse({ $ref: "#/components/schemas/Pet" });
 *
 * // Invalid - no extensions allowed:
 * ReferenceSchema.parse({ $ref: "#/...", "x-internal": true }); // throws
 * ```
 */
export function noExtensions<T extends z.ZodRawShape>(
	shape: T,
): z.ZodObject<T, "strict"> {
	return z.object(shape).strict();
}

/**
 * Re-export of z.object for schemas that need passthrough behavior.
 * Use only when absolutely necessary (e.g., for schemas that represent
 * arbitrary JSON Schema objects).
 *
 * @deprecated Prefer `withExtensions` for OpenAPI objects
 */
export function withPassthrough<T extends z.ZodRawShape>(
	shape: T,
): z.ZodObject<T, "passthrough"> {
	return z.object(shape).passthrough();
}

