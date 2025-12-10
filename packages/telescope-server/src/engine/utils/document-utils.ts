/**
 * Document Utilities
 *
 * This module provides utilities for working with OpenAPI documents,
 * including URI normalization and heuristic document detection.
 *
 * @module utils/document-utils
 *
 * @example
 * ```typescript
 * import { normalizeBaseUri, mightBeOpenAPIDocument, isValidOpenApiFile } from "telescope-server";
 *
 * // Normalize a URI
 * normalizeBaseUri("file:///api.yaml#/paths");
 * // "file:///api.yaml"
 *
 * // Quick check if file might be OpenAPI
 * if (mightBeOpenAPIDocument(uri, text)) {
 *   // Worth parsing
 * }
 *
 * // Full validation check
 * if (isValidOpenApiFile(uri, text)) {
 *   // Definitely an OpenAPI or fragment file
 * }
 * ```
 */

import { URI } from "vscode-uri";
import YAML from "yaml";
import { identifyDocumentType } from "./document-type-utils.js";

/**
 * Normalize a URI by removing hash (fragment) and query parameters.
 *
 * This returns the base URI suitable for file operations, stripping
 * any fragment identifiers or query strings.
 *
 * @param uri - The URI to normalize
 * @returns The normalized base URI string
 * @throws Error if the URI is invalid (empty or malformed)
 *
 * @example
 * ```typescript
 * normalizeBaseUri("file:///api.yaml#/paths/~1users");
 * // "file:///api.yaml"
 *
 * normalizeBaseUri("file:///api.yaml?version=1");
 * // "file:///api.yaml"
 *
 * normalizeBaseUri("file:///api.yaml#/paths?query=value");
 * // "file:///api.yaml"
 * ```
 */
export function normalizeBaseUri(uri: string): string {
	const s = uri.split("#")?.[0]?.split("?")?.[0];
	if (!s) {
		throw new Error(`Invalid URI: ${uri}`);
	}
	return s;
}

/**
 * Extract pathname from URI for file operations.
 *
 * @param uri - URI string (file://, http://, etc.)
 * @returns Pathname portion of the URI, or the original string if not parseable
 *
 * @internal
 */
function toPathname(uri: string): string | null {
	try {
		if (uri.startsWith("file://") || /^[a-zA-Z]+:\/\//.test(uri)) {
			return new URL(uri).pathname;
		}
	} catch {
		return uri;
	}
	return uri;
}

/**
 * Quick heuristic check if a file might be an OpenAPI document.
 *
 * This is a fast check that doesn't require full parsing. It examines
 * the filename and first few lines of content to filter out files
 * that are definitely not OpenAPI documents.
 *
 * Use this as a pre-filter before more expensive parsing operations.
 *
 * Files that return false:
 * - Known non-OpenAPI files (package.json, tsconfig.json, etc.)
 * - Telescope config files
 * - JSON files without OpenAPI indicators that look like npm packages
 *
 * @param uri - The file URI
 * @param text - The file content
 * @returns true if the file might be OpenAPI, false if definitely not
 *
 * @example
 * ```typescript
 * // Skip known non-OpenAPI files
 * mightBeOpenAPIDocument("file:///package.json", '{"name": "foo"}');
 * // false
 *
 * // Likely OpenAPI - has openapi field
 * mightBeOpenAPIDocument("file:///api.yaml", "openapi: 3.1.0");
 * // true
 *
 * // Unknown - might be a schema fragment
 * mightBeOpenAPIDocument("file:///User.yaml", "type: object\nproperties:");
 * // true
 * ```
 */
export function mightBeOpenAPIDocument(uri: string, text: string): boolean {
	const path = toPathname(uri);
	if (!path) return true;

	const filename = path.toLowerCase();
	const knownNonOpenAPIFiles = [
		"package.json",
		"package-lock.json",
		"pnpm-lock.yaml",
		"yarn.lock",
		"tsconfig.json",
		"jsconfig.json",
		"biome.json",
		".prettierrc.json",
		".prettierrc.yaml",
		".prettierrc.yml",
		".eslintrc.json",
		".eslintrc.yaml",
		".eslintrc.yml",
	];

	if (knownNonOpenAPIFiles.some((file) => filename.endsWith(file))) {
		return false;
	}

	// Exclude Telescope config file
	if (
		filename.includes("/.telescope/config.yaml") ||
		filename.endsWith(".telescope/config.yaml")
	) {
		return false;
	}

	const lines = text.split("\n").slice(0, 10).join("\n");
	const hasOpenAPIIndicator =
		/"openapi":/i.test(lines) || /^openapi:/m.test(lines);

	if (/\.json$/i.test(path) && !hasOpenAPIIndicator) {
		if (/"name":|"version":|"dependencies":|"devDependencies":/i.test(lines)) {
			return false;
		}
	}

	return true;
}

/**
 * Check if a file is a valid OpenAPI or partial OpenAPI document.
 *
 * This performs a full parse of the document and uses identifyDocumentType
 * to determine if it's a known OpenAPI element type.
 *
 * @param uri - The file URI
 * @param text - The file content
 * @returns true if the document is a valid OpenAPI or fragment type
 *
 * @example
 * ```typescript
 * // Full OpenAPI document
 * isValidOpenApiFile("file:///api.yaml", "openapi: 3.1.0\ninfo:\n  title: API");
 * // true
 *
 * // Schema fragment
 * isValidOpenApiFile("file:///User.yaml", "type: object\nproperties:\n  id:\n    type: string");
 * // true
 *
 * // Random YAML
 * isValidOpenApiFile("file:///config.yaml", "key: value\nother: thing");
 * // false (unknown type)
 *
 * // Invalid YAML
 * isValidOpenApiFile("file:///broken.yaml", "invalid: [unclosed");
 * // false (parse error)
 * ```
 */
export function isValidOpenApiFile(uri: string, text: string): boolean {
	// First do a quick heuristic check
	if (!mightBeOpenAPIDocument(uri, text)) {
		return false;
	}

	try {
		// Parse the document based on format
		let ast: unknown;
		const path = toPathname(uri);
		const isYaml = path && /\.ya?ml$/i.test(path);

		if (isYaml || /^\s*openapi:/m.test(text)) {
			// YAML format
			const document = YAML.parseDocument(text);
			if (document.errors.length > 0) {
				return false;
			}
			ast = document.toJSON();
		} else {
			// JSON format
			ast = JSON.parse(text);
		}

		// Check document type - skip "unknown" types
		const docType = identifyDocumentType(ast);
		return docType !== "unknown";
	} catch {
		// If parsing fails, it's not a valid OpenAPI document
		return false;
	}
}
