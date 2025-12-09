/**
 * Document Type Detection Utilities
 *
 * This module provides unified, fast, and bulletproof detection of OpenAPI
 * document types. It is the single source of truth for document type
 * identification throughout the codebase.
 *
 * Detection is designed to be:
 * 1. **Fast**: Quick early returns for common cases
 * 2. **Bulletproof**: Handles edge cases and malformed documents
 * 3. **Unified**: Single implementation used everywhere
 *
 * Supported document types:
 * - `root`: Full OpenAPI documents (3.0, 3.1, 3.2, Swagger 2.0)
 * - `path-item`: Path item definitions (/users, /users/{id})
 * - `operation`: Operation definitions (GET, POST responses)
 * - `schema`: Schema definitions (type, properties, allOf, etc.)
 * - `parameter`: Parameter definitions (query, path, header, cookie)
 * - `response`: Response definitions
 * - `request-body`: Request body definitions
 * - And more...
 *
 * @module utils/document-type-utils
 *
 * @example
 * ```typescript
 * import { identifyDocumentType, isRootDocument } from "aperture-server";
 *
 * // Identify full document type
 * identifyDocumentType({ openapi: "3.1.0", info: { ... } });
 * // "root"
 *
 * // Quick check for root documents
 * isRootDocument({ openapi: "3.1.0" });
 * // true
 *
 * // Identify fragment types
 * identifyDocumentType({ type: "object", properties: { ... } });
 * // "schema"
 * ```
 */

/**
 * Recognized OpenAPI document element types.
 *
 * @example
 * ```typescript
 * const type: DocumentType = identifyDocumentType(doc);
 * switch (type) {
 *   case "root":
 *     // Handle full document
 *     break;
 *   case "schema":
 *     // Handle schema fragment
 *     break;
 *   case "unknown":
 *     // Not an OpenAPI element
 *     break;
 * }
 * ```
 */
export type DocumentType =
	| "root"
	| "path-item"
	| "operation"
	| "components"
	| "schema"
	| "parameter"
	| "response"
	| "request-body"
	| "header"
	| "security-scheme"
	| "example"
	| "link"
	| "callback"
	| "json-schema"
	| "unknown";

/**
 * HTTP methods as defined in OpenAPI specification.
 * Includes "query" for OpenAPI 3.2+ support.
 */
const HTTP_METHODS = new Set([
	"get",
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
	"query", // OpenAPI 3.2+
]);

/**
 * Keys that only appear at the OpenAPI root level.
 */
const ROOT_ONLY_KEYS = new Set([
	"info",
	"paths",
	"components",
	"webhooks",
	"servers",
	"security",
	"tags",
	"externalDocs",
]);

/**
 * OpenAPI version patterns.
 */
const OPENAPI_VERSION_REGEX = /^3\.(0|1|2)\.\d+$/;
const SWAGGER_VERSION_REGEX = /^2\.\d+$/;

/**
 * Valid parameter locations.
 */
const PARAMETER_LOCATIONS = new Set(["query", "header", "path", "cookie"]);

/**
 * Security scheme types.
 */
const SECURITY_SCHEME_TYPES = new Set([
	"apiKey",
	"http",
	"oauth2",
	"openIdConnect",
	"mutualTLS",
]);

/**
 * JSON Schema keywords that indicate a standalone schema.
 */
const JSON_SCHEMA_KEYWORDS = new Set([
	"$schema",
	"$id",
	"$defs",
	"definitions",
]);

/**
 * Fast check if a value is a non-null object.
 *
 * @param value - Value to check
 * @returns true if value is a non-null, non-array object
 *
 * @internal
 */
function isObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Detect the OpenAPI document type from a parsed object.
 *
 * Detection order is optimized for common cases:
 * 1. OpenAPI root (most common for complete documents)
 * 2. JSON Schema (standalone schema with $schema, $id, etc.)
 * 3. Path item (contains HTTP method keys)
 * 4. Operation (has responses)
 * 5. Parameter (has name and in)
 * 6. Response (has description with content/headers)
 * 7. Other component types
 * 8. Schema (has type, properties, allOf, etc.)
 * 9. Unknown
 *
 * @param obj - The raw parsed object (from YAML or JSON)
 * @returns The detected document type
 *
 * @example
 * ```typescript
 * // Full OpenAPI document
 * identifyDocumentType({ openapi: "3.1.0", info: { title: "API", version: "1.0" } });
 * // "root"
 *
 * // Path item fragment
 * identifyDocumentType({ get: { responses: { 200: { description: "OK" } } } });
 * // "path-item"
 *
 * // Schema fragment
 * identifyDocumentType({ type: "object", properties: { id: { type: "string" } } });
 * // "schema"
 *
 * // Parameter fragment
 * identifyDocumentType({ name: "id", in: "path", required: true });
 * // "parameter"
 *
 * // Unknown
 * identifyDocumentType({ foo: "bar" });
 * // "unknown"
 * ```
 */
