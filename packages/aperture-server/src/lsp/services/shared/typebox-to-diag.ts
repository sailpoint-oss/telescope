import type { Diagnostic } from "@volar/language-server";
import { closest } from "fastest-levenshtein";
import type { TSchema } from "typebox";
import { Value, type ValueError } from "typebox/value";
import type { Range } from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";

/**
 * Convert TypeBox validation errors into Volar diagnostics using DataVirtualCode.
 * This is the preferred method as it works with both YAML and JSON documents
 * and uses the unified getRange() abstraction.
 *
 * @param schema - The TypeBox schema that was used for validation
 * @param value - The value that was validated
 * @param virtualCode - The DataVirtualCode containing the parsed document
 * @param source - Optional source identifier for the diagnostics (default: "typebox-schema")
 * @returns Array of Volar Diagnostic objects with proper ranges and messages
 */
export function typeboxErrorsToDiagnostics(
	schema: TSchema,
	value: unknown,
	virtualCode: DataVirtualCode,
	source: string = "typebox-schema",
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	const defaultRange: Range = {
		start: { line: 0, character: 0 },
		end: { line: 0, character: 0 },
	};

	// Collect all errors
	const errors = [...Value.Errors(schema, value)];

	for (const error of errors) {
		// Convert JSON pointer path to array format
		const path = pointerToPath(error.path);

		// Try to get the range for this path
		let range = virtualCode.getRange(path);
		let forceIncludePath = false;

		// Special handling for missing values
		if (error.message.includes("Required") && !range) {
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

		// Special handling for additional properties (unrecognized keys)
		if (
			error.message.includes("Unexpected property") ||
			error.type === 53 // ValueErrorType.ObjectAdditionalProperties
		) {
			// Get valid keys for suggestions
			const validKeys = getValidKeysForPath(schema, path.slice(0, -1));

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
			message: formatTypeBoxErrorMessage(error, path, forceIncludePath || !range),
			severity: DiagnosticSeverity.Error,
			source,
			code: getErrorCode(error),
		});
	}

	return diagnostics;
}

/**
 * Convert a JSON pointer string to an array path.
 * E.g., "/foo/bar/0" -> ["foo", "bar", 0]
 */
function pointerToPath(pointer: string): (string | number)[] {
	if (!pointer || pointer === "") return [];
	// Remove leading slash and split
	const segments = pointer.slice(1).split("/");
	return segments.map((segment) => {
		// Decode JSON pointer escapes
		const decoded = segment.replace(/~1/g, "/").replace(/~0/g, "~");
		// Try to parse as number for array indices
		const num = Number.parseInt(decoded, 10);
		return !Number.isNaN(num) && String(num) === decoded ? num : decoded;
	});
}

/**
 * Format a TypeBox error into a user-friendly diagnostic message.
 */
function formatTypeBoxErrorMessage(
	error: ValueError,
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

	const message = error.message;

	// Handle specific TypeBox error patterns
	if (message.includes("Expected")) {
		// TypeBox format: "Expected X but received Y"
		// Make it more user-friendly
		if (message.includes("Required property")) {
			const match = message.match(/Required property \[([^\]]+)\]/);
			if (match) {
				return `Missing required field${pathStr}. ${message}`;
			}
		}

		// Check for missing/undefined values
		if (message.includes("undefined")) {
			return `Missing required field${pathStr}. ${message}`;
		}

		return `${message}${pathStr}`;
	}

	// Handle format validation errors
	if (message.includes("format")) {
		if (message.toLowerCase().includes("email")) {
			return `Invalid email format${pathStr}`;
		}
		if (message.toLowerCase().includes("uri") || message.toLowerCase().includes("url")) {
			return `Invalid URL format${pathStr}`;
		}
		if (message.toLowerCase().includes("uuid")) {
			return `Invalid UUID format${pathStr}`;
		}
	}

	// Handle string length constraints
	if (message.includes("minLength") || message.includes("minimum length")) {
		return `String is too short${pathStr}. ${message}`;
	}
	if (message.includes("maxLength") || message.includes("maximum length")) {
		return `String is too long${pathStr}. ${message}`;
	}

	// Handle number constraints
	if (message.includes("minimum") || message.includes("exclusiveMinimum")) {
		return `Number is too small${pathStr}. ${message}`;
	}
	if (message.includes("maximum") || message.includes("exclusiveMaximum")) {
		return `Number is too large${pathStr}. ${message}`;
	}

	// Handle array constraints
	if (message.includes("minItems")) {
		return `Array is too short${pathStr}. ${message}`;
	}
	if (message.includes("maxItems")) {
		return `Array is too long${pathStr}. ${message}`;
	}

	// Handle union type errors
	if (message.includes("union") || message.includes("Union")) {
		return `Invalid value${pathStr}. ${message}`;
	}

	// Handle additional/unexpected properties
	if (message.includes("Unexpected property") || message.includes("additional properties")) {
		return `${message}${pathStr}`;
	}

	// Default: use the TypeBox message with path
	return message ? `${message}${pathStr}` : `Validation error${pathStr}`;
}

