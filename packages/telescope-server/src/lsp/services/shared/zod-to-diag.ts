import type { Diagnostic } from "@volar/language-server";
import { closest } from "fastest-levenshtein";
import type { z } from "zod/v4";
import type { Range } from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";

// ============================================================================
// Zod v4 Issue Type Definition
// ============================================================================

/**
 * Complete Zod v4 error issue structure.
 * Based on actual Zod v4 error output.
 */
interface ZodIssue {
	/** The error code identifying the type of error */
	code: string;
	/** The error message */
	message: string;
	/** Path to the error location in the data */
	path: (string | number)[];

	// Type errors (invalid_type)
	/** Expected type for type errors */
	expected?: string;

	// Size constraint errors (too_small, too_big)
	/** Minimum value/length */
	minimum?: number;
	/** Maximum value/length */
	maximum?: number;
	/** Whether the constraint is inclusive */
	inclusive?: boolean;
	/** Origin type (e.g., "number", "string", "array") */
	origin?: string;

	// Value errors (invalid_value - used for enums and literals)
	/** Expected values for enum/literal errors */
	values?: unknown[];

	// Format errors (invalid_format)
	/** Format name (e.g., "email", "url", "uuid") */
	format?: string;

	// Unrecognized keys (unrecognized_keys)
	/** List of unrecognized keys */
	keys?: string[];

	// Union errors (invalid_union)
	/** Nested errors from each union variant (array of arrays) */
	errors?: ZodIssue[][];
	/** Discriminator field name for discriminated unions */
	discriminator?: string;
	/** Additional note (e.g., "No matching discriminator") */
	note?: string;
}

// ============================================================================
// Main Conversion Function
// ============================================================================

/**
 * Convert Zod validation errors into Volar diagnostics using DataVirtualCode.
 *
 * @param schema - The Zod schema that was used for validation
 * @param value - The value that was validated
 * @param virtualCode - The DataVirtualCode containing the parsed document
 * @param source - Optional source identifier for the diagnostics (default: "zod-schema")
 * @returns Array of Volar Diagnostic objects with proper ranges and messages
 */
export function zodErrorsToDiagnostics(
	schema: z.ZodType,
	value: unknown,
	virtualCode: DataVirtualCode,
	source: string = "zod-schema",
): Diagnostic[] {
	const result = schema.safeParse(value);
	if (result.success) {
		return [];
	}

	const issues = result.error.issues as ZodIssue[];
	return processIssues(issues, virtualCode, source, schema);
}

/**
 * Process a list of Zod issues into diagnostics.
 */
function processIssues(
	issues: ZodIssue[],
	virtualCode: DataVirtualCode,
	source: string,
	schema: z.ZodType,
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const defaultRange: Range = {
		start: { line: 0, character: 0 },
		end: { line: 0, character: 0 },
	};

	for (const issue of issues) {
		// For union errors, try to extract a more specific error
		const effectiveIssue = issue.code === "invalid_union"
			? extractBestUnionError(issue) ?? issue
			: issue;

		const path = effectiveIssue.path;
		const range = getErrorRange(effectiveIssue, virtualCode, defaultRange);
		const message = formatErrorMessage(effectiveIssue, path, range === defaultRange, schema);

		diagnostics.push({
			range,
			message,
			severity: DiagnosticSeverity.Error,
			source,
			code: getErrorCode(effectiveIssue),
		});
	}

	return diagnostics;
}

// Keep the old name as an alias for backward compatibility
export const typeboxErrorsToDiagnostics = zodErrorsToDiagnostics;

// ============================================================================
// Range Resolution
// ============================================================================

/**
 * Get the appropriate range for an error based on its type.
 * Different error types should highlight different parts of the document.
 */