export function identifyDocumentType(obj: unknown): DocumentType {
	// Fast fail: not an object
	if (!isObject(obj)) {
		return "unknown";
	}

	// === FAST PATH: OpenAPI Root Detection ===
	// Most common case for complete documents

	// Check for explicit openapi version field
	if (typeof obj.openapi === "string") {
		// Validate it looks like a real version
		if (OPENAPI_VERSION_REGEX.test(obj.openapi)) {
			return "root";
		}
	}

	// Check for Swagger 2.0
	if (typeof obj.swagger === "string") {
		if (SWAGGER_VERSION_REGEX.test(obj.swagger)) {
			return "root";
		}
	}

	// Check for root-only keys (info, paths, components, etc.)
	for (const key of Object.keys(obj)) {
		if (ROOT_ONLY_KEYS.has(key)) {
			return "root";
		}
	}

	// === JSON Schema Detection ===
	// Check for JSON Schema specific keywords
	for (const key of JSON_SCHEMA_KEYWORDS) {
		if (key in obj) {
			return "json-schema";
		}
	}

	// === Path Item Detection ===
	// A path item has HTTP method keys pointing to operation objects
	const objKeys = Object.keys(obj);
	const httpMethodKeys = objKeys.filter((k) =>
		HTTP_METHODS.has(k.toLowerCase()),
	);
	if (httpMethodKeys.length > 0) {
		// Verify at least one HTTP method value is an object
		const hasValidOperation = httpMethodKeys.some((k) => isObject(obj[k]));
		if (hasValidOperation) {
			return "path-item";
		}
	}

	// === Operation Detection ===
	// Operations have responses (required) and typically operationId or summary
	if (isObject(obj.responses)) {
		// Has responses object - strong indicator of operation
		if (
			typeof obj.operationId === "string" ||
			typeof obj.summary === "string"
		) {
			return "operation";
		}
		// Even without operationId/summary, responses object is a strong indicator
		// Check it has at least one status code key
		const responseKeys = Object.keys(obj.responses);
		if (responseKeys.length > 0) {
			return "operation";
		}
	}

	// === Parameter Detection ===
	// Parameters have required "name" and "in" fields
	if (typeof obj.name === "string" && typeof obj.in === "string") {
		if (PARAMETER_LOCATIONS.has(obj.in)) {
			return "parameter";
		}
	}

	// === Response Detection ===
	// Responses have required "description" field
	if (typeof obj.description === "string") {
		// Check for content or headers (response indicators)
		if (isObject(obj.content) || isObject(obj.headers)) {
			return "response";
		}
	}

	// === Request Body Detection ===
	// Request bodies have "content" field
	if (
		isObject(obj.content) &&
		!("description" in obj && isObject(obj.headers))
	) {
		// Has content but not headers - likely request body
		if (
			typeof obj.required === "boolean" ||
			typeof obj.description === "string"
		) {
			return "request-body";
		}
	}

	// === Header Detection ===
	// Headers look like parameters but don't have "name" or "in"
	if (isObject(obj.schema) && typeof obj.deprecated === "boolean") {
		return "header";
	}

	// === Security Scheme Detection ===
	if (typeof obj.type === "string" && SECURITY_SCHEME_TYPES.has(obj.type)) {
		return "security-scheme";
	}
	// OAuth2 flows without explicit type
	if (isObject(obj.flows)) {
		return "security-scheme";
	}

	// === Example Detection ===
	// Examples have "value" or "externalValue" field
	if ("value" in obj || typeof obj.externalValue === "string") {
		return "example";
	}

	// === Link Detection ===
	// Links have operationRef or operationId with parameters
	if (
		(typeof obj.operationRef === "string" ||
			typeof obj.operationId === "string") &&
		!isObject(obj.responses) // Distinguish from operation
	) {
		return "link";
	}

	// === Callback Detection ===
	// Callbacks are objects where keys are runtime expressions
	const callbackKeys = Object.keys(obj);
	if (callbackKeys.length > 0 && callbackKeys.some((k) => k.includes("{"))) {
		// Has expression-like keys
		return "callback";
	}

	// === Schema Detection ===
	// Schema objects have type, properties, allOf, oneOf, anyOf, $ref, etc.
	const schemaIndicators = [
		"type",
		"properties",
		"allOf",
		"oneOf",
		"anyOf",
		"items",
		"$ref",
		"enum",
	];
	for (const indicator of schemaIndicators) {
		if (indicator in obj) {
			return "schema";
		}
	}

	// Could not determine type
	return "unknown";
}

/**
 * Check if a document is a root OpenAPI document.
 *
 * A document is considered a root if:
 * 1. Has openapi/swagger version field, OR
 * 2. Has any root-only key (info, paths, components, etc.)
 *
 * This is a fast check that doesn't require full type detection.
 *
 * @param obj - The parsed document object
 * @returns true if this is a root OpenAPI document
 *
 * @example
 * ```typescript
 * isRootDocument({ openapi: "3.1.0" });
 * // true
 *
 * isRootDocument({ info: { title: "API" } });
 * // true (has root-only key)
 *
 * isRootDocument({ type: "object" });
 * // false (just a schema)
 * ```
 */
export function isRootDocument(obj: unknown): boolean {
	if (!isObject(obj)) {
		return false;
	}

	// Check for explicit version field
	if (typeof obj.openapi === "string" || typeof obj.swagger === "string") {
		return true;
	}

	// Check for root-only keys
	for (const key of Object.keys(obj)) {
		if (ROOT_ONLY_KEYS.has(key)) {
			return true;
		}
	}

	return false;
}

/**
 * Check if a document is a partial/fragment document.
 *
 * A partial document is any recognized OpenAPI element type that is
 * not a full root document. This includes schemas, path items,
 * parameters, etc.
 *
 * @param obj - The parsed document object
 * @returns true if this is a recognized OpenAPI fragment (not root or unknown)
 *
 * @example
 * ```typescript
 * isPartialDocument({ type: "object" });
 * // true (schema fragment)
 *
 * isPartialDocument({ openapi: "3.1.0" });
 * // false (root document)
 *
 * isPartialDocument({ foo: "bar" });
 * // false (unknown type)
 * ```
 */
export function isPartialDocument(obj: unknown): boolean {
	const type = identifyDocumentType(obj);
	return type !== "root" && type !== "unknown";
}
