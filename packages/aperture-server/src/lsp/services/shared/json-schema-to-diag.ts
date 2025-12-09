/**
 * JSON Schema Validation to LSP Diagnostics Converter
 *
 * Uses AJV to validate data against JSON Schema and converts errors to
 * LSP diagnostics with precise source locations. Supports all JSON Schema
 * draft versions (draft-04 through draft-2020-12).
 *
 * @module lsp/services/shared/json-schema-to-diag
 */

import { createHash } from "node:crypto";
import type { Diagnostic } from "@volar/language-server";
import type { ErrorObject } from "ajv";
import Ajv from "ajv";
import Ajv2019 from "ajv/dist/2019.js";
import Ajv2020 from "ajv/dist/2020.js";
import draft04 from "ajv-draft-04";
import addFormats from "ajv-formats";
import type { Range } from "vscode-languageserver-protocol";
import { DiagnosticSeverity } from "vscode-languageserver-protocol";
import type { DataVirtualCode } from "../../languages/virtualCodes/data-virtual-code.js";

/**
 * Supported JSON Schema draft versions
 */
type JsonSchemaDraft =
	| "draft-04"
	| "draft-06"
	| "draft-07"
	| "draft-2019-09"
	| "draft-2020-12";

/**
 * Lazily initialized AJV instances for each draft version.
 * Each instance is configured with formats and appropriate options.
 */
const ajvInstances: Partial<Record<JsonSchemaDraft, Ajv>> = {};

/**
 * Cache of compiled validators keyed by schema content hash.
 * Avoids recompiling the same schema multiple times.
 */
const validatorCache = new Map<
	string,
	{ validator: ReturnType<Ajv["compile"]>; draft: JsonSchemaDraft }
>();

/**
 * Detect the JSON Schema draft version from the $schema field.
 *
 * @param schema - The JSON Schema object
 * @returns The detected draft version, defaults to draft-07
 */
function detectDraftVersion(schema: Record<string, unknown>): JsonSchemaDraft {
	const schemaUri = schema.$schema;
	if (typeof schemaUri !== "string") {
		return "draft-07"; // Default
	}

	if (schemaUri.includes("draft-04")) return "draft-04";
	if (schemaUri.includes("draft-06")) return "draft-06";
	if (schemaUri.includes("draft-07")) return "draft-07";
	if (schemaUri.includes("2019-09")) return "draft-2019-09";
	if (schemaUri.includes("2020-12")) return "draft-2020-12";

	return "draft-07"; // Default for unknown schemas
}

/**
 * Get or create an AJV instance for the specified draft version.
 *
 * @param draft - The JSON Schema draft version
 * @returns Configured AJV instance
 */
function getAjvInstance(draft: JsonSchemaDraft): Ajv {
	if (ajvInstances[draft]) {
		return ajvInstances[draft];
	}

	let ajv: Ajv;

	switch (draft) {
		case "draft-04":
		case "draft-06":
			// draft-04 plugin also handles draft-06
			ajv = new draft04({
				allErrors: true,
				verbose: true,
				strict: false,
			});
			break;

		case "draft-2019-09":
			ajv = new Ajv2019({
				allErrors: true,
				verbose: true,
				strict: false,
			});
			break;

		case "draft-2020-12":
			ajv = new Ajv2020({
				allErrors: true,
				verbose: true,
				strict: false,
			});
			break;

		case "draft-07":
		default:
			ajv = new Ajv({
				allErrors: true,
				verbose: true,
				strict: false,
			});
			break;
	}

	// Add format validation support
	addFormats(ajv);

	ajvInstances[draft] = ajv;
	return ajv;
}

/**
 * Compute a hash of the schema for caching compiled validators.
 *
 * @param schema - The JSON Schema object
 * @returns Hash string
 */
function computeSchemaHash(schema: Record<string, unknown>): string {
	return createHash("sha1")
		.update(JSON.stringify(schema))
		.digest("hex")
		.substring(0, 16);
}

/**
 * Get or create a compiled validator for a schema.
 *
 * @param schema - The JSON Schema object
 * @returns Compiled validator and draft version
 */
function getValidator(schema: Record<string, unknown>): {
	validator: ReturnType<Ajv["compile"]>;
	draft: JsonSchemaDraft;
} {
	const hash = computeSchemaHash(schema);
	const cached = validatorCache.get(hash);
	if (cached) {
		return cached;
	}

	const draft = detectDraftVersion(schema);
	const ajv = getAjvInstance(draft);
	const validator = ajv.compile(schema);

	const result = { validator, draft };
	validatorCache.set(hash, result);
	return result;
}

/**
 * Parse AJV's instancePath into a path array.
 * AJV uses JSON Pointer format: "/foo/bar/0" -> ["foo", "bar", 0]
 *
 * @param instancePath - The AJV error instancePath
 * @returns Array of path segments
 */