function getErrorRange(
	issue: ZodIssue,
	virtualCode: DataVirtualCode,
	defaultRange: Range,
): Range {
	const path = issue.path;

	switch (issue.code) {
		case "unrecognized_keys": {
			// Highlight just the unrecognized key name, not its value
			// Path already points to the key (e.g., ['yo'] for yo: yo)
			const keyRange = virtualCode.getKeyRange(path);
			if (keyRange) return keyRange;
			// Fallback to full range
			return virtualCode.getRange(path) ?? defaultRange;
		}

		case "invalid_type": {
			// For missing required fields (received: undefined), highlight parent's first key
			if (issue.expected && !issue.message.includes("received")) {
				// This is a missing field - highlight where it should be
				const parentPath = path.slice(0, -1);
				return (
					virtualCode.getFirstKeyRange(parentPath) ??
					virtualCode.getFirstKeyRange([]) ??
					virtualCode.getRange(parentPath) ??
					defaultRange
				);
			}
			// For type mismatches, highlight the value
			return virtualCode.getRange(path) ?? defaultRange;
		}

		case "invalid_union": {
			// For discriminated union errors, highlight the discriminator field
			if (issue.discriminator && path.length > 0) {
				const discriminatorPath = [...path.slice(0, -1), issue.discriminator];
				return (
					virtualCode.getRange(discriminatorPath) ??
					virtualCode.getRange(path) ??
					defaultRange
				);
			}
			// For regular unions, highlight the whole value
			return virtualCode.getRange(path) ?? defaultRange;
		}

		case "invalid_value": {
			// Highlight the value that has the wrong enum/literal value
			return virtualCode.getRange(path) ?? defaultRange;
		}

		case "invalid_format": {
			// Highlight the malformed value
			return virtualCode.getRange(path) ?? defaultRange;
		}

		case "too_small":
		case "too_big": {
			// Highlight the value that violates the constraint
			return virtualCode.getRange(path) ?? defaultRange;
		}

		default: {
			// Default: try the path, then fall back
			return (
				virtualCode.getRange(path) ??
				(path.length > 0 ? virtualCode.getRange(path.slice(0, -1)) : null) ??
				virtualCode.getRange([]) ??
				defaultRange
			);
		}
	}
}

// ============================================================================
// Union Error Extraction
// ============================================================================

/**
 * Extract the most actionable error from a union validation failure.
 * Zod v4 union errors have an `errors` array (array of arrays, one per variant).
 */
function extractBestUnionError(issue: ZodIssue): ZodIssue | null {
	// For discriminated unions with a clear message, use it directly
	if (issue.discriminator && issue.note) {
		return issue;
	}

	if (!issue.errors || issue.errors.length === 0) {
		return null;
	}

	// Flatten all errors from all union variants
	const allErrors = issue.errors.flat();
	if (allErrors.length === 0) {
		return null;
	}

	// Priority order for specificity:
	// 1. unrecognized_keys - User added an unknown field
	const unrecognized = allErrors.find((e) => e.code === "unrecognized_keys");
	if (unrecognized) return unrecognized;

	// 2. invalid_format - Clear format validation failure (email, url, etc.)
	const formatError = allErrors.find((e) => e.code === "invalid_format");
	if (formatError) return formatError;

	// 3. invalid_value - Wrong enum/literal value (not undefined)
	const valueError = allErrors.find(
		(e) => e.code === "invalid_value" && e.values && e.values.length > 0,
	);
	if (valueError) return valueError;

	// 4. invalid_type with actual type mismatch (not just missing)
	const typeError = allErrors.find(
		(e) =>
			e.code === "invalid_type" &&
			e.expected &&
			!e.message.includes("undefined"),
	);
	if (typeError) return typeError;

	// 5. custom errors (from superRefine) with meaningful messages
	const customError = allErrors.find(
		(e) =>
			e.code === "custom" &&
			e.message &&
			!e.message.includes("Invalid input"),
	);
	if (customError) return customError;

	// 6. Any error with a non-generic message
	const specificError = allErrors.find(
		(e) =>
			e.message &&
			!e.message.includes("Invalid input") &&
			!e.message.includes("Invalid union"),
	);
	if (specificError) return specificError;

	// Last resort: first error
	return allErrors[0] ?? null;
}

// ============================================================================
// Message Formatting
// ============================================================================

/**
 * Format an error message, preferring Zod's native messages when they're good.
 */