/**
 * Get an error code from a TypeBox error for diagnostic purposes.
 */
function getErrorCode(error: ValueError): string {
	const message = error.message.toLowerCase();

	if (message.includes("required") || message.includes("undefined")) {
		return "required";
	}
	if (message.includes("expected")) {
		return "invalid_type";
	}
	if (message.includes("unexpected property") || message.includes("additional")) {
		return "unrecognized_key";
	}
	if (message.includes("format")) {
		return "invalid_format";
	}
	if (message.includes("minimum") || message.includes("too small") || message.includes("minlength") || message.includes("minitems")) {
		return "too_small";
	}
	if (message.includes("maximum") || message.includes("too large") || message.includes("maxlength") || message.includes("maxitems")) {
		return "too_big";
	}
	if (message.includes("union")) {
		return "invalid_union";
	}

	return "validation_error";
}

/**
 * Get the type of a value as a string.
 */
function getType(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return "string";
	if (typeof value === "number") return Number.isNaN(value) ? "nan" : "number";
	if (typeof value === "boolean") return "boolean";
	if (typeof value === "symbol") return "symbol";
	if (Array.isArray(value)) return "array";
	if (value instanceof Date) return "date";
	if (value instanceof Error) return "error";
	if (typeof value === "object") return "object";
	if (typeof value === "function") return "function";
	return "unknown";
}

/**
 * Check if a schema is an object schema by looking at its properties.
 */
function isObjectSchema(schema: TSchema): schema is TSchema & { properties: Record<string, TSchema> } {
	return typeof schema === "object" && schema !== null && "properties" in schema && typeof schema.properties === "object";
}

/**
 * Check if a schema is an array schema by looking at its properties.
 */
function isArraySchema(schema: TSchema): schema is TSchema & { items: TSchema } {
	return typeof schema === "object" && schema !== null && "items" in schema;
}

/**
 * Check if a schema is a union schema by looking at its properties.
 */
function isUnionSchema(schema: TSchema): schema is TSchema & { anyOf: TSchema[] } {
	return typeof schema === "object" && schema !== null && "anyOf" in schema && Array.isArray(schema.anyOf);
}

/**
 * Check if a schema is a record schema by looking at its properties.
 */
function isRecordSchema(schema: TSchema): schema is TSchema & { patternProperties: Record<string, TSchema> } {
	return typeof schema === "object" && schema !== null && "patternProperties" in schema;
}

/**
 * Unwrap optional/nullable schema wrapper.
 */
function unwrapSchema(schema: TSchema): TSchema {
	// Check for TypeBox wrapped schemas (Optional, Nullable, etc.)
	const anySchema = schema as Record<string, unknown>;
	if (anySchema.type === undefined && anySchema.anyOf) {
		// Could be a nullable - try to get first non-null type
		const anyOfArray = anySchema.anyOf as TSchema[];
		for (const option of anyOfArray) {
			if ((option as Record<string, unknown>).type !== "null") {
				return option;
			}
		}
	}
	return schema;
}

/**
 * Traverse a TypeBox schema to find valid keys for a specific path.
 */
function getValidKeysForPath(
	schema: TSchema,
	path: (string | number)[],
): string[] {
	if (!schema) return [];

	const unwrapped = unwrapSchema(schema);

	if (path.length === 0) {
		// At the target - extract keys from object schema
		if (isObjectSchema(unwrapped)) {
			return Object.keys(unwrapped.properties);
		}
		if (isUnionSchema(unwrapped)) {
			const allKeys = new Set<string>();
			for (const option of unwrapped.anyOf) {
				const keys = getValidKeysForPath(option, []);
				for (const k of keys) {
					allKeys.add(k);
				}
			}
			return Array.from(allKeys);
		}
		return [];
	}

	const [head, ...tail] = path;

	if (isObjectSchema(unwrapped)) {
		if (typeof head === "string" && unwrapped.properties[head]) {
			return getValidKeysForPath(unwrapped.properties[head], tail);
		}
		return [];
	}

	if (isArraySchema(unwrapped)) {
		return getValidKeysForPath(unwrapped.items, tail);
	}

	if (isUnionSchema(unwrapped)) {
		const allKeys = new Set<string>();
		for (const option of unwrapped.anyOf) {
			const keys = getValidKeysForPath(option, path);
			for (const k of keys) {
				allKeys.add(k);
			}
		}
		return Array.from(allKeys);
	}

	if (isRecordSchema(unwrapped)) {
		// For records, continue with the value schema
		const valueSchema = unwrapped.patternProperties["^(.*)$"];
		if (valueSchema) {
			return getValidKeysForPath(valueSchema, tail);
		}
	}

	return [];
}