function parseInstancePath(instancePath: string): (string | number)[] {
	if (!instancePath || instancePath === "/") {
		return [];
	}

	return instancePath
		.split("/")
		.filter(Boolean)
		.map((segment) => {
			// Decode JSON Pointer escapes
			const decoded = segment.replace(/~1/g, "/").replace(/~0/g, "~");
			// Try to parse as number for array indices
			const num = Number(decoded);
			return Number.isNaN(num) ? decoded : num;
		});
}

/**
 * Get the type of a value as a human-readable string.
 *
 * @param value - The value to get the type of
 * @returns Human-readable type string
 */
function getType(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	if (typeof value === "string") return "string";
	if (typeof value === "number") return Number.isNaN(value) ? "nan" : "number";
	if (typeof value === "boolean") return "boolean";
	if (Array.isArray(value)) return "array";
	if (typeof value === "object") return "object";
	return typeof value;
}

/**
 * Format path string for error messages.
 * Shows "at root" for root-level fields, full path for nested.
 *
 * @param path - The path array
 * @param fieldName - Optional field name to include
 * @returns Formatted path string
 */
function formatPathString(
	path: (string | number)[],
	fieldName?: string,
): string {
	if (fieldName) {
		if (path.length === 0) {
			return ` "${fieldName}" at root`;
		}
		return ` at "${[...path, fieldName].join(".")}"`;
	}

	if (path.length === 0) {
		return "";
	}

	if (path.length === 1) {
		return ` "${path[0]}" at root`;
	}

	return ` at "${path.join(".")}"`;
}

/**
 * Format an AJV error into a user-friendly diagnostic message.
 * Matches the style of Zod diagnostics for consistency.
 *
 * @param error - The AJV error object
 * @param data - The data being validated (for type detection)
 * @returns Formatted error message
 */
