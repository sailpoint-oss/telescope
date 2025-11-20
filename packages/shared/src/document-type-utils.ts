/**
 * Document type detection utilities.
 * Detects whether a parsed OpenAPI document is a root document or a partial fragment.
 * Moved to shared package to break circular dependencies.
 */

export type DocumentType =
	| "openapi-root"
	| "path-item"
	| "operation"
	| "components"
	| "schema"
	| "parameter"
	| "response"
	| "security-scheme"
	| "example"
	| "unknown";

const HTTP_METHODS = [
	"get",
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
] as const;

const ROOT_ONLY_KEYS = ["info", "paths", "components", "webhooks"] as const;

/**
 * Attempt to detect the OpenAPI document level/type.
 * @param obj The raw parsed object (usually from YAML or JSON).
 * @returns The detected OpenAPI document type as a string.
 */
export function identifyDocumentType(obj: unknown): DocumentType {
	if (!obj || typeof obj !== "object") {
		return "unknown";
	}
	const data = obj as Record<string, unknown>;

	// OpenAPI root object indicators
	if (typeof data.openapi === "string") {
		return "openapi-root";
	}

	const rootKey = ROOT_ONLY_KEYS.find((key) => data[key] !== undefined);
	if (rootKey) {
		return "openapi-root";
	}

	// Path Item Object: keys are HTTP methods, values are operation objects
	const hasHttpMethod = Object.entries(data).some(([key, value]) => {
		const method = key.toLowerCase() as (typeof HTTP_METHODS)[number];
		return (
			HTTP_METHODS.includes(method) &&
			value !== null &&
			typeof value === "object"
		);
	});
	if (hasHttpMethod && !data.openapi) {
		return "path-item";
	}

	// Operation Object (looks for operationId or summary - crude detection)
	if (
		typeof data.operationId === "string" ||
		typeof data.summary === "string"
	) {
		// Should NOT have openapi, but usually has 'responses'
		if (data.responses && typeof data.responses === "object") {
			return "operation";
		}
	}

	// Components/root schemas
	if (data.components) {
		return "components";
	}

	// Security Scheme object: has "type", "scheme", or "flows"
	if (
		(typeof data.type === "string" &&
			data.type.match(/apiKey|http|oauth2|openIdConnect/)) ||
		data.flows
	) {
		return "security-scheme";
	}

	// If this looks like a schema object ("type" is common prop, or "$ref" object)
	if (
		typeof data.type === "string" ||
		typeof data.allOf === "object" ||
		typeof data.$ref === "string"
	) {
		return "schema";
	}

	// Parameter object: has "name" and "in"
	if (
		typeof data.name === "string" &&
		typeof data.in === "string" &&
		!data.openapi
	) {
		return "parameter";
	}

	// Response object: must have "description", optionally "content" or "schema"
	if (
		typeof data.description === "string" &&
		(data.content !== undefined || data.schema !== undefined)
	) {
		return "response";
	}

	// Example object: identified by Example fixed fields (summary, description, value, externalValue)
	const hasExampleValueField = Object.hasOwn(data, "value");
	const hasExampleExternalValue = typeof data.externalValue === "string";
	const hasExampleFixedField =
		hasExampleValueField ||
		hasExampleExternalValue ||
		typeof data.summary === "string" ||
		typeof data.description === "string";
	if (
		hasExampleFixedField &&
		(hasExampleValueField || hasExampleExternalValue)
	) {
		return "example";
	}

	return "unknown";
}

/**
 * Check if a document is a root OpenAPI document.
 * A document is considered a root if it has openapi field,
 * even if it's incomplete (missing info/paths).
 */
export function isRootDocument(obj: unknown): boolean {
	if (!obj || typeof obj !== "object") {
		return false;
	}
	const data = obj as Record<string, unknown>;

	const hasOpenApiVersion = typeof data.openapi === "string";
	const rootKey = hasOpenApiVersion
		? null
		: (ROOT_ONLY_KEYS.find((key) => data[key] !== undefined) ?? null);

	if (hasOpenApiVersion) {
		return true;
	}

	if (rootKey) {
		return true;
	}

	return false;
}

/**
 * Check if a document is a partial/fragment document.
 */
export function isPartialDocument(obj: unknown): boolean {
	const type = identifyDocumentType(obj);
	return type !== "openapi-root" && type !== "unknown";
}