function formatErrorMessage(
	issue: ZodIssue,
	path: (string | number)[],
	includePathInMessage: boolean,
	schema: z.ZodType,
): string {
	const pathSuffix = includePathInMessage ? formatPath(path) : "";
	const message = issue.message;

	switch (issue.code) {
		case "unrecognized_keys": {
			// For unrecognized keys, provide "did you mean" suggestions
			if (issue.keys && issue.keys.length > 0) {
				const key = issue.keys[0];
				const validKeys = getValidKeysFromSchema(schema, path.slice(0, -1));
				
				if (validKeys.length > 0) {
					const closest_match = closest(key, validKeys);
					return `${message}. Did you mean "${closest_match}"?${pathSuffix}`;
				}
				// Use Zod's message directly - it's already good
				return `${message}${pathSuffix}`;
			}
			return `${message}${pathSuffix}`;
		}

		case "invalid_type": {
			// Zod's message is already well-formatted:
			// "Invalid input: expected string, received number"
			// Only customize for missing required fields
			if (issue.expected && message.includes("undefined")) {
				return `Missing required field: ${issue.expected} expected${pathSuffix}`;
			}
			return `${message}${pathSuffix}`;
		}

		case "invalid_value": {
			// Zod's message is good: "Invalid option: expected one of ..."
			// or "Invalid input: expected \"value\""
			return `${message}${pathSuffix}`;
		}

		case "invalid_format": {
			// Zod's message includes the format: "Invalid email address"
			return `${message}${pathSuffix}`;
		}

		case "too_small":
		case "too_big": {
			// Zod's message is descriptive: "Too small: expected number to be >=0"
			return `${message}${pathSuffix}`;
		}

		case "invalid_union": {
			// For discriminated unions with clear info
			if (issue.discriminator && issue.note) {
				return `Invalid "${issue.discriminator}" value: no matching type found${pathSuffix}`;
			}
			// For generic unions, provide context
			if (message === "Invalid input") {
				return `Value does not match any expected type${pathSuffix}`;
			}
			return `${message}${pathSuffix}`;
		}

		case "custom": {
			// Custom errors from superRefine - use message directly
			return `${message}${pathSuffix}`;
		}

		default: {
			// For any other codes, use Zod's message
			return message ? `${message}${pathSuffix}` : `Validation error${pathSuffix}`;
		}
	}
}

/**
 * Format a path array into a readable suffix for error messages.
 */
function formatPath(path: (string | number)[]): string {
	if (path.length === 0) return "";
	if (path.length === 1) return ` (at "${path[0]}")`;
	return ` (at ${path.map((p) => String(p)).join(".")})`;
}

// ============================================================================
// Error Code Mapping
// ============================================================================

/**
 * Map Zod error codes to diagnostic codes for the LSP.
 * Uses Zod's native error codes for consistency.
 */
function getErrorCode(issue: ZodIssue): string {
	// Use Zod's native code directly - they're already descriptive
	// Only translate a few for backwards compatibility
	switch (issue.code) {
		case "unrecognized_keys":
			return "unrecognized_key"; // Singular for consistency

		default:
			// Use Zod's code directly
			return issue.code || "validation_error";
	}
}

// ============================================================================
// Schema Introspection
// ============================================================================

/**
 * Try to extract valid keys from a Zod schema at a given path.
 * Used for "did you mean" suggestions.
 */
function getValidKeysFromSchema(
	schema: z.ZodType,
	path: (string | number)[],
): string[] {
	try {
		let current: unknown = schema;

		// Navigate to the path
		for (const segment of path) {
			if (typeof segment === "string") {
				const shape = (current as { shape?: Record<string, unknown> }).shape;
				if (shape && shape[segment]) {
					current = shape[segment];
				} else {
					return [];
				}
			} else if (typeof segment === "number") {
				const element = (current as { element?: unknown }).element;
				if (element) {
					current = element;
				} else {
					return [];
				}
			}
		}

		// Extract keys from the final schema
		const shape = (current as { shape?: Record<string, unknown> }).shape;
		if (shape) {
			return Object.keys(shape);
		}
	} catch {
		// Schema structure is not accessible
	}

	return [];
}