function formatAjvErrorMessage(error: ErrorObject, data: unknown): string {
	const path = parseInstancePath(error.instancePath);

	switch (error.keyword) {
		case "required": {
			const missingProperty = error.params?.missingProperty;
			const pathStr = formatPathString(path, missingProperty);
			return `Missing required field${pathStr}`;
		}

		case "type": {
			const expected = error.params?.type;
			const received = getType(error.data);
			const pathStr = formatPathString(path);
			return `Expected ${expected}, received ${received}${pathStr}`;
		}

		case "enum": {
			const allowedValues = error.params?.allowedValues;
			const pathStr = formatPathString(path);
			if (Array.isArray(allowedValues)) {
				return `Invalid value${pathStr}. Expected one of: ${allowedValues.join(", ")}`;
			}
			return `Invalid enum value${pathStr}`;
		}

		case "additionalProperties": {
			const additionalProperty = error.params?.additionalProperty;
			const pathStr = formatPathString(path);
			return `Unrecognized key: "${additionalProperty}"${pathStr}`;
		}

		case "minLength": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `String is too short${pathStr}. Expected at least ${limit} characters`;
		}

		case "maxLength": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `String is too long${pathStr}. Expected at most ${limit} characters`;
		}

		case "minimum": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Number is too small${pathStr}. Expected at least ${limit}`;
		}

		case "maximum": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Number is too large${pathStr}. Expected at most ${limit}`;
		}

		case "exclusiveMinimum": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Number is too small${pathStr}. Expected more than ${limit}`;
		}

		case "exclusiveMaximum": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Number is too large${pathStr}. Expected less than ${limit}`;
		}

		case "minItems": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Array is too short${pathStr}. Expected at least ${limit} items`;
		}

		case "maxItems": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Array is too long${pathStr}. Expected at most ${limit} items`;
		}

		case "minProperties": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Object has too few properties${pathStr}. Expected at least ${limit}`;
		}

		case "maxProperties": {
			const limit = error.params?.limit;
			const pathStr = formatPathString(path);
			return `Object has too many properties${pathStr}. Expected at most ${limit}`;
		}

		case "pattern": {
			const pathStr = formatPathString(path);
			return `String does not match required pattern${pathStr}`;
		}

		case "format": {
			const format = error.params?.format;
			const pathStr = formatPathString(path);

			// Provide friendly messages for common formats
			switch (format) {
				case "email":
					return `Invalid email format${pathStr}`;
				case "uri":
				case "uri-reference":
				case "url":
					return `Invalid URL format${pathStr}`;
				case "uuid":
					return `Invalid UUID format${pathStr}`;
				case "date":
					return `Invalid date format${pathStr}`;
				case "date-time":
					return `Invalid date-time format${pathStr}`;
				case "time":
					return `Invalid time format${pathStr}`;
				case "ipv4":
					return `Invalid IPv4 address${pathStr}`;
				case "ipv6":
					return `Invalid IPv6 address${pathStr}`;
				case "hostname":
					return `Invalid hostname${pathStr}`;
				default:
					return `Invalid ${format} format${pathStr}`;
			}
		}

		case "uniqueItems": {
			const pathStr = formatPathString(path);
			return `Array must contain unique items${pathStr}`;
		}

		case "const": {
			const allowedValue = error.params?.allowedValue;
			const pathStr = formatPathString(path);
			return `Value must be ${JSON.stringify(allowedValue)}${pathStr}`;
		}

		case "multipleOf": {
			const multipleOf = error.params?.multipleOf;
			const pathStr = formatPathString(path);
			return `Number must be a multiple of ${multipleOf}${pathStr}`;
		}

		case "oneOf":
		case "anyOf": {
			const pathStr = formatPathString(path);
			return `Value does not match any allowed schema${pathStr}`;
		}

		case "not": {
			const pathStr = formatPathString(path);
			return `Value should not be valid against the schema${pathStr}`;
		}

		case "if": {
			const pathStr = formatPathString(path);
			return `Conditional validation failed${pathStr}`;
		}

		case "propertyNames": {
			const pathStr = formatPathString(path);
			return `Invalid property name${pathStr}`;
		}

		case "dependencies":
		case "dependentRequired": {
			const missingProperty = error.params?.missingProperty;
			const property = error.params?.property;
			const pathStr = formatPathString(path);
			return `Property "${property}" requires "${missingProperty}" to be present${pathStr}`;
		}

		default: {
			// Fallback: use AJV's message if available
			const pathStr = formatPathString(path);
			if (error.message) {
				return `${error.message}${pathStr}`;
			}
			return `Validation failed (${error.keyword})${pathStr}`;
		}
	}
}

/**
 * Convert JSON Schema validation errors to LSP diagnostics.
 *
 * @param schema - The JSON Schema to validate against
 * @param data - The data to validate
 * @param virtualCode - The DataVirtualCode for range mapping
 * @param source - Source identifier for diagnostics (default: "json-schema")
 * @returns Array of LSP Diagnostic objects
 */
export function jsonSchemaErrorsToDiagnostics(
	schema: Record<string, unknown>,
	data: unknown,
	virtualCode: DataVirtualCode,
	source: string = "json-schema",
): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];

	const defaultRange: Range = {
		start: { line: 0, character: 0 },
		end: { line: 0, character: 0 },
	};

	// Get or compile the validator
	let validator: ReturnType<Ajv["compile"]>;
	try {
		const result = getValidator(schema);
		validator = result.validator;
	} catch (e) {
		// Schema compilation failed - report as a single diagnostic
		diagnostics.push({
			range: defaultRange,
			message: `Failed to compile JSON Schema: ${e instanceof Error ? e.message : String(e)}`,
			severity: DiagnosticSeverity.Error,
			source,
			code: "schema-compilation-error",
		});
		return diagnostics;
	}

	// Validate the data
	const valid = validator(data);

	if (valid || !validator.errors) {
		return diagnostics;
	}

	// Convert each AJV error to a diagnostic
	for (const error of validator.errors) {
		const path = parseInstancePath(error.instancePath);
		let range: Range | undefined;
		let forceIncludePath = false;

		// Special handling for missing required fields
		if (error.keyword === "required") {
			const missingProperty = error.params?.missingProperty;
			if (missingProperty) {
				// Try to get the range of the parent object's first key
				range = virtualCode.getFirstKeyRange(path);

				if (!range) {
					range = virtualCode.getFirstKeyRange([]);
				}

				if (!range) {
					range =
						virtualCode.getRange(path) ??
						virtualCode.getRange([]) ??
						defaultRange;
				}

				forceIncludePath = true;
			}
		}

		// Special handling for additionalProperties - highlight the specific key
		if (error.keyword === "additionalProperties") {
			const additionalProperty = error.params?.additionalProperty;
			if (additionalProperty) {
				const keyPath = [...path, additionalProperty];
				range = virtualCode.getRange(keyPath);
			}
		}

		// Default: try to get range for the error path
		if (!range) {
			range = virtualCode.getRange(path);
		}

		// Fallback to parent, root, or default
		if (!range && path.length > 0) {
			const parentPath = path.slice(0, -1);
			range =
				virtualCode.getRange(parentPath) ??
				virtualCode.getRange([]) ??
				defaultRange;
			forceIncludePath = true;
		}

		if (!range) {
			range = virtualCode.getRange([]) ?? defaultRange;
			forceIncludePath = path.length > 0;
		}

		diagnostics.push({
			range,
			message: formatAjvErrorMessage(error, data),
			severity: DiagnosticSeverity.Error,
			source,
			code: error.keyword,
		});
	}

	return diagnostics;
}

/**
 * Clear the validator cache. Useful for testing or when schemas change.
 */
export function clearValidatorCache(): void {
	validatorCache.clear();
}
