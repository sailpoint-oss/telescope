/**
 * OpenAPI Document Classifier
 *
 * Classifies documents based on their content keys to determine
 * if they are OpenAPI documents.
 *
 * This classifier is designed to be:
 * 1. Fast - Only checks key existence, no deep inspection
 * 2. Accurate - Minimizes false positives with stricter heuristics
 * 3. Comprehensive - Supports root documents and component fragments
 */

/**
 * Known non-OpenAPI file patterns.
 * If a document has these key combinations, it's definitely NOT OpenAPI.
 */
const NON_OPENAPI_PATTERNS = {
	// Kubernetes manifests: apiVersion + kind
	kubernetes: (keys: Set<string>) => keys.has("apiVersion") && keys.has("kind"),

	// Docker Compose: version + services
	dockerCompose: (keys: Set<string>) =>
		keys.has("version") && keys.has("services"),

	// TypeScript/JavaScript config: compilerOptions
	tsconfig: (keys: Set<string>) => keys.has("compilerOptions"),

	// GitHub Actions: on + jobs
	githubActions: (keys: Set<string>) => keys.has("on") && keys.has("jobs"),

	// Package.json: name + version + (dependencies or devDependencies)
	packageJson: (keys: Set<string>) =>
		keys.has("name") &&
		keys.has("version") &&
		(keys.has("dependencies") || keys.has("devDependencies")),

	// ESLint config: rules + (extends or plugins)
	eslintConfig: (keys: Set<string>) =>
		keys.has("rules") && (keys.has("extends") || keys.has("plugins")),

	// Prettier config: typically has multiple formatting options
	prettierConfig: (keys: Set<string>) =>
		keys.has("semi") ||
		keys.has("tabWidth") ||
		keys.has("singleQuote") ||
		keys.has("trailingComma"),

	// Babel config: presets or plugins with babel-specific structure
	babelConfig: (keys: Set<string>) =>
		keys.has("presets") && !keys.has("openapi") && !keys.has("swagger"),

	// Jest config: testEnvironment, testMatch, etc.
	jestConfig: (keys: Set<string>) =>
		keys.has("testEnvironment") ||
		keys.has("testMatch") ||
		keys.has("testPathIgnorePatterns"),

	// Webpack config: entry + output or module + rules
	webpackConfig: (keys: Set<string>) =>
		(keys.has("entry") && keys.has("output")) ||
		(keys.has("module") && keys.has("rules") && !keys.has("openapi")),
} as const;

/**
 * Check if document matches any known non-OpenAPI pattern.
 */
function matchesNonOpenAPIPattern(keys: Set<string>): boolean {
	for (const check of Object.values(NON_OPENAPI_PATTERNS)) {
		if (check(keys)) {
			return true;
		}
	}
	return false;
}

/**
 * Classifies whether a document is an OpenAPI document.
 *
 * This function uses heuristics to determine:
 * 1. If the document matches known non-OpenAPI patterns (reject early)
 * 2. If the document is a root OpenAPI/Swagger spec (has openapi/swagger key)
 * 3. If the document is a component file (schema, parameter, response, etc.)
 * 4. If the document is not an OpenAPI document at all
 *
 * @param root - The parsed root object of a YAML or JSON document
 * @returns true if this is an OpenAPI document, false otherwise
 */
