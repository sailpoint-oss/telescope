import type { Diagnostic } from "@volar/language-server";
import { closest } from "fastest-levenshtein";
import type { z } from "zod/v4";
import type { Range } from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";

/**
 * A Zod error issue from safeParse result.
 */
interface ZodIssue {
	code: string;
	message: string;
	path: (string | number)[];
	expected?: string;
	received?: string;
}

/**
 * Convert Zod validation errors into Volar diagnostics using DataVirtualCode.
 * This is the preferred method as it works with both YAML and JSON documents
 * and uses the unified getRange() abstraction.
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
	const diagnostics: Diagnostic[] = [];

	const defaultRange: Range = {
		start: { line: 0, character: 0 },
		end: { line: 0, character: 0 },
	};

	// Use safeParse to get errors without throwing
	const result = schema.safeParse(value);
	if (result.success) {
		return [];
	}

	// Zod v4 errors are in result.error.issues
	const issues = result.error.issues as ZodIssue[];

	for (const issue of issues) {
		const path = issue.path;

		// Try to get the range for this path
		let range = virtualCode.getRange(path);
		let forceIncludePath = false;

		// Special handling for missing values
		if (
			(issue.code === "invalid_type" && issue.received === "undefined") ||
			issue.message.includes("Required")
		) {
			// Try parent path - get the first key's label to avoid highlighting entire object
			const parentPath = path.slice(0, -1);
			range = virtualCode.getFirstKeyRange(parentPath);

			// If no first key range, try the document root's first key
			if (!range) {
				range = virtualCode.getFirstKeyRange([]);
			}

			// Fall back to parent range, then root range, then default
			if (!range) {
				range =
					virtualCode.getRange(parentPath) ??
					virtualCode.getRange([]) ??
					defaultRange;
			}

			// Always include path in message when range is imprecise
			forceIncludePath = true;
		}

		// Special handling for unrecognized keys
		if (issue.code === "unrecognized_keys") {
			// Get valid keys for suggestions
			const validKeys = getValidKeysFromSchema(schema, path.slice(0, -1));

			const lastKey = path[path.length - 1];
			if (typeof lastKey === "string" && validKeys.length > 0) {
				const match = closest(lastKey, validKeys);
				const suggestion = `. Did you mean "${match}"?`;

				diagnostics.push({
					range: range ?? defaultRange,
					message: `Unrecognized key: "${lastKey}"${suggestion}`,
					severity: DiagnosticSeverity.Error,
					source,
					code: "unrecognized_key",
				});
				continue;
			}
		}

		// Use the range we found, or fall back to document start
		diagnostics.push({
			range: range ?? defaultRange,
			message: formatZodErrorMessage(issue, path, forceIncludePath || !range),
			severity: DiagnosticSeverity.Error,
			source,
			code: getErrorCode(issue),
		});
	}

	return diagnostics;
}

// Keep the old name as an alias for backward compatibility
export const typeboxErrorsToDiagnostics = zodErrorsToDiagnostics;

/**
 * Format a Zod error into a user-friendly diagnostic message.
 */
function formatZodErrorMessage(
	issue: ZodIssue,
	path: (string | number)[],
	includePath: boolean,
): string {
	// Format path - show "root" for fields at the root level, otherwise show the full path
	let pathStr = "";
	if (includePath && path.length > 0) {
		if (path.length === 1) {
			// Single element path means it's at the root level
			pathStr = ` "${path[0]}" at root`;
		} else {
			// Nested path
			pathStr = ` at "${path.map((p) => String(p)).join(".")}"`;
		}
	}

	const message = issue.message;
	const code = issue.code;

	// Handle specific Zod error codes
	switch (code) {
		case "invalid_type":
			if (issue.received === "undefined") {
				return `Missing required field${pathStr}`;
			}
			return `Expected ${issue.expected}, received ${issue.received}${pathStr}`;

		case "unrecognized_keys":
			return `${message}${pathStr}`;

		case "invalid_string":
			if (message.toLowerCase().includes("email")) {
				return `Invalid email format${pathStr}`;
			}
			if (message.toLowerCase().includes("url") || message.toLowerCase().includes("uri")) {
				return `Invalid URL format${pathStr}`;
			}
			if (message.toLowerCase().includes("uuid")) {
				return `Invalid UUID format${pathStr}`;
			}
			return `${message}${pathStr}`;

		case "too_small":
			return `Value is too small${pathStr}. ${message}`;

		case "too_big":
			return `Value is too large${pathStr}. ${message}`;

		case "invalid_union":
			return `Invalid value${pathStr}. ${message}`;

		case "invalid_enum_value":
			return `${message}${pathStr}`;

		case "invalid_literal":
			return `${message}${pathStr}`;

		default:
			return message ? `${message}${pathStr}` : `Validation error${pathStr}`;
	}
}

/**
 * Get an error code from a Zod issue for diagnostic purposes.
 */
function getErrorCode(issue: ZodIssue): string {
	switch (issue.code) {
		case "invalid_type":
			if (issue.received === "undefined") {
				return "required";
			}
			return "invalid_type";

		case "unrecognized_keys":
			return "unrecognized_key";

		case "invalid_string":
			return "invalid_format";

		case "too_small":
			return "too_small";

		case "too_big":
			return "too_big";

		case "invalid_union":
			return "invalid_union";

		case "invalid_enum_value":
			return "invalid_enum";

		default:
			return "validation_error";
	}
}

/**
 * Try to extract valid keys from a Zod schema at a given path.
 * This is used for "did you mean" suggestions.
 */
function getValidKeysFromSchema(
	schema: z.ZodType,
	path: (string | number)[],
): string[] {
	// Zod schemas don't expose their structure easily at runtime
	// We can try to extract shape from object schemas
	try {
		let current: unknown = schema;

		// Navigate to the path
		for (const segment of path) {
			if (typeof segment === "string") {
				// Try to get shape from object schema
				const shape = (current as { shape?: Record<string, unknown> }).shape;
				if (shape && shape[segment]) {
					current = shape[segment];
				} else {
					return [];
				}
			} else if (typeof segment === "number") {
				// For arrays, try to get element schema
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