export function isOpenAPIDocument(root: unknown): boolean {
	if (root == null || typeof root !== "object") {
		return false;
	}

	// Arrays are never OpenAPI documents
	if (Array.isArray(root)) {
		return false;
	}

	const obj = root as Record<string, unknown>;
	const keys = new Set(Object.keys(obj));

	// Empty objects are not OpenAPI
	if (keys.size === 0) {
		return false;
	}

	// ========================================================================
	// NEGATIVE CHECKS - Reject known non-OpenAPI patterns first
	// ========================================================================
	if (matchesNonOpenAPIPattern(keys)) {
		return false;
	}

	// ========================================================================
	// ESCAPE HATCH - Explicit marker takes priority
	// ========================================================================
	if (typeof obj["x-openapi-kind"] === "string") {
		return true;
	}

	// ========================================================================
	// ROOT DOCUMENT DETECTION - Most reliable detection
	// ========================================================================
	// Must have openapi/swagger key AND at least one structural key
	if (keys.has("openapi") || keys.has("swagger")) {
		if (keys.has("paths") || keys.has("info") || keys.has("components")) {
			return true;
		}
	}

	// Root-only keys are strong indicators (info, paths, webhooks, etc.)
	const rootOnlyKeys = [
		"info",
		"paths",
		"webhooks",
		"servers",
		"security",
		"tags",
		"externalDocs",
	];
	if (rootOnlyKeys.some((key) => keys.has(key))) {
		return true;
	}

	// ========================================================================
	// COMPONENT FRAGMENT DETECTION - Stricter heuristics to reduce false positives
	// ========================================================================

	// Schema: Require type + (properties | items | $ref | composition)
	// OR composition keywords (allOf, oneOf, anyOf) which are highly specific
	// OR properties alone (very OpenAPI-specific structure)
	// OR $ref alone (reference to another schema)
	if (keys.has("allOf") || keys.has("oneOf") || keys.has("anyOf")) {
		return true;
	}
	if (keys.has("$ref") && keys.size <= 3) {
		// $ref with minimal other keys is likely a schema reference
		return true;
	}
	if (keys.has("properties") && !keys.has("rules")) {
		// properties without 'rules' (avoid eslint configs)
		return true;
	}
	if (
		keys.has("type") &&
		(keys.has("properties") || keys.has("items") || keys.has("enum"))
	) {
		return true;
	}

	// Parameter: name + in + (schema or content) - very specific combination
	if (keys.has("name") && keys.has("in")) {
		const validIn = ["query", "header", "path", "cookie"];
		if (
			typeof obj.in === "string" &&
			validIn.includes(obj.in) &&
			(keys.has("schema") || keys.has("content"))
		) {
			return true;
		}
	}

	// Response: description + (content or headers)
	if (keys.has("description") && (keys.has("content") || keys.has("headers"))) {
		return true;
	}

	// RequestBody: content + (required or description) - require additional context
	if (
		keys.has("content") &&
		(keys.has("required") || keys.has("description"))
	) {
		// Ensure content looks like media type object
		if (typeof obj.content === "object" && obj.content !== null) {
			return true;
		}
	}

	// Header: schema + (required or deprecated or description) without "in"
	if (keys.has("schema") && !keys.has("in")) {
		if (
			keys.has("required") ||
			keys.has("deprecated") ||
			keys.has("description")
		) {
			return true;
		}
	}

	// Example: value + (summary or description or externalValue)
	if (keys.has("value")) {
		if (
			keys.has("summary") ||
			keys.has("description") ||
			keys.has("externalValue")
		) {
			return true;
		}
	}

	// Link: operationId or operationRef (without responses - to distinguish from operations)
	if (
		(keys.has("operationId") || keys.has("operationRef")) &&
		!keys.has("responses")
	) {
		return true;
	}

	// Path Item: has HTTP method keys (get, post, put, delete, etc.)
	// Having HTTP methods at the root level is a strong indicator of a path item file
	const httpMethods = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
	if (httpMethods.some((method) => keys.has(method))) {
		return true;
	}

	// Callback/PathItem: has keys starting with '/' that look like paths
	// Require at least two path-like keys, or one path-like key plus HTTP methods above
	const pathKeyCount = Array.from(keys).filter((key) => key.startsWith("/"))
		.length;
	if (pathKeyCount >= 2) {
		return true;
	}

	// Handle single path-like key when its value contains HTTP methods (callbacks/path items)
	for (const [key, value] of Object.entries(obj)) {
		if (!key.startsWith("/")) continue;
		if (value && typeof value === "object") {
			if (
				httpMethods.some(
					(method) => Object.prototype.hasOwnProperty.call(value, method),
				)
			) {
				return true;
			}
		}
	}

	// Security Scheme: type + (scheme or flows or openIdConnectUrl)
	if (keys.has("type")) {
		const securityTypes = [
			"apiKey",
			"http",
			"oauth2",
			"openIdConnect",
			"mutualTLS",
		];
		if (
			typeof obj.type === "string" &&
			securityTypes.includes(obj.type as string)
		) {
			return true;
		}
	}

	return false;
}
